import "server-only";
import { sendIdsNotification } from "@/lib/email";
import { getSupabaseServiceClient } from "@/lib/supabase";
import type { OrderPriceSnapshot } from "@/lib/checkout/types";
import { paymentNotificationEventKey } from "@/lib/notifications/notification-keys";

export type PaymentNotificationType = "ach_processing" | "paid" | "payment_failed" | "refund" | "dispute";
export type OrderNotificationContext = {
  orderId: string; publicReference: string; orderStatus: string; paymentStatus: string;
  customerName: string; customerEmail: string | null; customerPhone: string | null;
  subtotalCents: number; discountCents: number; taxCents: number; shippingCents: number;
  totalCents: number; refundedCents: number; paymentMethod: string; paidAt: string | null;
  snapshot: OrderPriceSnapshot; referral: { referrerName: string; referrerEmail: string } | null;
};

type Dependencies = {
  claim: (eventKey: string, type: PaymentNotificationType, orderId: string) => Promise<{ claimed: boolean; eventId: string; claimedAt: string }>;
  context: (orderId: string) => Promise<OrderNotificationContext>;
  send: typeof sendIdsNotification;
  finish: (eventId: string, claimedAt: string, status: "sent" | "failed", errorCode: string | null) => Promise<void>;
};

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const itemLines = (snapshot: OrderPriceSnapshot) => [...snapshot.chargeableItems, ...snapshot.includedPackageComponents].map((item) => `- ${item.name} x ${item.quantity}${item.includedInPackagePrice ? " (included)" : ""}`);
const referralLines = (context: OrderNotificationContext) => context.referral ? ["", "REFERRAL ATTACHED", `Referrer name: ${context.referral.referrerName}`, `Referrer email: ${context.referral.referrerEmail}`] : [];

export function canonicalNotificationAllowed(type: PaymentNotificationType, context: OrderNotificationContext) {
  if (type === "paid") return context.orderStatus === "confirmed" && context.paymentStatus === "paid" && Boolean(context.paidAt);
  if (type === "ach_processing") return context.paymentMethod === "ach_debit" && context.paymentStatus === "processing";
  if (type === "payment_failed") return context.paymentStatus === "failed";
  if (type === "refund") return context.refundedCents > 0 && ["partially_refunded", "refunded"].includes(context.paymentStatus);
  return context.paymentStatus === "disputed";
}

export function paymentNotificationMessage(type: PaymentNotificationType, context: OrderNotificationContext) {
  const titles = {
    ach_processing: `IDS Website — New ACH Order — Payment Processing — ${context.publicReference}`,
    paid: `IDS Website — NEW PAID ORDER — ${context.publicReference}`,
    payment_failed: `IDS Website — Payment Failed — ${context.publicReference}`,
    refund: `IDS Website — Refund Recorded — ${context.publicReference}`,
    dispute: `IDS Website — PAYMENT DISPUTE — ${context.publicReference}`,
  } as const;
  const status = type === "ach_processing" ? ["PAYMENT STATUS: PROCESSING", "Do not treat this order as paid until ACH clears."] : [`Payment status: ${context.paymentStatus}`];
  const refund = type === "refund" ? [`Original order total: ${money(context.totalCents)}`, `Refunded amount: ${money(context.refundedCents)}`] : [];
  return { subject: titles[type], text: [
    ...status, `Order: ${context.publicReference}`, `Customer: ${context.customerName}`,
    `Email: ${context.customerEmail ?? "Not supplied"}`, `Phone: ${context.customerPhone ?? "Not supplied"}`,
    `Product: ${context.snapshot.product.name}`, `Payment method: ${context.paymentMethod}`,
    "Selected configuration/items:", ...itemLines(context.snapshot),
    `Subtotal: ${money(context.subtotalCents)}`, `Discount: ${money(context.discountCents)}`,
    `Tax: ${money(context.taxCents)}`, `Shipping: ${money(context.shippingCents)}`,
    `Final total: ${money(context.totalCents)}`, ...refund,
    ...(context.paidAt ? [`Paid at: ${context.paidAt}`] : []), ...referralLines(context),
  ].join("\n") };
}

export async function deliverPaymentNotification(input: { orderId: string; type: PaymentNotificationType; semanticId?: string }, dependencies: Dependencies) {
  const eventKey = paymentNotificationEventKey(input);
  const claim = await dependencies.claim(eventKey, input.type, input.orderId);
  if (!claim.claimed) return "skipped" as const;
  try {
    const context = await dependencies.context(input.orderId);
    if (!canonicalNotificationAllowed(input.type, context)) throw new Error("CANONICAL_STATE_MISMATCH");
    await dependencies.send(paymentNotificationMessage(input.type, context));
    await dependencies.finish(claim.eventId, claim.claimedAt, "sent", null);
    return "sent" as const;
  } catch {
    await dependencies.finish(claim.eventId, claim.claimedAt, "failed", "SEND_FAILED").catch(() => undefined);
    throw new Error("IDS notification delivery failed.");
  }
}

const productionDependencies: Dependencies = {
  async claim(eventKey, type, orderId) {
    const { data, error } = await getSupabaseServiceClient().rpc("checkout_claim_notification_event", { p_event_key: eventKey, p_notification_type: type, p_order_id: orderId });
    if (error || !data) throw new Error("Notification claim failed.");
    return data as { claimed: boolean; eventId: string; claimedAt: string };
  },
  async context(orderId) {
    const { data, error } = await getSupabaseServiceClient().rpc("checkout_notification_context", { p_order_id: orderId });
    if (error || !data) throw new Error("Notification context failed.");
    return data as OrderNotificationContext;
  },
  send: sendIdsNotification,
  async finish(eventId, claimedAt, status, errorCode) {
    const { error } = await getSupabaseServiceClient().rpc("checkout_finish_notification_event", { p_event_id: eventId, p_claimed_at: claimedAt, p_status: status, p_error_code: errorCode });
    if (error) throw new Error("Notification finalization failed.");
  },
};

export async function notifyPaymentBusinessEvent(input: { orderId: string; type: PaymentNotificationType; semanticId?: string }) {
  try { await deliverPaymentNotification(input, productionDependencies); }
  catch { console.error("Payment notification failed", { orderId: input.orderId, type: input.type }); }
}
