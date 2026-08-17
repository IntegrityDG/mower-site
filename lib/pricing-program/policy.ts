export type PricingPolicyRow = {
  display_msrp_price_cents?: number | null;
  regular_price_cents: number | null;
  sale_price_cents: number | null;
  sale_starts_at: string | null;
  sale_ends_at: string | null;
};

export function activeSalePriceCents(
  row: PricingPolicyRow,
  now = Date.now()
) {
  if (row.sale_price_cents === null) return null;

  const starts = row.sale_starts_at
    ? new Date(row.sale_starts_at).getTime()
    : Number.NEGATIVE_INFINITY;

  const ends = row.sale_ends_at
    ? new Date(row.sale_ends_at).getTime()
    : Number.POSITIVE_INFINITY;

  return now >= starts && now <= ends ? row.sale_price_cents : null;
}

export function sellingPriceCents(
  row: PricingPolicyRow,
  everydayLowPriceEnabled = true,
  now = Date.now()
) {
  const salePrice = activeSalePriceCents(row, now);

  if (salePrice !== null) return salePrice;

  if (
    !everydayLowPriceEnabled &&
    row.display_msrp_price_cents !== null &&
    row.display_msrp_price_cents !== undefined
  ) {
    return row.display_msrp_price_cents;
  }

  return row.regular_price_cents;
}
