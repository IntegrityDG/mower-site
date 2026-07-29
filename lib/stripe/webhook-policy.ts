export type StoredCheckoutReconciliation = { orderId: string; attemptId: string; totalCents: number; currency: "usd" };
export type CompletedSessionReconciliation = { livemode: boolean; mode: string | null; paymentMethodTypes: string[]; clientReferenceId: string | null; metadata: Record<string, string> | null; currency: string | null; amountTotal: number | null; paymentStatus: string };

export class WebhookReconciliationError extends Error {}

export function assertTestEvent(livemode: boolean) {
  if (livemode) throw new WebhookReconciliationError("Live events are not accepted.");
}

export function reconcileCompletedSession(session: CompletedSessionReconciliation, record: StoredCheckoutReconciliation): "paid" | "processing" {
  assertTestEvent(session.livemode);
  if (session.mode !== "payment" || session.paymentMethodTypes.length !== 1 || session.paymentMethodTypes[0] !== "card" || session.clientReferenceId !== record.orderId || session.metadata?.order_id !== record.orderId || session.metadata?.attempt_id !== record.attemptId || session.currency !== record.currency || session.amountTotal !== record.totalCents) throw new WebhookReconciliationError("Checkout Session reconciliation failed.");
  return session.paymentStatus === "paid" ? "paid" : "processing";
}

export function reconcileFinancialObject(actual: { livemode: boolean; amount: number; currency: string }, record: Pick<StoredCheckoutReconciliation, "totalCents" | "currency">, allowPartialAmount = false) {
  assertTestEvent(actual.livemode);
  const amountMatches = allowPartialAmount ? Number.isSafeInteger(actual.amount) && actual.amount > 0 && actual.amount <= record.totalCents : actual.amount === record.totalCents;
  if (!amountMatches || actual.currency !== record.currency) throw new WebhookReconciliationError("Financial object reconciliation failed.");
}
