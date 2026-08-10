export type StoredCheckoutReconciliation = { orderId: string; attemptId: string; totalCents: number; currency: "usd" };
export type CheckoutSessionReconciliation = { livemode: boolean; status: string | null; mode: string | null; paymentMethodTypes: string[]; clientReferenceId: string | null; metadata: Record<string, string> | null; currency: string | null; amountTotal: number | null; paymentStatus: string };

export class WebhookReconciliationError extends Error {}

export function assertStripeEventMode(actualLivemode: boolean, expectedLivemode: boolean) {
  if (actualLivemode !== expectedLivemode) throw new WebhookReconciliationError("Stripe object mode does not match configured mode.");
}

function reconcileSessionIdentity(session: CheckoutSessionReconciliation, record: StoredCheckoutReconciliation, expectedLivemode: boolean) {
  assertStripeEventMode(session.livemode, expectedLivemode);
  if (session.mode !== "payment" || session.paymentMethodTypes.length !== 1 || session.paymentMethodTypes[0] !== "card" || session.clientReferenceId !== record.orderId || session.metadata?.order_id !== record.orderId || session.metadata?.attempt_id !== record.attemptId || session.currency !== record.currency || session.amountTotal !== record.totalCents) throw new WebhookReconciliationError("Checkout Session reconciliation failed.");
}

export function reconcileCompletedSession(session: CheckoutSessionReconciliation, record: StoredCheckoutReconciliation, expectedLivemode = false): "paid" {
  reconcileSessionIdentity(session, record, expectedLivemode);
  if (session.status !== "complete" || session.paymentStatus !== "paid") throw new WebhookReconciliationError("Completed Checkout Session is not paid.");
  return "paid";
}

export function reconcileExpiredSession(session: CheckoutSessionReconciliation, record: StoredCheckoutReconciliation, expectedLivemode = false): "expired" {
  reconcileSessionIdentity(session, record, expectedLivemode);
  if (session.status !== "expired" || !["paid", "unpaid", "no_payment_required"].includes(session.paymentStatus)) throw new WebhookReconciliationError("Expired Checkout Session has inconsistent status.");
  return "expired";
}

export function reconcileFinancialObject(actual: { livemode: boolean; amount: number; currency: string }, record: Pick<StoredCheckoutReconciliation, "totalCents" | "currency">, allowPartialAmount = false, expectedLivemode = false) {
  assertStripeEventMode(actual.livemode, expectedLivemode);
  const amountMatches = allowPartialAmount ? Number.isSafeInteger(actual.amount) && actual.amount > 0 && actual.amount <= record.totalCents : actual.amount === record.totalCents;
  if (!amountMatches || actual.currency !== record.currency) throw new WebhookReconciliationError("Financial object reconciliation failed.");
}
