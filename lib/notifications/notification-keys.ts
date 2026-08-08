import type { PaymentNotificationType } from "@/lib/notifications/payment-notifications";

export function refundNotificationSemanticId(cumulativeRefundedCents: number) {
  if (!Number.isSafeInteger(cumulativeRefundedCents) || cumulativeRefundedCents <= 0) {
    throw new Error("Invalid cumulative refunded amount.");
  }
  return `cumulative-${cumulativeRefundedCents}`;
}

export function paymentNotificationEventKey(input: { orderId: string; type: PaymentNotificationType; semanticId?: string }) {
  const suffix = input.semanticId ? `${input.type}:${input.semanticId}` : input.type;
  return `order:${input.orderId}:${suffix}`;
}
