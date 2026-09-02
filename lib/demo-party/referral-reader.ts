import type { OrderPriceSnapshot } from "@/lib/checkout/types";

export type DemoReferralOrder = { product: OrderPriceSnapshot["product"] };

export function demoReferralOrderFromRpc(value: unknown): DemoReferralOrder {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid referral order payload.");
  const order = value as Record<string, unknown>;
  if (!order.product || typeof order.product !== "object" || Array.isArray(order.product)) throw new Error("Invalid referral product payload.");
  const product = order.product as Record<string, unknown>;
  return {
    product: {
      id: String(product.id),
      slug: String(product.slug),
      name: String(product.name),
    },
  };
}
