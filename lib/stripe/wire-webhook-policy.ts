import { assertStripeEventMode, WebhookReconciliationError } from "./webhook-policy";

type RecordIdentity = { orderId: string; attemptId: string; totalCents: number; currency: "usd" };
type Session = { livemode: boolean; status: string|null; mode: string|null; paymentMethodTypes: string[]; clientReferenceId: string|null; metadata: Record<string,string>|null; currency: string|null; amountTotal: number|null; paymentStatus: string };
type Intent = { livemode: boolean; status: string; paymentMethodTypes: string[]; metadata: Record<string,string>; currency: string; amount: number; amountReceived: number };

export function reconcileWireSession(session: Session, record: RecordIdentity, expectedLivemode = false) {
  assertStripeEventMode(session.livemode, expectedLivemode);
  if (session.mode!=="payment" || session.paymentMethodTypes.length!==1 || session.paymentMethodTypes[0]!=="customer_balance" || session.clientReferenceId!==record.orderId || session.metadata?.order_id!==record.orderId || session.metadata?.attempt_id!==record.attemptId || session.metadata?.payment_method!=="wire_transfer" || session.currency!==record.currency || session.amountTotal!==record.totalCents) throw new WebhookReconciliationError("Wire Session reconciliation failed.");
}

export function reconcileWireIntent(intent: Intent, record: RecordIdentity, expectedLivemode = false) {
  assertStripeEventMode(intent.livemode, expectedLivemode);
  if (intent.paymentMethodTypes.length!==1 || intent.paymentMethodTypes[0]!=="customer_balance" || intent.metadata.order_id!==record.orderId || intent.metadata.attempt_id!==record.attemptId || intent.metadata.payment_method!=="wire_transfer" || intent.currency!==record.currency || intent.amount!==record.totalCents || !Number.isSafeInteger(intent.amountReceived) || intent.amountReceived<0) throw new WebhookReconciliationError("Wire PaymentIntent reconciliation failed.");
  const amountRemaining=Math.max(intent.amount-intent.amountReceived,0);
  if (intent.amountReceived>intent.amount) return {kind:"overpayment" as const,funded:intent.amountReceived,remaining:0};
  if (intent.status==="succeeded") return {kind:"paid" as const,funded:intent.amountReceived,remaining:amountRemaining};
  if (intent.status==="requires_action" && intent.amountReceived===0) return {kind:"awaiting_customer_funds" as const,funded:0,remaining:amountRemaining};
  if (intent.status==="requires_action" && intent.amountReceived>0 && intent.amountReceived<intent.amount) return {kind:"partially_funded" as const,funded:intent.amountReceived,remaining:amountRemaining};
  if (intent.status==="canceled" || intent.status==="requires_payment_method") return {kind:"failed" as const,funded:intent.amountReceived,remaining:amountRemaining};
  throw new WebhookReconciliationError("Unsupported wire PaymentIntent status.");
}
