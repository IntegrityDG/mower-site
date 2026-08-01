import type { FulfillmentStatus, OrderStatus, PaymentAttemptStatus, PaymentStatus } from "./types";

export type CheckoutState = { orderStatus: OrderStatus; paymentStatus: PaymentStatus; fulfillmentStatus: FulfillmentStatus; refundedCents: number; totalCents: number };
const paymentTransitions: Record<PaymentStatus, readonly PaymentStatus[]> = {
  unpaid: ["unpaid", "awaiting_customer_action", "processing", "awaiting_customer_funds", "partially_funded", "paid", "failed"],
  awaiting_customer_action: ["awaiting_customer_action", "processing", "paid", "failed"],
  processing: ["processing", "paid", "failed"],
  awaiting_customer_funds: ["awaiting_customer_funds", "partially_funded", "paid", "failed"],
  partially_funded: ["partially_funded", "paid", "failed"],
  failed: ["failed", "processing", "paid"], paid: ["paid", "partially_refunded", "refunded", "disputed"],
  partially_refunded: ["partially_refunded", "refunded", "disputed"], refunded: ["refunded", "disputed"], disputed: ["disputed", "partially_refunded", "refunded"],
};
const attemptTransitions: Record<PaymentAttemptStatus, readonly PaymentAttemptStatus[]> = {
  creating: ["creating", "open", "awaiting_customer_action", "awaiting_customer_funds", "failed"],
  open: ["open", "awaiting_customer_action", "completed", "processing", "awaiting_customer_funds", "succeeded", "failed", "expired"],
  awaiting_customer_action: ["awaiting_customer_action", "processing", "succeeded", "failed", "expired"],
  completed: ["completed", "processing", "succeeded", "failed"], processing: ["processing", "succeeded", "failed"],
  awaiting_customer_funds: ["awaiting_customer_funds", "partially_funded", "succeeded", "failed", "expired"],
  partially_funded: ["partially_funded", "succeeded", "failed"],
  succeeded: ["succeeded"], failed: ["failed"], expired: ["expired"],
};

export function canTransitionAttempt(from: PaymentAttemptStatus, to: PaymentAttemptStatus) { return attemptTransitions[from].includes(to); }

export function transitionCheckoutState(current: CheckoutState, next: CheckoutState, actor: "webhook" | "server" | "success_page" = "webhook") {
  if (actor === "success_page") throw new Error("The success page cannot change checkout state.");
  if (!paymentTransitions[current.paymentStatus].includes(next.paymentStatus)) throw new Error("Invalid or out-of-order payment transition.");
  if (!Number.isSafeInteger(next.refundedCents) || next.refundedCents < current.refundedCents || next.refundedCents > next.totalCents) throw new Error("Invalid refunded amount.");
  if ((next.paymentStatus === "partially_refunded" && (next.refundedCents <= 0 || next.refundedCents >= next.totalCents)) || (next.paymentStatus === "refunded" && next.refundedCents !== next.totalCents)) throw new Error("Refund state does not reconcile.");
  if ((next.fulfillmentStatus === "pending" || next.fulfillmentStatus === "fulfilled") && !["paid", "partially_refunded", "disputed"].includes(next.paymentStatus)) throw new Error("Fulfillment cannot begin before payment is paid.");
  if (current.fulfillmentStatus === "fulfilled" && next.fulfillmentStatus === "pending") throw new Error("Fulfillment cannot move backward.");
  if (current.orderStatus === "confirmed" && next.orderStatus === "draft") throw new Error("Confirmed order cannot become a draft.");
  return Object.freeze({ ...next });
}
