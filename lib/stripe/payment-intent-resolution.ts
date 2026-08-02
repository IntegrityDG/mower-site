import type Stripe from "stripe";
import type { CheckoutRecord } from "@/lib/checkout/order-repository";

export class IdsPaymentIntentResolutionError extends Error {
  constructor(message: string, public readonly details: Record<string, string | null>) { super(message); this.name = "IdsPaymentIntentResolutionError"; }
}

type Dependencies = {
  findByPaymentIntentId(id: string): Promise<CheckoutRecord | null>;
  findBySessionId(id: string): Promise<CheckoutRecord | null>;
  linkByIdentity(input: { paymentIntentId: string; orderId: string; attemptId: string; paymentMethod: string }): Promise<CheckoutRecord>;
  listSessions(paymentIntentId: string): Promise<Stripe.Checkout.Session[]>;
};

export type PaymentIntentResolution = { record: CheckoutRecord; session: Stripe.Checkout.Session | null } | null;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const identity = (metadata: Stripe.Metadata | null | undefined) => {
  const orderId = metadata?.order_id?.trim() ?? "";
  const attemptId = metadata?.attempt_id?.trim() ?? "";
  const paymentMethod = metadata?.payment_method?.trim() ?? "";
  const owns = Boolean(orderId || attemptId || metadata?.public_reference || metadata?.checkout_policy);
  if (!owns) return null;
  if (!uuid.test(orderId) || !uuid.test(attemptId) || !["card", "ach_debit", "wire_transfer"].includes(paymentMethod)) {
    throw new IdsPaymentIntentResolutionError("IDS PaymentIntent has incomplete or invalid identity metadata.", { orderId: orderId || null, attemptId: attemptId || null, paymentMethod: paymentMethod || null });
  }
  return { orderId, attemptId, paymentMethod };
};

export async function resolvePaymentIntent(intent: Stripe.PaymentIntent, dependencies: Dependencies): Promise<PaymentIntentResolution> {
  const linked = await dependencies.findByPaymentIntentId(intent.id);
  if (linked) return { record: linked, session: null };

  const metadataIdentity = identity(intent.metadata);
  if (metadataIdentity) {
    try { return { record: await dependencies.linkByIdentity({ paymentIntentId: intent.id, ...metadataIdentity }), session: null }; }
    catch (error) { throw new IdsPaymentIntentResolutionError("IDS PaymentIntent metadata did not match a linkable payment attempt.", { paymentIntentId: intent.id, orderId: metadataIdentity.orderId, attemptId: metadataIdentity.attemptId, paymentMethod: metadataIdentity.paymentMethod, cause: error instanceof Error ? error.message : "unknown" }); }
  }

  const sessions = await dependencies.listSessions(intent.id);
  if (sessions.length === 0) return null;
  if (sessions.length !== 1) throw new IdsPaymentIntentResolutionError("PaymentIntent is associated with multiple Checkout Sessions.", { paymentIntentId: intent.id });
  const session = sessions[0];
  const sessionRecord = await dependencies.findBySessionId(session.id);
  if (!sessionRecord) {
    const sessionIdentity = identity(session.metadata);
    if (!sessionIdentity) return null;
    throw new IdsPaymentIntentResolutionError("IDS Checkout Session exists but its payment attempt is not linked.", { paymentIntentId: intent.id, sessionId: session.id, orderId: sessionIdentity.orderId, attemptId: sessionIdentity.attemptId });
  }
  const record = await dependencies.linkByIdentity({ paymentIntentId: intent.id, orderId: sessionRecord.orderId, attemptId: sessionRecord.attemptId, paymentMethod: sessionRecord.snapshot.paymentMethod });
  return { record, session };
}
