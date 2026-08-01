export type AchEventKind = "awaiting_customer_action" | "processing" | "paid" | "failed" | "expired" | "refund" | "dispute";
export type WireEventKind = "awaiting_customer_funds" | "partially_funded" | "paid" | "failed" | "expired" | "refund" | "dispute" | "overpayment";

export function achTransition(kind: AchEventKind) {
  if (kind === "awaiting_customer_action") return { orderStatus: "checkout_pending", paymentStatus: "awaiting_customer_action", fulfillmentStatus: "not_ready", attemptStatus: "awaiting_customer_action" } as const;
  if (kind === "processing") return { orderStatus: "payment_processing", paymentStatus: "processing", fulfillmentStatus: "not_ready", attemptStatus: "processing" } as const;
  if (kind === "paid") return { orderStatus: "confirmed", paymentStatus: "paid", fulfillmentStatus: "pending", attemptStatus: "succeeded" } as const;
  if (kind === "failed") return { orderStatus: "checkout_pending", paymentStatus: "failed", fulfillmentStatus: "not_ready", attemptStatus: "failed" } as const;
  if (kind === "expired") return { orderStatus: "checkout_pending", paymentStatus: "unpaid", fulfillmentStatus: "not_ready", attemptStatus: "expired" } as const;
  if (kind === "refund") return { paymentStatus: "refunded" } as const;
  return { paymentStatus: "disputed" } as const;
}

export function wireTransition(kind: WireEventKind) {
  if (kind === "awaiting_customer_funds") return { orderStatus: "checkout_pending", paymentStatus: "awaiting_customer_funds", fulfillmentStatus: "not_ready", attemptStatus: "awaiting_customer_funds" } as const;
  if (kind === "partially_funded") return { orderStatus: "checkout_pending", paymentStatus: "partially_funded", fulfillmentStatus: "not_ready", attemptStatus: "partially_funded" } as const;
  if (kind === "paid") return { orderStatus: "confirmed", paymentStatus: "paid", fulfillmentStatus: "pending", attemptStatus: "succeeded" } as const;
  if (kind === "failed") return { orderStatus: "checkout_pending", paymentStatus: "failed", fulfillmentStatus: "not_ready", attemptStatus: "failed" } as const;
  if (kind === "expired") return { orderStatus: "checkout_pending", paymentStatus: "unpaid", fulfillmentStatus: "not_ready", attemptStatus: "expired" } as const;
  if (kind === "refund") return { paymentStatus: "refunded" } as const;
  if (kind === "dispute") return { paymentStatus: "disputed" } as const;
  return { reviewRequired: true } as const;
}
