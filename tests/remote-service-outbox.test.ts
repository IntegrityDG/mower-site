/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import test from "node:test";
import { Buffer } from "node:buffer";
import { PDFDocument } from "pdf-lib";
import * as policy from "../lib/service/policy";
import * as report from "../lib/service/warranty-pdf";
import * as validation from "../lib/service/validation";
import { loadInstallationModule } from "./helpers/installation-module";

const snapshot = (): report.WarrantyReportSnapshot => {
  const sheet = { ...structuredClone(policy.EMPTY_WORK_SHEET), diagnosis: "Failed sensor", workPerformed: "Replaced sensor", testing: "Test passed", resolution: "Repaired", labor: [{ id: "line", date: "2026-09-09", minutes: 120, description: "Diagnosis and repair", technicianId: "tech" }], manufacturerReimbursementCents: 16000 };
  return { case: { id: "case", case_number: "IDS-SYNTHETIC", status: "resolved", warranty_status: "verified", customer_name: "Synthetic customer", customer_phone: "5550000000", customer_email: "synthetic@example.invalid", equipment: { manufacturer: "Synthetic", model: "Test", serial: "SYNTHETIC", purchaseDate: "2026-01", purchasedFrom: "IDS" }, arrangement: "shop_dropoff", issue_notes: "Sensor error", resolution_notes: "Repair verified", resolved_at: "2026-09-09T00:00:00Z", assigned_staff_id: "tech" } as report.WarrantyReportSnapshot["case"], invoice: { id: "invoice", case_id: "case", status: "finalized", sheet, pricing: policy.DEFAULT_SERVICE_PRICING, totals: policy.calculateInvoice(sheet, { warranty: true, remote: false, subscriberEligible: false }), subscriber_eligible: false, payment_status: "not_due", review_notes: "", finalized_at: "2026-09-09T00:00:00Z", version: 3 }, technicians: { tech: "Synthetic technician" } };
};
function harness(email = true) {
  const sent: any[] = [], calls: any[] = [], patches: any[] = [], filters: any[] = [];
  const jobs: any[] = [];
  let deliveryFailure = false;
  const database = { from(table: string) {
    let patch: any;
    const query: any = { select: () => query, in: (field: string, values: string[]) => { filters.push([field, values]); return query; }, lte: () => query, order: () => query, limit: () => query, eq: () => query,
      update: (data: any) => { patch = data; patches.push({ table, ...data }); return query; },
      then(resolve: (value: any) => void) { resolve({ data: patch ? null : jobs.filter(j => email || ["machine_subscription", "subscription_reconcile"].includes(j.kind)), error: null }); } };
    return query;
  } };
  const send = async (message: any) => { sent.push(message); if (deliveryFailure) throw new Error("Synthetic provider failure"); return { data: { id: "captured-only" }, error: null, headers: null }; };
  const recurring = async (id: string) => { calls.push(["recurring", id]); }, reconcile = async (id: string) => { calls.push(["reconcile", id]); };
  const api = loadInstallationModule<typeof import("../lib/service/outbox")>("lib/service/outbox.ts", {
    "node:buffer": { Buffer }, "next/server": { after: () => {} }, "@/lib/email": { sendServerEmail: send },
    "./repository": { serviceDatabase: () => database, serviceRpc: async (name: string, args: any) => name === "ids_support_reconcile_due" ? [] : jobs.find(j => j.id === args.p_id), databaseError: (error: Error) => { throw error; } },
    "./controls": { serviceControls: () => ({ email, maintenance: true }) }, "./security": { serviceToken: (scope: string) => `synthetic-${scope}-capability` },
    "./stripe": { createPrepaidRecurringSubscription: recurring, reconcileSubscription: reconcile }, "./policy": policy, "./warranty-pdf": report, "./validation": validation,
  });
  const job = (kind = "warranty_report") => ({ id: "job", kind, semantic_key: "warranty:case:final:v3", case_id: "case", subscription_id: "subscription", payload: { email: "synthetic@example.invalid", origin: "https://example.invalid", requestKey: "synthetic" }, attempts: 1, leased_at: new Date().toISOString(), first_attempt_at: new Date().toISOString(), created_at: new Date().toISOString() });
  return { api, sent, calls, patches, filters, jobs, job, fail: () => { deliveryFailure = true; }, dependencies: { send, snapshot: async () => snapshot(), recurring, reconcile } };
}

