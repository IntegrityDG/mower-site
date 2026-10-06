import type { CatalogProduct, CatalogResponse } from "@/lib/catalog/types";

const publicEquipmentProductSlugs = new Set([
  "lymow-one-plus",
  "yarbo",
  "pandag-g1",
]);

export function isPublicEquipmentProductSlug(slug: string, product?: Pick<CatalogProduct, "adminManaged" | "hasManagedPackages">): boolean {
  return publicEquipmentProductSlugs.has(slug) || product?.adminManaged === true || product?.hasManagedPackages === true;
}

export function findCatalogProductBySlug(
  catalog: CatalogResponse,
  slug: string
): CatalogProduct | null {
  const product = catalog.products.find((product) => product.slug === slug);
  if (!isPublicEquipmentProductSlug(slug, product)) {
    return null;
  }

  return product ?? null;
}
