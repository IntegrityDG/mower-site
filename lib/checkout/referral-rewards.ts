import type { CheckoutRequest, OrderPriceSnapshot } from "./types";

export const REFERRAL_SCHEDULE_VERSION = "ids-referral-schedule-2026-08-08";

const schedules = {
  lymow: { brand: "Lymow", baseRewardCents: 5_000, higherTierRewardCents: 7_500 },
  yarbo: { brand: "Yarbo", baseRewardCents: 10_000, higherTierRewardCents: 15_000 },
  pandag: { brand: "Pandag", baseRewardCents: 75_000, higherTierRewardCents: 100_000 },
} as const;

export function referralRewardForProduct(product: OrderPriceSnapshot["product"]) {
  const key = product.slug.toLowerCase().startsWith("lymow")
    ? "lymow"
    : product.slug.toLowerCase().startsWith("yarbo")
      ? "yarbo"
      : product.slug.toLowerCase().startsWith("pandag")
        ? "pandag"
        : null;
  if (!key) throw new Error("No referral reward schedule exists for this equipment.");
  return schedules[key];
}

export function privateReferralRecord(
  orderId: string | null,
  request: CheckoutRequest,
  snapshot: OrderPriceSnapshot
) {
  if (!request.referral) return null;
  const schedule = referralRewardForProduct(snapshot.product);
  return {
    ...(orderId ? { order_id: orderId } : {}),
    referrer_name: request.referral.referrerName,
    referrer_email: request.referral.referrerEmail.toLowerCase(),
    qualifying_brand: schedule.brand,
    product_id: snapshot.product.id,
    product_slug_snapshot: snapshot.product.slug,
    product_name_snapshot: snapshot.product.name,
    base_reward_cents: schedule.baseRewardCents,
    higher_tier_reward_cents: schedule.higherTierRewardCents,
    schedule_version: REFERRAL_SCHEDULE_VERSION,
    status: "pending",
  };
}