test("final warranty email has the fixed recipient, real PDF and stable provider idempotency key", async () => {
  const h = harness(); await h.api.deliverServiceOutbox(h.job(), h.dependencies); await h.api.deliverServiceOutbox(h.job(), h.dependencies);
  const message = h.sent[0]; assert.equal(message.to, "Service.IDS@proton.me"); assert.equal(message.idempotencyKey, h.sent[1].idempotencyKey); assert.match(message.text, /Customer due \$0.00/);
  assert.equal(message.attachments[0].filename, "IDS-SYNTHETIC-warranty.pdf"); assert.equal(message.attachments[0].contentType, "application/pdf");
  const bytes = Buffer.from(message.attachments[0].content, "base64"); assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
  const document = await PDFDocument.load(bytes); assert.equal(document.getTitle(), "IDS Warranty Service IDS-SYNTHETIC"); assert.ok(document.getPageCount() >= 1);
  assert.deepEqual(bytes, Buffer.from(h.sent[1].attachments[0].content, "base64"));
});
for (const invalid of ["unresolved", "draft", "not_covered", "nonzero_due"]) test(`warranty report refuses ${invalid} before any email delivery`, async () => {
  const h = harness(), value = snapshot();
  if (invalid === "unresolved") value.case.status = "active";
  if (invalid === "draft") value.invoice.status = "draft";
  if (invalid === "not_covered") value.case.warranty_status = "not_covered";
  if (invalid === "nonzero_due") value.invoice.totals!.customerDueCents = 1;
  await assert.rejects(h.api.deliverServiceOutbox(h.job(), { ...h.dependencies, snapshot: async () => value })); assert.equal(h.sent.length, 0);
});
test("support and staff messages use only their intended private capability and accurate scope", async () => {
  const h = harness(), support = h.job("customer_link"); Object.assign(support.payload, { scope: "support" });
  await h.api.deliverServiceOutbox(support, h.dependencies); assert.match(h.sent[0].text, /\/remote-assistance\/manage\/synthetic-support-capability/); assert.match(h.sent[0].text, /cancel future renewals/); assert.doesNotMatch(h.sent[0].text, /this request only/);
  await h.api.deliverServiceOutbox(h.job("staff_invitation"), h.dependencies); assert.match(h.sent[1].text, /within 48 hours/); assert.match(h.sent[1].text, /\/staff\/service\/activate\/synthetic-staff-capability/);
  await assert.rejects(h.api.deliverServiceOutbox(h.job("unknown"), h.dependencies), /Unknown/);
});
test("disabled email is filtered before the bounded batch without starving recurring setup", async () => {
  const h = harness(false); h.jobs.push(h.job("customer_link"), { ...h.job("machine_subscription"), id: "recurring" });
  const result = await h.api.runServiceMaintenance(); assert.equal(result.delivered, 1); assert.equal(h.sent.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(h.filters.find(f => f[0] === "kind"))), ["kind", ["machine_subscription", "subscription_reconcile"]]); assert.deepEqual(h.calls, [["recurring", "subscription"]]);
});
test("uncertain email beyond provider retention enters review without a duplicate send", async () => {
  const h = harness(); h.jobs.push({ ...h.job("customer_link"), attempts: 2, first_attempt_at: new Date(Date.now() - 24 * 3600000).toISOString() });
  const result = await h.api.runServiceMaintenance(); assert.equal(result.failures, 1); assert.equal(h.sent.length, 0); assert.equal(h.patches.at(-1).status, "needs_review");
});
test("known delivery failure keeps a durable delayed retry; success marks only the claimed job sent", async () => {
  const h = harness(); h.jobs.push(h.job("customer_link")); h.fail(); await h.api.runServiceMaintenance();
  assert.equal(h.patches.at(-1).status, "failed"); assert.ok(Date.parse(h.patches.at(-1).available_at) > Date.now());
  const success = harness(); success.jobs.push(success.job("customer_link")); await success.api.runServiceMaintenance(); assert.equal(success.patches.at(-1).status, "sent");
});
