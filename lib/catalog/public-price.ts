import type { CatalogPrice } from "./types";
import { applyActivePriceSchedule, selectActivePriceSchedule, type ActivePriceSchedule, type PriceScheduleTarget } from "./active-price-schedule";
import { activeSalePriceCents, sellingPriceCents } from "@/lib/pricing-program/policy";
import { priceWindowState } from "@/lib/pricing-program/window";

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

export function priceFromRow(
  row: PublicPriceRow,
  now = Date.now(),
  everydayLowPriceEnabled = true
): CatalogPrice {
  const saleIsActive = activeSalePriceCents(row, now) !== null;
  const salePhase = priceWindowState(
    row.sale_price_cents !== null,
    { startsAt: row.sale_starts_at, endsAt: row.sale_ends_at },
    now,
  );

  return {
    displayMsrpPriceCents: row.display_msrp_price_cents,
    regularPriceCents: row.regular_price_cents,
    salePriceCents: row.sale_price_cents,
    currentPriceCents: sellingPriceCents(row, everydayLowPriceEnabled, now),
    showPublicPrice: row.show_public_price,
    contactForPricing: row.contact_for_pricing,
    promotionLabel: saleIsActive ? row.promotion_label : null,
    scheduledSaleLabel: row.promotion_label,
    saleIsActive,
    saleStartsAt: row.sale_starts_at,
    saleEndsAt: row.sale_ends_at,
    salePhase,
    everydayLowPriceEnabled,
  };
}

export function scheduledPublicPrice(
  row: PublicPriceRow,
  schedules: readonly ActivePriceSchedule[],
  target: PriceScheduleTarget,
  targetId: string,
  now = Date.now(),
  everydayLowPriceEnabled = true
) {
  const schedule = selectActivePriceSchedule(schedules, target, targetId, now);

  return {
    price: priceFromRow(
      applyActivePriceSchedule(row, schedule),
      now,
      everydayLowPriceEnabled
    ),
    schedule,
  };
}
