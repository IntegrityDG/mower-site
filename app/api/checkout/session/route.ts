import { NextResponse } from "next/server";
import Stripe from "stripe";
import { parseCheckoutRequest, MAX_CHECKOUT_REQUEST_BYTES } from "@/lib/checkout/request-schema";
import { resolveAuthoritativeOrderPricing } from "@/lib/checkout/pricing-resolver";
import { checkoutAttemptIdempotencyKey, checkoutRequestFingerprint } from "@/lib/checkout/idempotency";
import { createCardCheckoutDraft, linkCheckoutSession, CheckoutRepositoryError } from "@/lib/checkout/order-repository";
import { buildCardCheckoutSession } from "@/lib/stripe/checkout-session";
import { getStripeConfiguration, StripeConfigurationError } from "@/lib/stripe/config";
import { getStripeServerClient } from "@/lib/stripe/server";
import { CheckoutRejectionError, type CheckoutRequest } from "@/lib/checkout/types";
import { paymentMethodIsAvailableForNewCheckout } from "@/lib/checkout/payment-method-availability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const jsonError = (error: string, status: number) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
async function readLimitedBody(request: Request) {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_CHECKOUT_REQUEST_BYTES) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: true }).decode(body);
}

export async function POST(request: Request) {
  if (!(await paymentMethodIsAvailableForNewCheckout("card"))) return jsonError("Card checkout is temporarily unavailable.", 503);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return jsonError("Content-Type must be application/json.", 400);
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(declaredLength) || declaredLength < 0 || declaredLength > MAX_CHECKOUT_REQUEST_BYTES) return jsonError("Checkout request is too large.", 400);
  let rawBody: string | null;
  try { rawBody = await readLimitedBody(request); }
  catch { return jsonError("Invalid checkout request.", 400); }
  if (rawBody === null) return jsonError("Checkout request is too large.", 400);

  let input: CheckoutRequest;
  try { input = parseCheckoutRequest(JSON.parse(rawBody)); }
  catch { return jsonError("Invalid checkout request.", 400); }
  if (input.paymentMethod !== "card") return jsonError("Only card checkout is available.", 400);

  try {
    const config = getStripeConfiguration();
    const snapshot = await resolveAuthoritativeOrderPricing(input);
    const fingerprint = checkoutRequestFingerprint(input);
    const idempotencyKey = checkoutAttemptIdempotencyKey(input.requestId);
    const draft = await createCardCheckoutDraft(input, snapshot, idempotencyKey, fingerprint);
    const attemptCreatedAt = new Date(draft.attemptCreatedAt).getTime();
    if (!Number.isFinite(attemptCreatedAt)) throw new CheckoutRepositoryError("UNAVAILABLE");
    const parameters = buildCardCheckoutSession({ snapshot, orderId: draft.orderId, attemptId: draft.attemptId, publicReference: draft.publicReference, customerEmail: input.customer.email, appBaseUrl: config.appBaseUrl, signingSecret: config.checkoutSigningSecret, returnPath: `/equipment/${snapshot.product.slug}`, cancelExpiresAt: attemptCreatedAt + 30 * 60_000 });
    const session = await getStripeServerClient().checkout.sessions.create(parameters, { idempotencyKey: draft.stripeIdempotencyKey });
    if (!session.url) throw new Error("checkout_session_missing_url");
    await linkCheckoutSession(draft.attemptId, { id: session.id, payment_intent: typeof session.payment_intent === "string" ? session.payment_intent : null, status: session.status, payment_status: session.payment_status, created: session.created, expires_at: session.expires_at });
    return NextResponse.json({ checkoutUrl: session.url, publicOrderReference: draft.publicReference, attemptStatus: session.status === "open" ? "open" : draft.attemptStatus }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof CheckoutRejectionError) return jsonError(error.message, 422);
    if (error instanceof StripeConfigurationError) return jsonError("Card checkout is temporarily unavailable.", 503);
    if (error instanceof CheckoutRepositoryError) return error.code === "CONFLICT" ? jsonError("This request ID was already used for different checkout details.", 409) : jsonError("Card checkout is temporarily unavailable.", 503);
    if (error instanceof Stripe.errors.StripeError) return jsonError("Stripe Checkout could not be created.", 502);
    return jsonError("Card checkout is temporarily unavailable.", 503);
  }
}
