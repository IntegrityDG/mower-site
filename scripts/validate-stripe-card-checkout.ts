import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Stripe from "stripe";
import { buildCardCheckoutSession } from "../lib/stripe/checkout-session";
import { checkoutAttemptIdempotencyKey, checkoutRequestFingerprint } from "../lib/checkout/idempotency";
import { signCancelState, verifyCancelState } from "../lib/checkout/signed-state";
import { getCheckoutSigningSecret, getStripeConfiguration, getStripeSecretKey, getStripeWebhookSecret, StripeConfigurationError } from "../lib/stripe/config-values";
import { PAYMENT_SECURITY_NOTICE } from "../lib/checkout/payment-security-policy";
import { assertTestEvent, reconcileCompletedSession, reconcileExpiredSession, reconcileFinancialObject, WebhookReconciliationError } from "../lib/stripe/webhook-policy";
import { canTransitionAttempt, transitionCheckoutState } from "../lib/checkout/status-transitions";
import type { CheckoutRequest, OrderPriceSnapshot } from "../lib/checkout/types";

const request: CheckoutRequest = {
  requestId: "11111111-1111-4111-8111-111111111111", paymentMethod: "card",
  selection: { productId: "22222222-2222-4222-8222-222222222222", variantId: null, purchaseMode: "individual-equipment", packageId: null, options: [], includeBaseProduct: true },
  customer: { name: "Test Buyer", email: "test@example.com", phone: "555 111 2222" },
  shippingAddress: { line1: "1 Main St", line2: null, city: "Austin", state: "TX", postalCode: "78701", country: "US" },
};
const snapshot: OrderPriceSnapshot = {
  currency: "usd", product: { id: request.selection.productId, slug: "yarbo", name: "Yarbo" }, variant: null, purchaseMode: "individual-equipment",
  chargeableItems: [{ itemType: "product", sourceId: request.selection.productId, sku: null, name: "Yarbo Core", description: null, quantity: 1, unitAmountCents: 1000, extendedAmountCents: 1000, includedInPackagePrice: false, parentSourceId: null }],
  includedPackageComponents: [{ itemType: "package_component", sourceId: "33333333-3333-4333-8333-333333333333", sku: null, name: "Included", description: null, quantity: 1, unitAmountCents: 0, extendedAmountCents: 0, includedInPackagePrice: true, parentSourceId: null }],
  subtotalCents: 1000, discountCents: 0, feeCents: 0, shippingCents: 0, taxCents: 0, totalCents: 1000, paymentMethod: "card", pricedAt: new Date(0).toISOString(), catalogSources: [], warnings: [], safeMetadata: { phase: "4B1", adjustments: "not_implemented" },
};

// Canonical request fingerprint and stable attempt identity.
assert.equal(checkoutRequestFingerprint(request), checkoutRequestFingerprint({ ...request, customer: { ...request.customer, email: "TEST@example.com " } }));
assert.notEqual(checkoutRequestFingerprint(request), checkoutRequestFingerprint({ ...request, shippingAddress: { ...request.shippingAddress, postalCode: "78702" } }));
assert.equal(checkoutAttemptIdempotencyKey(request.requestId), checkoutAttemptIdempotencyKey(request.requestId));
assert.notEqual(checkoutAttemptIdempotencyKey(request.requestId), checkoutAttemptIdempotencyKey("44444444-4444-4444-8444-444444444444"));

