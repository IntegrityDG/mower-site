/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import test from "node:test";
import * as policy from "../lib/service/policy";
import * as validation from "../lib/service/validation";
import { loadInstallationModule } from "./helpers/installation-module";

// Actual server module, controlled external Stripe/DB boundaries. Transaction,
// RLS and persistent accounting behavior are separately exercised in PostgreSQL.
function harness() {
  const now = Math.floor(Date.now() / 1000);
  const metadata = { ids_service: policy.SERVICE_POLICY_VERSION, service_kind: "support_recurring", service_reference: "subscription" };
  const record: any = { id: "subscription", source: "standalone", status: "active", livemode: false, stripe_customer_id: "cus_test", stripe_subscription_id: "sub_test", stripe_payment_method_id: "pm_test", created_at: new Date().toISOString(), paid_through: new Date((now + 30 * 86400) * 1000).toISOString(), failed_at: null, failed_invoice_id: null, cancel_at_period_end: false };
  const invoice: any = { id: "in_test", customer: "cus_test", currency: "usd", livemode: false, status: "paid", amount_paid: 0, amount_due: 0, total: 0, created: now - 60, attempt_count: 0, status_transitions: { paid_at: now }, lines: { data: [{ parent: { subscription_item_details: { subscription_item: "si_test" } }, period: { start: now, end: now + 30 * 86400 } }] } };
  const subscription: any = { id: "sub_test", customer: "cus_test", livemode: false, status: "trialing", metadata, latest_invoice: invoice, items: { data: [{ id: "si_test" }] }, default_payment_method: "pm_test", cancel_at_period_end: false, cancel_at: null };
  const payment: any = { id: "payment", case_id: "case", invoice_id: "invoice", purpose: "invoice", method: "card", amount_cents: 12000, currency: "usd", status: "open", stripe_customer_id: "cus_test", stripe_intent_id: "pi_test", stripe_session_id: null, livemode: false };
  const intent: any = { id: "pi_test", status: "succeeded", customer: "cus_test", payment_method: "pm_test", currency: "usd", livemode: false, amount: 12000, amount_received: 12000, metadata: { ...metadata, service_kind: "service_invoice", service_reference: "payment" } };
  const charge: any = { id: "ch_test", object: "charge", customer: "cus_test", payment_intent: "pi_test", currency: "usd", livemode: false, amount: 12000, amount_refunded: 3000, paid: true };
  const calls: { name: string; args: any }[] = [];
  const failedEvents: any[] = [];
  const refunds: any[] = [{ id: "re_test", amount: 3000, status: "succeeded" }];
  const disputes: any[] = [];
  const existingSubscriptions: any[] = [];
  const configurations: any[] = [];
  const recoverySessions: any[] = [], recoveryIntents: any[] = [];
  let reviewRequired = false;
  const list = (rows: any[]) => ({ data: rows, async *[Symbol.asyncIterator]() { yield* rows; } });
  const capture = (name: string, args: any) => calls.push({ name, args });
  const client: any = {
    subscriptions: { retrieve: async () => subscription, list: () => list(existingSubscriptions), update: async (_: string, args: any) => { capture("stripe.subscription.update", args); return subscription; }, cancel: async (_: string, args: any) => { capture("stripe.subscription.cancel", args); return { ...subscription, status: "canceled" }; }, create: async (args: any) => { capture("stripe.subscription.create", args); return subscription; } },
    invoices: { retrieve: async () => invoice, pay: async (_: string, args: any, options: any) => { capture("stripe.invoice.pay", { ...args, ...options }); invoice.status = "paid"; invoice.amount_paid = invoice.total = 10000; } },
    events: { list: () => list(failedEvents) }, testHelpers: { testClocks: { retrieve: async () => ({ frozen_time: now }) } },
    paymentMethods: { retrieve: async (id: string) => ({ id, customer: "cus_test", livemode: false, type: "card" }) },
    customers: { retrieve: async () => ({ id: "cus_test", livemode: false, invoice_settings: { default_payment_method: "pm_updated" } }) },
    prices: { list: async () => ({ data: [{ id: "price_test", currency: "usd", livemode: false, unit_amount: 10000, recurring: { interval: "month", interval_count: 1 } }] }) },
    checkout: { sessions: { list: () => list(recoverySessions) } },
    paymentIntents: { retrieve: async () => intent, list: () => list(recoveryIntents) }, charges: { retrieve: async () => charge },
    refunds: { list: () => list(refunds) }, disputes: { list: () => list(disputes) }, invoicePayments: { list: async () => ({ data: [] }) },
    billingPortal: { configurations: { list: () => list(configurations), create: async (args: any) => { capture("stripe.portal.configuration", args); return { ...args, id: "bpc_test", livemode: false }; } }, sessions: { create: async (args: any) => { capture("stripe.portal.session", args); return { url: "https://billing.stripe.com/synthetic" }; } } },
  };
  const database = { from(table: string) {
    let patch: any; const query: any = { select: () => query, eq: () => query, is: () => query, update: (data: any) => { patch = data; capture(`db.update.${table}`, data); return query; },
      single: async () => ({ data: table === "service_payments" ? payment : record, error: null }),
      then(resolve: (result: any) => void) { if (patch && table === "remote_support_subscriptions") Object.assign(record, patch); resolve({ data: null, error: null }); } };
    return query;
  } };
  const rpc = async (name: string, args: any) => { capture(name, args); if (name === "ids_support_paid_cycle") return { reviewRequired }; if (name === "ids_service_customer") return { id: "customer", stripe_customer_id: "cus_test" }; return {}; };
  const api = loadInstallationModule<typeof import("../lib/service/stripe")>("lib/service/stripe.ts", {
    "@/lib/stripe/server": { getStripeServerClient: () => client }, "@/lib/stripe/config": { getStripeMode: () => "test" },
    "@/lib/dealer-network/api": { dealerNetworkOrigin: () => "https://example.invalid" }, "@/lib/dealer-network/security": { requestFingerprint: () => "fingerprint" },
    "./policy": policy, "./repository": { serviceDatabase: () => database, serviceRpc: rpc, databaseError: (error: Error) => { throw error; } },
    "./security": { serviceToken: () => "synthetic", tokenHash: () => "synthetic_hash" },
    "./controls": { requireServiceControl: () => {}, serviceControls: () => ({}) }, "./availability": { requireServiceAvailability: async () => {} }, "./validation": validation,
    "./auth": { serviceRateLimit: async () => {} }, "./server": { subscriptionByToken: async () => record },
  });
  const event = (type: string, object: any) => ({ id: "evt_test", type, livemode: false, created: now, data: { object } } as any);
  return { api, now, record, subscription, invoice, payment, intent, charge, client, calls, failedEvents, refunds, disputes, existingSubscriptions, configurations, recoverySessions, recoveryIntents, event, review: () => { reviewRequired = true; } };
}
test("unrelated checkout remains available to the released payment handlers", async () => {
  const h = harness(); assert.equal(await h.api.handleServiceStripeWebhook(h.event("checkout.session.completed", { metadata: { order_id: "order" } })), false); assert.equal(h.calls.length, 0);
});
test("affirmative Service webhook rejects live-mode data in test configuration", async () => {
  const h = harness(); const event = h.event("customer.subscription.updated", h.subscription); event.livemode = true;
  await assert.rejects(h.api.handleServiceStripeWebhook(event), /mode mismatch/); assert.equal(h.calls.length, 0);
});
for (const mismatch of ["customer", "currency", "price", "recurring_identity"]) test(`recurring payment rejects ${mismatch} mismatch without granting benefits`, async () => {
  const h = harness(); h.invoice.amount_paid = h.invoice.total = 10000;
  if (mismatch === "customer") h.invoice.customer = "cus_other";
  if (mismatch === "currency") h.invoice.currency = "eur";
  if (mismatch === "price") h.invoice.amount_paid = 1;
  if (mismatch === "recurring_identity") h.invoice.lines.data = [];
  await assert.rejects(h.api.reconcileSubscription(h.record.id)); assert.ok(!h.calls.some(c => c.name === "ids_support_paid_cycle"));
});
test("renewal grants exactly the paid invoice period and current saved method", async () => {
  const h = harness(); h.invoice.amount_paid = h.invoice.total = 10000; await h.api.reconcileSubscription(h.record.id);
  const paid = h.calls.find(c => c.name === "ids_support_paid_cycle")!;
  assert.equal(paid.args.p_invoice, "in_test"); assert.equal(paid.args.p_start, new Date(h.now * 1000).toISOString()); assert.equal(paid.args.p_payment_method, "pm_test");
});
test("failed renewal uses earliest Stripe event and schedules the fixed fourteen-day deadline", async () => {
  const h = harness(); h.invoice.status = "open"; h.invoice.amount_due = 10000; h.invoice.attempt_count = 2; h.subscription.status = "past_due";
  h.failedEvents.push({ created: h.now - 86400, data: { object: { id: h.invoice.id } } }, { created: h.now - 60, data: { object: { id: h.invoice.id } } });
  await h.api.reconcileSubscription(h.record.id, h.now);
  const state = h.calls.find(c => c.name === "ids_support_state")!; assert.equal(state.args.p_state, "suspended"); assert.equal(state.args.p_failed_at, new Date((h.now - 86400) * 1000).toISOString());
  const update = h.calls.find(c => c.name === "stripe.subscription.update")!; assert.equal(update.args.cancel_at, h.now + 13 * 86400); assert.equal(update.args.proration_behavior, "none");
});
test("missing failure history suspends without inventing a new recovery date", async () => {
  const h = harness(); h.invoice.status = "open"; h.invoice.amount_due = 10000; h.invoice.attempt_count = 1;
  await assert.rejects(h.api.reconcileSubscription(h.record.id), /failure time/);
  assert.equal(h.calls.find(c => c.name === "ids_support_state")!.args.p_failed_at, null);
  assert.ok(!h.calls.some(c => c.name.startsWith("stripe.subscription.")));
});
test("unrecovered renewal cancels at the deadline without another invoice or proration", async () => {
  const h = harness(); h.invoice.status = "open"; h.invoice.amount_due = 10000; h.invoice.attempt_count = 1; h.record.failed_at = new Date((h.now - 14 * 86400) * 1000).toISOString();
  await h.api.reconcileSubscription(h.record.id); assert.deepEqual(JSON.parse(JSON.stringify(h.calls.find(c => c.name === "stripe.subscription.cancel")!.args)), { prorate: false, invoice_now: false });
  assert.equal(h.calls.at(-1)!.args.p_state, "cancelled");
});
test("paid recovery clears failure cancellation while retaining voluntary period-end cancellation", async () => {
  const h = harness(); h.invoice.amount_paid = h.invoice.total = 10000; h.subscription.metadata.ids_failure_deadline = "123"; h.record.cancel_at_period_end = true;
  await h.api.reconcileSubscription(h.record.id); const updates = h.calls.filter(c => c.name === "stripe.subscription.update");
  assert.equal(updates[0].args.cancel_at, ""); assert.equal(updates[1].args.cancel_at_period_end, true);
});

