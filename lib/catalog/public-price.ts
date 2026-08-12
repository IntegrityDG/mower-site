import type { CatalogPrice } from "./types";
import { applyActivePriceSchedule, selectActivePriceSchedule, type ActivePriceSchedule, type PriceScheduleTarget } from "./active-price-schedule";

export type PublicPriceRow = {
  display_msrp_price_cents: number | null;
  regular_price_cents: number | null;
  sale_price_cents: number | null;
  sale_starts_at: string | null;
  sale_ends_at: string | null;
  promotion_label: string | null;
  show_public_price: boolean;
  contact_for_pricing: boolean;
};

export function priceFromRow(row: PublicPriceRow, now = Date.now()): CatalogPrice {
  const startsAt = row.sale_starts_at ? new Date(row.sale_starts_at).getTime() : Number.NEGATIVE_INFINITY;
  const endsAt = row.sale_ends_at ? new Date(row.sale_ends_at).getTime() : Number.POSITIVE_INFINITY;
  const saleIsActive = row.sale_price_cents !== null && now >= startsAt && now <= endsAt;
  return { displayMsrpPriceCents:row.display_msrp_price_cents, regularPriceCents:row.regular_price_cents, salePriceCents:row.sale_price_cents, currentPriceCents:saleIsActive ? row.sale_price_cents : row.regular_price_cents, showPublicPrice:row.show_public_price, contactForPricing:row.contact_for_pricing, promotionLabel:saleIsActive ? row.promotion_label : null, saleIsActive, saleEndsAt:saleIsActive ? row.sale_ends_at : null };
}

export function scheduledPublicPrice(row: PublicPriceRow, schedules: readonly ActivePriceSchedule[], target: PriceScheduleTarget, targetId: string, now = Date.now()) {
  const schedule = selectActivePriceSchedule(schedules, target, targetId, now);
  return { price: priceFromRow(applyActivePriceSchedule(row, schedule), now), schedule };
}
