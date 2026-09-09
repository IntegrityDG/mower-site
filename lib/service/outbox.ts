import "server-only";
import { Buffer } from "node:buffer";
import { after } from "next/server";
import { sendServerEmail } from "@/lib/email";
import { serviceDatabase, serviceRpc, databaseError } from "./repository";
import { serviceControls } from "./controls";
import { serviceToken } from "./security";
import { createPrepaidRecurringSubscription, reconcileSubscription } from "./stripe";
import { WARRANTY_REPORT_RECIPIENT } from "./policy";
import { warrantyPdf, type WarrantyReportSnapshot } from "./warranty-pdf";
import { ServiceError } from "./validation";

type OutboxRecord = { id: string; kind: string; semantic_key: string; case_id: string | null; subscription_id: string | null; payload: Record<string, string>; attempts: number; leased_at: string; first_attempt_at: string; created_at: string };
export function wakeServiceMaintenance() {
  if (!serviceControls().maintenance) return;
  after(async () => { try { await runServiceMaintenance(); } catch { /* Durable jobs remain pending for cron / Master review. */ } });
}
export async function readWarrantySnapshot(caseId: string): Promise<WarrantyReportSnapshot> {
  const { data, error } = await serviceDatabase().from("service_invoices").select("report_snapshot").eq("case_id", caseId).single();
  if (error) databaseError(error);
  if (!data.report_snapshot) throw new ServiceError("A final warranty report is available only after resolution and invoice finalization.", 409);
  return data.report_snapshot;
}
export async function warrantyEmail(snapshot: WarrantyReportSnapshot, idempotencyKey: string) {
  return { to: WARRANTY_REPORT_RECIPIENT, subject: `IDS Final Warranty Service - ${snapshot.case.case_number}`,
    text: `Final warranty Service report for ${snapshot.case.case_number}. Customer due $0.00. The finalized Invoice / Work Sheet and technical resolution are attached.`,
    attachments: [{ filename: `${snapshot.case.case_number}-warranty.pdf`, content: Buffer.from(await warrantyPdf(snapshot)).toString("base64"), contentType: "application/pdf" }], idempotencyKey };
}
export async function deliverServiceOutbox(job: OutboxRecord, dependencies = { send: sendServerEmail, snapshot: readWarrantySnapshot, recurring: createPrepaidRecurringSubscription, reconcile: reconcileSubscription }) {
  if (job.kind === "warranty_report") {
    if (!job.case_id) throw new Error("Missing warranty case.");
    await dependencies.send(await warrantyEmail(await dependencies.snapshot(job.case_id), job.semantic_key));
  } else if (job.kind === "machine_subscription") {
    if (!job.subscription_id) throw new Error("Missing subscription.");
    await dependencies.recurring(job.subscription_id);
  } else if (job.kind === "subscription_reconcile") {
    if (!job.subscription_id) throw new Error("Missing subscription.");
    await dependencies.reconcile(job.subscription_id);
  } else if (job.kind === "staff_invitation" || job.kind === "customer_link") {
    const staff = job.kind === "staff_invitation";
    const support = job.payload.scope === "support";
    const token = serviceToken(staff ? "staff" : support ? "support" : "case", job.payload.requestKey);
    const path = staff ? `/staff/service/activate/${token}` : support ? `/remote-assistance/manage/${token}` : `/service/manage/${token}`;
    await dependencies.send({ to: job.payload.email, subject: staff ? "IDS Service staff account activation" : support ? "Your private IDS Remote Support billing link" : "Your private IDS Service link",
      text: staff ? `Set your individual IDS Service password using this private link within 48 hours: ${job.payload.origin}${path}\nDo not share this link.` : support ? `Your private IDS Remote Support billing link: ${job.payload.origin}${path}\nUse this link to review your subscription, update your payment method, or cancel future renewals. Do not share this link.` : `Your private IDS Service request link: ${job.payload.origin}${path}\nThis link provides access to this request only.`, idempotencyKey: job.semantic_key });
  } else throw new Error("Unknown Service outbox job.");
}
export async function runServiceMaintenance() {
  const subscriptions = await serviceRpc<{ id: string }[]>("ids_support_reconcile_due");
  let failures = 0;
  for (const subscription of subscriptions.slice(0, 25)) {
    try { await reconcileSubscription(subscription.id); } catch { failures++; }
    finally {
      // Fair rotation also advances failed/unlinked records so one unavailable
      // customer cannot starve every subscription behind it.
      const { error: attemptedError } = await serviceDatabase().from("remote_support_subscriptions").update({ last_reconciled_at: new Date().toISOString() }).eq("id", subscription.id);
      if (attemptedError) databaseError(attemptedError);
    }
  }
  let candidates = serviceDatabase().from("service_outbox").select("id,kind").in("status", ["pending", "failed", "sending"]).lte("available_at", new Date().toISOString());
  // Filter before the bounded batch so intentionally disabled emails cannot
  // prevent recurring setup/reconciliation from making progress.
  if (!serviceControls().email) candidates = candidates.in("kind", ["machine_subscription", "subscription_reconcile"]);
  const { data, error } = await candidates.order("created_at").limit(50);
  if (error) databaseError(error);
  let delivered = 0;
  for (const candidate of data ?? []) {
    const emailJob = ["warranty_report", "staff_invitation", "customer_link"].includes(candidate.kind);
    if (emailJob && !serviceControls().email) continue;
    const job = await serviceRpc<OutboxRecord | null>("ids_service_outbox_claim", { p_id: candidate.id });
    if (!job) continue;
    // Resend retains idempotency for 24 hours. An uncertain delivery outside
    // that window needs provider reconciliation; never blindly send it twice.
    if (emailJob && job.attempts > 1 && Date.now() - Date.parse(job.first_attempt_at) >= 23 * 3_600_000) {
      const { error: reviewError } = await serviceDatabase().from("service_outbox").update({ status: "needs_review", last_error: "Delivery is uncertain beyond the provider idempotency window. Check Resend delivery before any resend." }).eq("id", job.id).eq("leased_at", job.leased_at);
      if (reviewError) databaseError(reviewError);
      failures++; continue;
    }
    try {
      await deliverServiceOutbox(job);
      const { error: finishError } = await serviceDatabase().from("service_outbox").update({ status: "sent", sent_at: new Date().toISOString(), last_error: null }).eq("id", job.id).eq("leased_at", job.leased_at);
      if (finishError) databaseError(finishError);
      delivered++;
    } catch {
      failures++;
      const { error: retryError } = await serviceDatabase().from("service_outbox").update({ status: "failed", last_error: "Delivery or reconciliation failed; retry pending.", available_at: new Date(Date.now() + Math.min(3600, 60 * 2 ** Math.min(job.attempts, 5)) * 1000).toISOString() }).eq("id", job.id).eq("leased_at", job.leased_at);
      if (retryError) databaseError(retryError);
    }
  }
  return { delivered, failures, subscriptionsChecked: Math.min(subscriptions.length, 25) };
}
