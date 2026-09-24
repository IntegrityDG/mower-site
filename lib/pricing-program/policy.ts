import { isWithinPriceWindow, priceWindowState } from "./window";

export type PricingPolicyRow = {
  display_msrp_price_cents?: number | null;
  regular_price_cents: number | null;
  sale_price_cents: number | null;
  sale_starts_at: string | null;
  sale_ends_at: string | null;
};

export function activeSalePriceCents(
  row: PricingPolicyRow,
  now = Date.now(),
) {
  if (row.sale_price_cents === null) return null;
  return isWithinPriceWindow(
    { startsAt: row.sale_starts_at, endsAt: row.sale_ends_at },
    now,
  )
    ? row.sale_price_cents
    : null;
}

export type SellingPriceSource =
  | "temporary_sale"
  | "ids_everyday"
  | "manufacturer_msrp"
  | "unpriced";

export function sellingPriceDecision(
  row: PricingPolicyRow,
  everydayLowPriceEnabled = true,
  now = Date.now(),
) {
  const salePrice = activeSalePriceCents(row, now);
  const saleState = priceWindowState(
    row.sale_price_cents !== null,
    { startsAt: row.sale_starts_at, endsAt: row.sale_ends_at },
    now,
  );

  if (salePrice !== null) {
    return { priceCents: salePrice, source: "temporary_sale" as const, saleState };
  }

  if (
    !everydayLowPriceEnabled &&
    row.display_msrp_price_cents !== null &&
    row.display_msrp_price_cents !== undefined
  ) {
    return {
      priceCents: row.display_msrp_price_cents,
      source: "manufacturer_msrp" as const,
      saleState,
    };
  }

  if (row.regular_price_cents !== null) {
    return {
      priceCents: row.regular_price_cents,
      source: "ids_everyday" as const,
      saleState,
    };
  }

  return { priceCents: null, source: "unpriced" as const, saleState };
}

export function sellingPriceCents(
  row: PricingPolicyRow,
  everydayLowPriceEnabled = true,
  now = Date.now(),
) {
  return sellingPriceDecision(row, everydayLowPriceEnabled, now).priceCents;
}
