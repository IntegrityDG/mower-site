import type { CatalogProduct, ProductBuildSelection } from "./types";
import { productBuildIsComplete } from "./selection";
import { IDS_CANONICAL_ORIGIN } from "../site-origin";

// Explicit publication list: adding catalog rows must not publish new SEO pages.
export const LYMOW_VARIANT_PAGES = {
  "5a": { variantSlug: "lymow-one-plus-5a", label: "5A", merchantSku: "IDS-LYMOW-ONE-PLUS-5A" },
  "10a": { variantSlug: "lymow-one-plus-10a", label: "10A", merchantSku: "IDS-LYMOW-ONE-PLUS-10A" },
} as const;

export type LymowConfiguration = keyof typeof LYMOW_VARIANT_PAGES;

export function isLymowConfiguration(value: string): value is LymowConfiguration {
  return Object.hasOwn(LYMOW_VARIANT_PAGES, value);
}

export function lymowVariantPath(configuration: LymowConfiguration) {
  return `/equipment/lymow-one-plus/${configuration}`;
}

export function lymowVariantPage(product: CatalogProduct, configuration: LymowConfiguration) {
  if (product.slug !== "lymow-one-plus") return null;
  const definition = LYMOW_VARIANT_PAGES[configuration];
  const variant = product.variants.find((item) => item.slug === definition.variantSlug);
  if (!variant) return null;
  const selection: ProductBuildSelection = { variantId: variant.id, packageId: "", optionQuantities: {} };
  const priced = variant.showPublicPrice && !variant.contactForPricing &&
    variant.currentPriceCents !== null && Number.isSafeInteger(variant.currentPriceCents) && variant.currentPriceCents > 0;
  const canPurchase = product.salesMode === "self_service" && product.showPublicPrice &&
    !product.contactForPricing && priced && productBuildIsComplete(product, selection);
  const path = lymowVariantPath(configuration);
  return {
    product, variant, configuration, path,
    url: `${IDS_CANONICAL_ORIGIN}${path}`,
    sku: variant.sku?.trim() || definition.merchantSku,
    name: `Lymow One Plus — ${definition.label} Configuration`,
    description: variant.description || `Lymow One Plus robotic mower with the included ${definition.label} charging configuration.`,
    canPurchase,
    availabilityLabel: !canPurchase ? "Currently unavailable for online purchase" :
      variant.purchaseState === "preorder" ? "Available for pre-order" : "Available to order",
    // Catalog sellability is not inventory. Only emit a stock-related enum when
    // the source establishes it; a bounded, authorized preorder is explicit.
    schemaAvailability: canPurchase && variant.purchaseState === "preorder"
      ? "https://schema.org/PreOrder" : undefined,
  };
}

export type LymowVariantPage = NonNullable<ReturnType<typeof lymowVariantPage>>;
