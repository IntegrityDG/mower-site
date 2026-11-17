import type { CatalogProduct, CatalogSalesMode } from "./types";

// Product-level exception only: no substring matching of refurbished accessories.
const availabilityCheckProductSlugs = new Set([
  "yarbo-refurbished-y40-snow-blower-lawn-mower",
  "yarbo-refurbished-y40-snow-blower",
  "yarbo-refurbished-y40-lawn-mower",
  "yarbo-refurbished-core",
]);

export function productRequiresAvailabilityCheck(product: { slug?: string }) {
  return Boolean(product.slug && availabilityCheckProductSlugs.has(product.slug));
}

const quoteOnlyProductSlugs = new Set(["pandag-g1"]);

/** Public sales-channel behavior. This does not represent internal pricing data. */
export function salesModeForProductSlug(slug: string): CatalogSalesMode {
  return (quoteOnlyProductSlugs.has(slug) || productRequiresAvailabilityCheck({ slug })) ? "quote_only" : "self_service";
}

/** Match existing checkout restrictions when a catalog item is bundled. */
export function catalogProductRequiresQuote(product: { slug: string; brand?: string }) {
  return product.brand?.toLowerCase() === "pandag" || salesModeForProductSlug(product.slug) === "quote_only";
}

export function salesModeForCatalogProduct(product: { slug: string; brand?: string }): CatalogSalesMode {
  return catalogProductRequiresQuote(product) ? "quote_only" : "self_service";
}

export function isSelfServiceProduct(
  product: Pick<CatalogProduct, "salesMode"> & { slug?: string }
) {
  return product.salesMode === "self_service" && !productRequiresAvailabilityCheck(product);
}

export function isQuoteOnlyProduct(
  product: Pick<CatalogProduct, "salesMode"> & { slug?: string }
) {
  return product.salesMode === "quote_only" || productRequiresAvailabilityCheck(product);
}
