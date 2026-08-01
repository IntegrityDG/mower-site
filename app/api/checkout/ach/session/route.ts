import { NextResponse } from "next/server";
import Stripe from "stripe";
import { checkoutAttemptIdempotencyKey, checkoutRequestFingerprint } from "@/lib/checkout/idempotency";
import { createAchCheckoutDraft, linkAchCheckoutSession, CheckoutRepositoryError } from "@/lib/checkout/order-repository";
import { paymentMethodIsServerEnabled } from "@/lib/checkout/payment-method-availability";
import { resolveAuthoritativeOrderPricing } from "@/lib/checkout/pricing-resolver";
import { MAX_CHECKOUT_REQUEST_BYTES, parseCheckoutRequest, readLimitedCheckoutBody } from "@/lib/checkout/request-schema";
import { CheckoutRejectionError } from "@/lib/checkout/types";
import { buildAchCheckoutSession } from "@/lib/stripe/ach-checkout-session";
import { getStripeConfiguration, StripeConfigurationError } from "@/lib/stripe/config";
import { getStripeServerClient } from "@/lib/stripe/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const jsonError = (error: string, status: number) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  if (!paymentMethodIsServerEnabled("ach_debit")) return jsonError("Not found.", 404);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return jsonError("Content-Type must be application/json.", 400);
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(declaredLength) || declaredLength < 0 || declaredLength > MAX_CHECKOUT_REQUEST_BYTES) return jsonError("Checkout request is too large.", 400);
  let raw: string | null;
  try { raw = await readLimitedCheckoutBody(request); } catch { return jsonError("Invalid checkout request.", 400); }
  if (raw === null) return jsonError("Checkout request is too large.", 400);
  let input;
  try { input = parseCheckoutRequest(JSON.parse(raw)); } catch { return jsonError("Invalid checkout request.", 400); }
  if (input.paymentMethod !== "ach_debit") return jsonError("ACH checkout requires ach_debit.", 400);
  try {
    const config = getStripeConfiguration();
    const snapshot = await resolveAuthoritativeOrderPricing(input);
    const fingerprint = checkoutRequestFingerprint(input);
    const idempotencyKey = checkoutAttemptIdempotencyKey(input.requestId, "ach_debit");
    const draft = await createAchCheckoutDraft(input, snapshot, idempotencyKey, fingerprint);
    const createdAt = new Date(draft.attemptCreatedAt).getTime();
    if (!Number.isFinite(createdAt)) throw new CheckoutRepositoryError("UNAVAILABLE");
    const parameters = buildAchCheckoutSession({ snapshot, orderId: draft.orderId, attemptId: draft.attemptId, publicReference: draft.publicReference, customerEmail: input.customer.email, appBaseUrl: config.appBaseUrl, signingSecret: config.checkoutSigningSecret, returnPath: `/equipment/${snapshot.product.slug}`, cancelExpiresAt: createdAt + 30 * 60_000 });
    const session = await getStripeServerClient().checkout.sessions.create(parameters, { idempotencyKey: draft.stripeIdempotencyKey });
    if (!session.url) throw new Error("checkout_session_missing_url");
    await linkAchCheckoutSession(draft.attemptId, { id: session.id, payment_intent: typeof session.payment_intent === "string" ? session.payment_intent : null, status: session.status, payment_status: session.payment_status, payment_intent_status: null, created: session.created, expires_at: session.expires_at });
    return NextResponse.json({ checkoutUrl: session.url, publicOrderReference: draft.publicReference, attemptStatus: session.status === "open" ? "open" : draft.attemptStatus }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof CheckoutRejectionError) return jsonError(error.message, 422);
    if (error instanceof StripeConfigurationError) return jsonError("ACH checkout is temporarily unavailable.", 503);
    if (error instanceof CheckoutRepositoryError) return error.code === "CONFLICT" ? jsonError("This request ID was already used for different checkout details.", 409) : jsonError("ACH checkout is temporarily unavailable.", 503);
    if (error instanceof Stripe.errors.StripeError) return jsonError("Stripe Checkout could not be created.", 502);
    return jsonError("ACH checkout is temporarily unavailable.", 503);
  }
}
