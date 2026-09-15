import type { CheckoutRecord } from "./order-repository";

/** Explicit public allowlist; preorder identity comes from the immutable order, never today's catalog. */
export function safeProjection(record: CheckoutRecord) {
  return {
    preorderNotice: record.snapshot.preorder?.notice ?? null,
    publicReference: record.publicReference,
    attemptStatus: record.attemptStatus,
    paymentStatus: record.paymentStatus,
    orderStatus: record.orderStatus,
    fulfillmentStatus: record.fulfillmentStatus,
    currency: record.currency,
    totalCents: record.totalCents,
    refundedCents: record.refundedCents,
    fundedAmountCents: record.fundedAmountCents,
    amountRemainingCents: record.amountRemainingCents,
    items: [...record.snapshot.chargeableItems, ...record.snapshot.includedPackageComponents]
      .map((item) => ({ name: item.name, quantity: item.quantity, included: item.includedInPackagePrice })),
  };
}