// Session construction and retry-stable signed cancel parameters.
const build = () => buildCardCheckoutSession({ snapshot, orderId: "order", attemptId: "attempt", publicReference: "IDS-X", customerEmail: request.customer.email, appBaseUrl: "https://example.com", signingSecret: "secret", returnPath: "/equipment/yarbo", cancelExpiresAt: 1_800_000 });
const parameters = build();
assert.deepEqual(parameters.payment_method_types, ["card"]);
assert.equal(parameters.mode, "payment");
assert.equal(parameters.customer_creation, "always");
assert.equal(parameters.saved_payment_method_options?.payment_method_save, "enabled");
assert.equal(typeof parameters.custom_text?.submit === "object" && parameters.custom_text.submit ? parameters.custom_text.submit.message : null, PAYMENT_SECURITY_NOTICE);
assert.equal(parameters.billing_address_collection, "required");
assert.equal(parameters.phone_number_collection?.enabled, true);
assert.deepEqual(parameters.shipping_address_collection?.allowed_countries, ["US"]);
assert.match(parameters.success_url!, /\{CHECKOUT_SESSION_ID\}/);
assert.equal(parameters.line_items?.length, 1);
assert.equal((parameters.line_items?.[0] as Stripe.Checkout.SessionCreateParams.LineItem).price_data?.unit_amount, 1000);
assert.equal("payment_intent_data" in parameters, false);
assert.equal(build().cancel_url, parameters.cancel_url);
assert.throws(() => buildCardCheckoutSession({ ...({ snapshot, orderId: "order", attemptId: "attempt", publicReference: "IDS-X", customerEmail: null, appBaseUrl: "https://example.com", signingSecret: "secret", returnPath: "/equipment/yarbo", cancelExpiresAt: 1_800_000 }), snapshot: { ...snapshot, totalCents: 999 } }), /total mismatch/i);

// Signed state tampering, expiration, and open redirects.
const token = signCancelState({ orderId: "order", attemptId: "attempt", publicReference: "IDS-X", expiresAt: 100, returnPath: "/equipment/yarbo" }, "secret");
assert.ok(verifyCancelState(token, "secret", 99));
assert.equal(verifyCancelState(`${token}x`, "secret", 99), null);
assert.equal(verifyCancelState(token, "secret", 101), null);
assert.throws(() => signCancelState({ orderId: "o", attemptId: "a", publicReference: "x", expiresAt: 1, returnPath: "https://evil.test" }, "secret"));

// Independent lazy configuration boundaries.
const env = { STRIPE_SECRET_KEY: "sk_test_x", STRIPE_WEBHOOK_SECRET: "whsec_x", APP_BASE_URL: "https://example.com", CHECKOUT_SIGNING_SECRET: "signing", NODE_ENV: "production" } as NodeJS.ProcessEnv;
assert.equal(getStripeConfiguration(env).appBaseUrl, "https://example.com");
assert.equal(getStripeSecretKey({ STRIPE_SECRET_KEY: "sk_test_x", NODE_ENV: "test" }), "sk_test_x");
assert.equal(getStripeWebhookSecret({ STRIPE_WEBHOOK_SECRET: "whsec_x", NODE_ENV: "test" }), "whsec_x");
assert.equal(getCheckoutSigningSecret({ CHECKOUT_SIGNING_SECRET: "signing", NODE_ENV: "test" }), "signing");
for (const bad of [{ ...env, STRIPE_SECRET_KEY: "sk_live_x" }, { ...env, APP_BASE_URL: "http://example.com" }, { ...env, STRIPE_SECRET_KEY: "" }]) assert.throws(() => getStripeConfiguration(bad), StripeConfigurationError);
assert.equal(getStripeConfiguration({ ...env, APP_BASE_URL: "http://localhost:3000", NODE_ENV: "development" }).appBaseUrl, "http://localhost:3000");
assert.throws(() => getStripeConfiguration({ ...env, APP_BASE_URL: "http://localhost:3000", NODE_ENV: "production" }));

// Local Stripe signature verification without an API call.
const stripe = new Stripe("sk_test_validation_only");
const webhookSecret = "whsec_validation_only";
const payload = JSON.stringify({ id: "evt_test", object: "event", type: "checkout.session.completed", livemode: false, data: { object: { id: "cs_test_x" } } });
const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
assert.equal(stripe.webhooks.constructEvent(payload, signature, webhookSecret).id, "evt_test");
assert.throws(() => stripe.webhooks.constructEvent(`${payload} `, signature, webhookSecret));
assert.throws(() => stripe.webhooks.constructEvent(payload, "invalid", webhookSecret));

