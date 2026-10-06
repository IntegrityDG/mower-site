import { catalogPackageIsAvailable } from "./availability";
import type { CatalogPrice, CatalogProduct } from "./types";

/** Select an already-resolved public amount; family parents have no selling price. */
export function managedProductStartingPrice(product: CatalogProduct): CatalogPrice | null {
  if (!product.isAvailable) return null;
  const candidates: CatalogPrice[] = [
    ...(product.adminManaged && product.variants.length === 0 ? [product] : []),
    ...(product.adminManaged ? product.variants.filter((item) => item.isAvailable) : []),
    ...product.packages.filter((item) => item.adminManaged && catalogPackageIsAvailable(item)),
  ];
  return candidates.filter((item) => item.showPublicPrice && !item.contactForPricing && item.currentPriceCents !== null)
    .sort((a, b) => a.currentPriceCents! - b.currentPriceCents!)[0] ?? null;
}
