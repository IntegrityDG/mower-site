export const PRICING_KINDS = ["products", "variants", "packages", "options", "services", "service-payment-options", "product-services", "schedules"] as const;
export type PricingKind = (typeof PRICING_KINDS)[number];

export type PricingMessageContext = "ids" | "sale";

export type PricingPromotionMessage = {
  message: string | null;
  imagePath: string | null;
  isPublic: boolean;
};

export type PricingItem = {
  id: string;
  kind: PricingKind;
  category: string;
  name: string;
  slug: string;
  brand: string | null;
  productName: string | null;
  publicStatus: string | null;
  availabilityField: "public_status" | "is_available";
  availabilityStatus: string;
  isAvailable: boolean;
  quoteOnly: boolean;
  targetLabel: string | null;
  values: Record<string, string | number | boolean | null>;
  effectivePriceCents: number | null;
  activeScheduleName: string | null;

  /** Dealer cost currently used for IDS profit/margin calculations. */
  dealerCostCents: number | null;

  /** Permanent/base dealer cost stored in catalog_internal_pricing. */
  normalDealerCostCents: number | null;

  /** Currently active manufacturer promotional dealer cost, if any. */
  promotionalDealerCostCents: number | null;
  promotionalDealerCostStartsAt: string | null;
  promotionalDealerCostEndsAt: string | null;

  idsPriceMessage: PricingPromotionMessage;
  salePriceMessage: PricingPromotionMessage;
};

export type PricingCatalog = { items: PricingItem[] };
