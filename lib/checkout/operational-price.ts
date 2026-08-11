export type OperationalPriceRow = {
  regular_price_cents: number | null;
  sale_price_cents: number | null;
  sale_starts_at: string | null;
  sale_ends_at: string | null;
};

/** Checkout price precedence is active temporary sale, then IDS everyday price. */
export function operationalPriceCents(row: OperationalPriceRow, now = Date.now()) {
  const starts = row.sale_starts_at ? new Date(row.sale_starts_at).getTime() : Number.NEGATIVE_INFINITY;
  const ends = row.sale_ends_at ? new Date(row.sale_ends_at).getTime() : Number.POSITIVE_INFINITY;
  return row.sale_price_cents !== null && now >= starts && now <= ends ? row.sale_price_cents : row.regular_price_cents;
}
