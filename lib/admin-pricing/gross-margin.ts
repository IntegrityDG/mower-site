export function grossProfitCents(sellingPriceCents: number | null, dealerCostCents: number | null) {
  if (sellingPriceCents === null || dealerCostCents === null) return null;
  return sellingPriceCents - dealerCostCents;
}

export function grossMarginPercent(sellingPriceCents: number | null, dealerCostCents: number | null) {
  const profit = grossProfitCents(sellingPriceCents, dealerCostCents);
  if (profit === null || sellingPriceCents === null || sellingPriceCents === 0) return null;
  return (profit / sellingPriceCents) * 100;
}
