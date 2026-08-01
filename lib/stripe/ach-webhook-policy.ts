import { WebhookReconciliationError } from "./webhook-policy";

type RecordIdentity = { orderId: string; attemptId: string; totalCents: number; currency: "usd" };
type Session = { livemode: boolean; status: string | null; mode: string | null; paymentMethodTypes: string[]; clientReferenceId: string | null; metadata: Record<string,string>|null; currency: string|null; amountTotal: number|null; paymentStatus: string };
type Intent = { livemode: boolean; status: string; paymentMethodTypes: string[]; metadata: Record<string,string>; currency: string; amount: number };

export function reconcileAchSession(session: Session, record: RecordIdentity) {
  if (session.livemode || session.mode!=="payment" || session.paymentMethodTypes.length!==1 || session.paymentMethodTypes[0]!=="us_bank_account" || session.clientReferenceId!==record.orderId || session.metadata?.order_id!==record.orderId || session.metadata?.attempt_id!==record.attemptId || session.metadata?.payment_method!=="ach_debit" || session.currency!==record.currency || session.amountTotal!==record.totalCents) throw new WebhookReconciliationError("ACH Session reconciliation failed.");
}

export function reconcileAchIntent(intent: Intent, record: RecordIdentity) {
  if (intent.livemode || intent.paymentMethodTypes.length!==1 || intent.paymentMethodTypes[0]!=="us_bank_account" || intent.metadata.order_id!==record.orderId || intent.metadata.attempt_id!==record.attemptId || intent.metadata.payment_method!=="ach_debit" || intent.currency!==record.currency || intent.amount!==record.totalCents) throw new WebhookReconciliationError("ACH PaymentIntent reconciliation failed.");
  if (intent.status==="requires_action") return "awaiting_customer_action" as const;
  if (intent.status==="processing") return "processing" as const;
  if (intent.status==="succeeded") return "paid" as const;
  if (intent.status==="requires_payment_method" || intent.status==="canceled") return "failed" as const;
  throw new WebhookReconciliationError("Unsupported ACH PaymentIntent status.");
}
