export const PRICING_KINDS = ["products", "variants", "packages", "options", "services", "service-payment-options", "product-services", "schedules"] as const;
export type PricingKind = (typeof PRICING_KINDS)[number];

export type PricingItem = {
  id: string;
  kind: PricingKind;
  category: string;
  name: string;
  slug: string;
  brand: string | null;
  productName: string | null;
  publicStatus: string | null;
  quoteOnly: boolean;
  targetLabel: string | null;
  values: Record<string, string | number | boolean | null>;
  effectivePriceCents: number | null;
  activeScheduleName: string | null;
  dealerCostCents: number | null;
};

export type PricingCatalog = { items: PricingItem[] };
