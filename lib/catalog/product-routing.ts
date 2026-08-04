import type { CatalogProduct, CatalogResponse } from "@/lib/catalog/types";

export function findCatalogProductBySlug(
  catalog: CatalogResponse,
  slug: string
): CatalogProduct | null {
  return catalog.products.find((product) => product.slug === slug) ?? null;
}
