import assert from "node:assert/strict";
import test from "node:test";
import { reconcileCompletedSession, reconcileExpiredSession, WebhookReconciliationError } from "../lib/stripe/webhook-policy";

const record = { orderId: "order", attemptId: "attempt", totalCents: 269900, currency: "usd" as const };
const session = { livemode: false, status: "complete", mode: "payment", paymentMethodTypes: ["card"], clientReferenceId: "order", metadata: { order_id: "order", attempt_id: "attempt" }, currency: "usd", amountTotal: 269900, paymentStatus: "paid" };

test("a signed paid completion is accepted", () => {
  assert.equal(reconcileCompletedSession(session, record), "paid");
});

test("completed Sessions fail closed on inconsistent status fields", () => {
  assert.throws(() => reconcileCompletedSession({ ...session, status: "open" }, record), WebhookReconciliationError);
  assert.throws(() => reconcileCompletedSession({ ...session, paymentStatus: "unpaid" }, record), WebhookReconciliationError);
});

test("expiration requires expired status and accepts the supplied Stripe payment status", () => {
  for (const paymentStatus of ["paid", "unpaid", "no_payment_required"]) assert.equal(reconcileExpiredSession({ ...session, status: "expired", paymentStatus }, record), "expired");
  assert.throws(() => reconcileExpiredSession({ ...session, status: "complete", paymentStatus: "unpaid" }, record), WebhookReconciliationError);
  assert.throws(() => reconcileExpiredSession({ ...session, status: "expired", paymentStatus: "unknown" }, record), WebhookReconciliationError);
});