// Pure webhook reconciliation and non-paid behavior.
const record = { orderId: "order", attemptId: "attempt", totalCents: 1000, currency: "usd" as const };
const completed = { livemode: false, status: "complete", mode: "payment", paymentMethodTypes: ["card"], clientReferenceId: "order", metadata: { order_id: "order", attempt_id: "attempt" }, currency: "usd", amountTotal: 1000, paymentStatus: "paid" };
assert.equal(reconcileCompletedSession(completed, record), "paid");
assert.throws(() => reconcileCompletedSession({ ...completed, paymentStatus: "unpaid" }, record), WebhookReconciliationError);
assert.throws(() => reconcileCompletedSession({ ...completed, status: "open" }, record), WebhookReconciliationError);
assert.equal(reconcileExpiredSession({ ...completed, status: "expired", paymentStatus: "unpaid" }, record), "expired");
assert.equal(reconcileExpiredSession({ ...completed, status: "expired", paymentStatus: "no_payment_required" }, record), "expired");
assert.throws(() => reconcileExpiredSession({ ...completed, status: "complete", paymentStatus: "unpaid" }, record), WebhookReconciliationError);
assert.throws(() => reconcileExpiredSession({ ...completed, status: "expired", paymentStatus: "unknown" }, record), WebhookReconciliationError);
assert.throws(() => reconcileCompletedSession({ ...completed, amountTotal: 999 }, record), WebhookReconciliationError);
assert.throws(() => reconcileCompletedSession({ ...completed, currency: "eur" }, record), WebhookReconciliationError);
assert.throws(() => reconcileCompletedSession({ ...completed, livemode: true }, record), WebhookReconciliationError);
assert.throws(() => assertTestEvent(true), WebhookReconciliationError);
assert.doesNotThrow(() => reconcileFinancialObject({ livemode: false, amount: 1000, currency: "usd" }, record));
assert.throws(() => reconcileFinancialObject({ livemode: false, amount: 999, currency: "usd" }, record));
assert.doesNotThrow(() => reconcileFinancialObject({ livemode: false, amount: 400, currency: "usd" }, record, true));
assert.throws(() => reconcileFinancialObject({ livemode: false, amount: 1001, currency: "usd" }, record, true));

// Pure transition guards: paid/refunds/dispute and terminal attempt states.
const paid = { orderStatus: "confirmed" as const, paymentStatus: "paid" as const, fulfillmentStatus: "pending" as const, refundedCents: 0, totalCents: 1000 };
assert.equal(transitionCheckoutState(paid, { ...paid, paymentStatus: "partially_refunded", refundedCents: 400 }).paymentStatus, "partially_refunded");
assert.equal(transitionCheckoutState(paid, { ...paid, paymentStatus: "refunded", fulfillmentStatus: "canceled", refundedCents: 1000 }).paymentStatus, "refunded");
assert.equal(transitionCheckoutState(paid, { ...paid, paymentStatus: "disputed" }).paymentStatus, "disputed");
assert.throws(() => transitionCheckoutState(paid, { ...paid, paymentStatus: "refunded", refundedCents: 1001 }));
assert.equal(canTransitionAttempt("expired", "succeeded"), false);
assert.equal(canTransitionAttempt("succeeded", "expired"), false);

// Static migration security checks. Database behavior still requires post-application integration tests.
const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260729010607_add_private_checkout_runtime_functions.sql"), "utf8");
for (const name of ["checkout_create_card_draft", "checkout_link_card_session", "checkout_record_webhook", "checkout_finish_webhook", "checkout_find_attempt", "checkout_apply_card_event"]) {
  assert.match(sql, new RegExp(`revoke all on function public\\.${name}\\([\\s\\S]*?from public,anon,authenticated`, "i"));
}
assert.match(sql, /grant execute on function[\s\S]*to service_role/i);
assert.doesNotMatch(sql, /security definer|execute\s+format|quote_requests|delete\s+from|grant[^;]*delete|payment_method_id|last4|card_brand|routing_number/i);
assert.match(sql, /a\.request_fingerprint<>p_request_fingerprint[\s\S]*checkout_idempotency_conflict/i);
assert.match(sql, /p_kind='paid' and a\.attempt_status in \('expired','failed'\)/i);
assert.match(sql, /p_refunded is null or p_refunded < 1 or p_refunded > o\.total_cents/i);

