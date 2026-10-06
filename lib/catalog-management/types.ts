export const MANAGED_KINDS = ["products", "variants", "options", "packages"] as const;
export type ManagedKind = (typeof MANAGED_KINDS)[number];
export type ComponentKind = Exclude<ManagedKind, "packages">;
export type PackageComponent = { kind: ComponentKind; id: string; quantity: number };
export type ManagedCatalogItem = {
  kind: ComponentKind; id: string; name: string; slug: string; brand: string;
  category: string; description: string | null; imageUrl: string | null;
  compatibility: string[]; publicStatus: string; retiredAt: string | null;
  updatedAt: string; productId: string; productSlug: string;
  effectivePriceCents: number | null; dealerCostCents: number | null;
  /** Compatible with self-service packages; availability override remains separate. */
  packageSelectable: boolean;
  values: Record<string, string | number | boolean | null>;
};
export type ManagedPackage = Omit<ManagedCatalogItem, "kind"> & {
  kind: "packages"; components: PackageComponent[]; isYarboCoreSelectable: boolean;
};
export type ManagedCatalog = { items: ManagedCatalogItem[]; packages: ManagedPackage[] };
export type CatalogDependencies = {
  packages: { id: string; name: string; updatedAt: string }[];
  historicalReferences: boolean;
};
