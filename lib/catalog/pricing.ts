import type { CatalogPrice } from "./types";

export function formatCents(value: number | null) {
  if (value === null) return "Contact for pricing";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value / 100);
}

export function priceLabel(item: CatalogPrice) {
  if (item.contactForPricing || !item.showPublicPrice) {
    return "Contact for pricing";
  }

  return formatCents(item.currentPriceCents);
}