const changedRuntime = [sql, ...["lib/checkout/order-repository.ts", "app/api/stripe/webhook/route.ts", "app/api/checkout/session/route.ts"].map((file) => fs.readFileSync(file, "utf8"))].join("\n");
assert.doesNotMatch(changedRuntime, /last4|payment_method_id|request\.json\(|console\.(log|error)/i);
const repositorySource = fs.readFileSync("lib/checkout/order-repository.ts", "utf8");
assert.match(repositorySource, /completed\(await getSupabaseServiceClient\(\)\.rpc\("checkout_link_card_session"/);
assert.match(repositorySource, /completed\(await getSupabaseServiceClient\(\)\.rpc\("checkout_finish_webhook"/);
const v2Sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20260731215720_persist_checkout_session_status_v2.sql"), "utf8");
const webhookSource = fs.readFileSync("app/api/stripe/webhook/route.ts", "utf8");
const successSource = fs.readFileSync("app/checkout/success/page.tsx", "utf8");
assert.match(repositorySource, /export type ApplyCardEventV2Params=\{[\s\S]*p_stripe_session_status:string\|null;[\s\S]*p_stripe_payment_status:string\|null/);
assert.match(repositorySource, /rpc\("checkout_apply_card_event_v2",p\)/);
assert.doesNotMatch(repositorySource, /rpc\("checkout_apply_card_event",p\)/);
assert.match(webhookSource, /applyCardEventV2\(\{[\s\S]*p_stripe_session_status: session\.status,[\s\S]*p_stripe_payment_status: session\.payment_status/);
assert.doesNotMatch(webhookSource, /\bapplyCardEvent\b/);
assert.match(v2Sql, /create or replace function public\.checkout_apply_card_event_v2\(/i);
assert.doesNotMatch(v2Sql, /create or replace function public\.checkout_apply_card_event\(/i);
assert.match(sql, /create or replace function public\.checkout_apply_card_event\(/i);
assert.doesNotMatch(v2Sql, /drop function[\s\S]*checkout_apply_card_event\(/i);
assert.match(v2Sql, /stripe_session_status=case when p_kind in \('paid','processing','expired'\) then p_stripe_session_status[\s\S]*stripe_payment_status=case when p_kind in \('paid','processing','expired'\) then p_stripe_payment_status/i);
assert.match(v2Sql, /p_kind='paid'[\s\S]*p_stripe_session_status is distinct from 'complete'[\s\S]*p_stripe_payment_status is distinct from 'paid'/i);
assert.match(v2Sql, /p_kind='expired'[\s\S]*p_stripe_session_status is distinct from 'expired'[\s\S]*p_stripe_payment_status not in \('paid','unpaid','no_payment_required'\)/i);
assert.match(v2Sql, /expired_at=coalesce\(expired_at,now\(\)\)/i);
assert.match(v2Sql, /p_kind='paid'[\s\S]*a\.failed_at is not null/i);
assert.match(v2Sql, /p_kind is null or p_kind not in/i);
assert.match(v2Sql, /p_amount is null or p_currency is null/i);
assert.match(v2Sql, /revoke all on function public\.checkout_apply_card_event_v2[\s\S]*from public,anon,authenticated/i);
assert.match(v2Sql, /grant execute on function public\.checkout_apply_card_event_v2[\s\S]*to service_role/i);
assert.doesNotMatch(v2Sql, /delete\s+from|security definer|execute\s+format|quote_requests/i);
assert.doesNotMatch(v2Sql, /IDS-B843E8271C51|stripe_webhook_events/i);
assert.match(webhookSource, /\["processed", "ignored"\]\.includes\(receiptState\)[\s\S]*return ok\(\)/);
assert.match(webhookSource, /receiptState === "processing"[\s\S]*status: 503/);
assert.match(successSource, /safeProjection\(record\)/);
assert.doesNotMatch(successSource, /stripeSessionStatus|stripePaymentStatus|stripe_session_status|stripe_payment_status/);
console.log("Stripe card checkout validation assertions passed (pure and static checks only).");
