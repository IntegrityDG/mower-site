import type { CatalogProduct } from "./types";

const primaryBrands = [
  { slug: "lymow-one-plus", name: "Lymow" },
  { slug: "yarbo", name: "Yarbo" },
] as const;

export type PurchaseGroup = {
  id: string;
  name: string;
  products: CatalogProduct[];
};

/** Navigation only: retain the original records and IDs for configuration/checkout. */
export function purchaseGroups(products: CatalogProduct[]): PurchaseGroup[] {
  const ordered = [
    ...primaryBrands.flatMap(({ slug }) => products.filter((product) => product.slug === slug)),
    ...products.filter((product) =>
      (product.adminManaged || product.hasManagedPackages) &&
      !["lymow-one-plus", "yarbo", "pandag-g1"].includes(product.slug)),
  ];
  const groups = new Map<string, PurchaseGroup>();
  for (const product of ordered) {
    const primary = primaryBrands.find(({ slug }) => slug === product.slug);
    const name = primary?.name ?? (product.brand.trim() || product.name);
    const id = name.toLowerCase();
    const group = groups.get(id);
    if (group) group.products.push(product);
    else groups.set(id, { id, name, products: [product] });
  }
  return [...groups.values()];
}

export function purchaseGroupHasLineup(group: PurchaseGroup) {
  return group.products.length > 1 || !primaryBrands.some(({ slug }) => group.products[0]?.slug === slug);
}

export function purchaseGroupForSelection(groups: PurchaseGroup[], productId: string) {
  return groups.find((group) => purchaseGroupHasLineup(group) && group.products.some((product) => product.id === productId));
}