test("overdue retry keeps one key per invoice, payment method and customer operation", async () => {
  const h = harness(); h.record.status = "suspended"; h.record.failed_at = new Date((h.now - 60) * 1000).toISOString(); h.invoice.status = "open"; h.invoice.amount_due = 10000; h.invoice.attempt_count = 1;
  let method = "pm_first";
  h.client.customers.retrieve = async () => ({ id: "cus_test", livemode: false, invoice_settings: { default_payment_method: method } });
  h.client.invoices.pay = async (_: string, args: any, options: any) => { h.calls.push({ name: "retry", args: { ...args, ...options } }); throw new Error("Synthetic card decline"); };
  await assert.rejects(h.api.retrySupportPayment("token", "operation")); await assert.rejects(h.api.retrySupportPayment("token", "operation"));
  method = "pm_replacement"; await assert.rejects(h.api.retrySupportPayment("token", "operation"));
  const retries = h.calls.filter(c => c.name === "retry"); assert.equal(retries.length, 3); assert.equal(retries[0].args.idempotencyKey, retries[1].args.idempotencyKey); assert.notEqual(retries[0].args.idempotencyKey, retries[2].args.idempotencyKey);
});
test("late paid renewal is retained for review and cannot revive or repeat billing", async () => {
  const h = harness(); h.invoice.amount_paid = h.invoice.total = 10000; h.review(); await h.api.reconcileSubscription(h.record.id);
  assert.equal(h.calls.at(-1)!.args.p_state, "cancelled"); assert.equal(h.calls.filter(c => c.name === "stripe.subscription.cancel").length, 1);
});
test("prepaid recurring setup saves the full paid-through deferral without collecting a second first month", async () => {
  const h = harness(); h.record.stripe_subscription_id = null; await h.api.createPrepaidRecurringSubscription(h.record.id);
  const create = h.calls.find(c => c.name === "stripe.subscription.create")!;
  assert.equal(create.args.trial_end, h.now + 30 * 86400); assert.equal(create.args.proration_behavior, "none");
  await h.api.createPrepaidRecurringSubscription(h.record.id); assert.equal(h.calls.filter(c => c.name === "stripe.subscription.create").length, 1);
});
test("unlinked recurring retry recovers immutable Stripe identity instead of duplicating beyond idempotency retention", async () => {
  const h = harness(); h.record.stripe_subscription_id = null; h.existingSubscriptions.push(h.subscription); await h.api.createPrepaidRecurringSubscription(h.record.id);
  assert.equal(h.record.stripe_subscription_id, h.subscription.id); assert.ok(!h.calls.some(c => c.name === "stripe.subscription.create"));
});
test("multiple matching recurring subscriptions require review", async () => {
  const h = harness(); h.record.stripe_subscription_id = null; h.existingSubscriptions.push(h.subscription, { ...h.subscription, id: "sub_other" });
  await assert.rejects(h.api.createPrepaidRecurringSubscription(h.record.id), /Multiple recurring/);
});
test("payment method portal enables only the intended payment-method flow", async () => {
  const h = harness(); await h.api.supportBillingPortal(new Request("https://example.invalid"), "token");
  const config = h.calls.find(c => c.name === "stripe.portal.configuration")!.args;
  assert.equal(config.features.payment_method_update.enabled, true); assert.equal(config.features.subscription_cancel.enabled, false); assert.equal(config.features.subscription_update.enabled, false);
  assert.equal(h.calls.find(c => c.name === "stripe.portal.session")!.args.configuration, "bpc_test");
});
test("a modified unsafe portal configuration is rejected before creating customer access", async () => {
  const h = harness(); h.configurations.push({ id: "bpc_test", livemode: false, metadata: { ids_service_portal: "payment_method_v1" }, features: { payment_method_update: { enabled: true }, subscription_cancel: { enabled: true }, subscription_update: { enabled: false }, customer_update: { enabled: false } } });
  await assert.rejects(h.api.supportBillingPortal(new Request("https://example.invalid"), "token"), /permissions need review/); assert.ok(!h.calls.some(c => c.name === "stripe.portal.session"));
});
test("old PaymentIntent failure notification reconciles current successful intent", async () => {
  const h = harness(); await h.api.handleServiceStripeWebhook(h.event("payment_intent.payment_failed", { ...h.intent, status: "requires_payment_method" }));
  assert.equal(h.calls.find(c => c.name === "ids_service_payment_apply")!.args.p_status, "succeeded");
});
for (const type of ["charge.refunded", "refund.updated", "charge.dispute.created"]) test(`${type} records current cumulative financial facts rather than stale notification amounts`, async () => {
  const h = harness(); const payload = type === "charge.refunded" ? { ...h.charge, amount_refunded: 1 } : { id: "synthetic", object: type.startsWith("refund") ? "refund" : "dispute", charge: h.charge.id };
  assert.equal(await h.api.handleServiceStripeWebhook(h.event(type, payload)), true);
  const call = h.calls.find(c => c.name === "ids_service_financial_reconcile")!; assert.equal(call.args.p_refunded, 3000); assert.equal(call.args.p_review, false); assert.equal(call.args.p_reference, "payment");
});
test("open dispute and uncertain refund retain review status and never initiate refund/collection", async () => {
  const h = harness(); h.disputes.push({ id: "dp_test", status: "needs_response", amount: 12000, livemode: false });
  await h.api.handleServiceStripeWebhook(h.event("charge.dispute.created", { id: "dp_test", object: "dispute", charge: "ch_test" }));
  assert.equal(h.calls.find(c => c.name === "ids_service_financial_reconcile")!.args.p_review, true);
  assert.ok(h.calls.every(c => !c.name.startsWith("stripe.")));
});
test("unlinked Service collection recovers the original processor intent without creating a charge", async () => {
  const h = harness(); h.payment.stripe_intent_id = null; h.payment.created_at = new Date().toISOString(); h.recoveryIntents.push(h.intent);
  await h.api.recoverUnlinkedServicePayment(h.payment, false);
  assert.equal(h.payment.stripe_intent_id, h.intent.id); assert.ok(!h.calls.some(c => c.name.startsWith("stripe.")));
});
test("uncertain recent absence keeps the invoice blocked from another collection", async () => {
  const h = harness(); h.payment.stripe_intent_id = null; h.payment.created_at = new Date().toISOString();
  await assert.rejects(h.api.recoverUnlinkedServicePayment(h.payment, true), /new collection remains blocked/);
  assert.ok(!h.calls.some(c => c.name === "ids_service_payment_apply"));
});
test("complete listing and forty-eight-hour absence closes only the old attempt with a durable reference", async () => {
  const h = harness(); h.payment.stripe_intent_id = null; h.payment.created_at = new Date(Date.now() - 49 * 3600000).toISOString();
  await h.api.recoverUnlinkedServicePayment(h.payment, true);
  assert.equal(h.payment.status, "expired"); assert.equal(h.calls.find(c => c.name === "ids_service_payment_apply")!.args.p_event, "reconciled-absent:payment");
});
for (const problem of ["duplicate", "amount", "customer", "bounded_listing"]) test(`unlinked recovery rejects ${problem} rather than declaring the attempt safe to replace`, async () => {
  const h = harness(); h.payment.stripe_intent_id = null; h.payment.created_at = new Date(Date.now() - 49 * 3600000).toISOString();
  if (problem === "duplicate") h.recoveryIntents.push(h.intent, { ...h.intent, id: "pi_other" });
  if (problem === "amount") h.recoveryIntents.push({ ...h.intent, amount: 1 });
  if (problem === "customer") h.recoveryIntents.push({ ...h.intent, customer: "cus_other" });
  if (problem === "bounded_listing") h.recoveryIntents.push(...Array.from({ length: 1001 }, () => ({ metadata: {} })));
  await assert.rejects(h.api.recoverUnlinkedServicePayment(h.payment, true)); assert.ok(!h.calls.some(c => c.name === "ids_service_payment_apply"));
});
