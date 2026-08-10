import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { getStripeConfiguration, getStripeMode, getStripeSecretKey, StripeConfigurationError } from "../lib/stripe/config-values";
import { assertStripeEventMode, reconcileCompletedSession, reconcileExpiredSession, WebhookReconciliationError } from "../lib/stripe/webhook-policy";

const record = { orderId: "order", attemptId: "attempt", totalCents: 269900, currency: "usd" as const };
const session = { livemode: false, status: "complete", mode: "payment", paymentMethodTypes: ["card"], clientReferenceId: "order", metadata: { order_id: "order", attempt_id: "attempt" }, currency: "usd", amountTotal: 269900, paymentStatus: "paid" };

test("a signed paid completion is accepted", () => {
  assert.equal(reconcileCompletedSession(session, record), "paid");
});

test("Stripe configuration defaults to test and requires a mode-matching secret key", () => {
  const base = { STRIPE_WEBHOOK_SECRET: "whsec_x", APP_BASE_URL: "https://example.com", CHECKOUT_SIGNING_SECRET: "signing", NODE_ENV: "production" } as NodeJS.ProcessEnv;
  assert.equal(getStripeMode(base), "test");
  assert.equal(getStripeSecretKey({ ...base, STRIPE_SECRET_KEY: "sk_test_x" }), "sk_test_x");
  assert.equal(getStripeConfiguration({ ...base, STRIPE_MODE: "test", STRIPE_SECRET_KEY: "sk_test_x" }).livemode, false);
  assert.equal(getStripeConfiguration({ ...base, STRIPE_MODE: "live", STRIPE_SECRET_KEY: "sk_live_x" }).livemode, true);
  assert.throws(() => getStripeSecretKey({ ...base, STRIPE_MODE: "test", STRIPE_SECRET_KEY: "sk_live_x" }), StripeConfigurationError);
  assert.throws(() => getStripeSecretKey({ ...base, STRIPE_MODE: "live", STRIPE_SECRET_KEY: "sk_test_x" }), StripeConfigurationError);
  assert.throws(() => getStripeMode({ ...base, STRIPE_MODE: "staging" }), StripeConfigurationError);
});

test("card reconciliation accepts matching test and live modes and rejects mismatches", () => {
  assert.equal(reconcileCompletedSession(session, record, false), "paid");
  assert.equal(reconcileCompletedSession({ ...session, livemode: true }, record, true), "paid");
  assert.throws(() => reconcileCompletedSession({ ...session, livemode: true }, record, false), WebhookReconciliationError);
  assert.throws(() => reconcileCompletedSession(session, record, true), WebhookReconciliationError);
  assert.doesNotThrow(() => assertStripeEventMode(false, false));
  assert.doesNotThrow(() => assertStripeEventMode(true, true));
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

test("verified webhook receipts preserve the actual Stripe event mode", () => {
  const source = readFileSync(new URL("../app/api/stripe/webhook/route.ts", import.meta.url), "utf8");
  assert.match(source, /recordWebhookReceipt\(\{[^}]*livemode:event\.livemode/);
  assert.doesNotMatch(source, /recordWebhookReceipt\(\{[^}]*livemode:\s*false/);
});
