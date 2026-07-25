import type { CatalogProduct, CatalogSalesMode } from "./types";

const quoteOnlyProductSlugs = new Set(["pandag-g1"]);

/** Public sales-channel behavior. This does not represent internal pricing data. */
export function salesModeForProductSlug(slug: string): CatalogSalesMode {
  return quoteOnlyProductSlugs.has(slug) ? "quote_only" : "self_service";
}

export function isSelfServiceProduct(
  product: Pick<CatalogProduct, "salesMode">
) {
  return product.salesMode === "self_service";
}

export function isQuoteOnlyProduct(
  product: Pick<CatalogProduct, "salesMode">
) {
  return product.salesMode === "quote_only";
}
