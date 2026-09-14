import type { CatalogPackage, CatalogPrice, CatalogProduct, CatalogVariant } from "./types";

export const YARBO_Y40_SLUG = "yarbo-y40";
export const YARBO_Y40P_SLUG = "yarbo-y40p";

export function yarboCoreVariants(product: CatalogProduct) {
  return product.variants.filter((variant) =>
    variant.slug === YARBO_Y40_SLUG || variant.slug === YARBO_Y40P_SLUG
  );
}

export function yarboCorePrice(
  product: CatalogProduct,
  core: CatalogVariant,
  catalogPackage?: CatalogPackage | null,
): CatalogPrice | null {
  if (catalogPackage) {
    const relationship = catalogPackage.corePrices?.find(
      (price) => price.coreVariantId === core.id && price.isAvailable,
    );
    if (!relationship) return null;
    return relationship.priceMode === "package" ? catalogPackage : relationship;
  }
  return core.slug === YARBO_Y40_SLUG ? product : core;
}

export function yarboCoreCanBeSelected(
  product: CatalogProduct,
  core: CatalogVariant,
  catalogPackage?: CatalogPackage | null,
) {
  const price = yarboCorePrice(product, core, catalogPackage);
  return product.isAvailable && core.isAvailable &&
    (!catalogPackage || catalogPackage.isAvailable) &&
    Boolean(price && price.showPublicPrice && !price.contactForPricing && price.currentPriceCents !== null);
}

export function selectedYarboCore(product: CatalogProduct, variantId: string) {
  return yarboCoreVariants(product).find((core) => core.id === variantId) ?? null;
}
