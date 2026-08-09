import type { CatalogProduct, CatalogResponse } from "@/lib/catalog/types";

const publicEquipmentProductSlugs = new Set([
  "lymow-one-plus",
  "yarbo",
  "pandag-g1",
]);

export function isPublicEquipmentProductSlug(slug: string): boolean {
  return publicEquipmentProductSlugs.has(slug);
}

export function findCatalogProductBySlug(
  catalog: CatalogResponse,
  slug: string
): CatalogProduct | null {
  if (!isPublicEquipmentProductSlug(slug)) {
    return null;
  }

  return catalog.products.find((product) => product.slug === slug) ?? null;
}
