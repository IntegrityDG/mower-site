import type {
  CatalogOption,
  CatalogPackage,
  CatalogProduct,
  ProductBuildSelection,
} from "./types";

export const PUBLIC_CATALOG_STATUSES = ["active", "unavailable"] as const;

export function catalogAvailabilityFromPublicStatus(status: string) {
  return {
    isAvailable: status === "active",
    publicStatus: status === "active" ? "active" as const : "unavailable" as const,
  };
}

export function catalogAvailabilityFromBoolean(isAvailable: boolean) {
  return { isAvailable, publicStatus: null };
}

export function catalogOptionIsAvailable(
  product: Pick<CatalogProduct, "isAvailable">,
  option: Pick<CatalogOption, "isAvailable">,
) {
  return product.isAvailable && option.isAvailable;
}

export function catalogPackageIsAvailable(
  catalogPackage: Pick<CatalogPackage, "isAvailable" | "items">,
) {
  return (
    catalogPackage.isAvailable &&
    catalogPackage.items.every((item) => item.option?.isAvailable === true)
  );
}

export function buildAvailabilityIssues(
  product: CatalogProduct,
  selection: ProductBuildSelection,
) {
  const issues = new Set<string>();

  if (!product.isAvailable) issues.add(product.name);

  const variant = selection.variantId
    ? product.variants.find((item) => item.id === selection.variantId)
    : null;
  if (variant && !variant.isAvailable) issues.add(variant.name);

  const catalogPackage = selection.packageId
    ? product.packages.find((item) => item.id === selection.packageId)
    : null;
  if (catalogPackage && !catalogPackageIsAvailable(catalogPackage)) {
    issues.add(catalogPackage.name);
  }

  const options = [
    ...product.optionGroups.flatMap((group) => group.options),
    ...product.ungroupedOptions,
  ];
  for (const [optionId, quantity] of Object.entries(selection.optionQuantities)) {
    if (quantity <= 0) continue;
    const option = options.find((item) => item.id === optionId);
    if (option && !catalogOptionIsAvailable(product, option)) issues.add(option.name);
  }

  return [...issues];
}

export function removeUnavailableBuildSelections(
  product: CatalogProduct,
  selection: ProductBuildSelection,
): ProductBuildSelection {
  const options = [
    ...product.optionGroups.flatMap((group) => group.options),
    ...product.ungroupedOptions,
  ];
  const variant = product.variants.find((item) => item.id === selection.variantId);
  const catalogPackage = product.packages.find((item) => item.id === selection.packageId);

  return {
    ...selection,
    variantId: !selection.variantId || variant?.isAvailable ? selection.variantId : "",
    packageId: !selection.packageId || (catalogPackage && catalogPackageIsAvailable(catalogPackage)) ? selection.packageId : "",
    optionQuantities: Object.fromEntries(
      Object.entries(selection.optionQuantities).filter(([optionId, quantity]) => {
        if (quantity <= 0) return false;
        const option = options.find((item) => item.id === optionId);
        return Boolean(option && catalogOptionIsAvailable(product, option));
      }),
    ),
  };
}
