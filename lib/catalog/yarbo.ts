import type {
  CatalogOption,
  CatalogPackage,
  CatalogPackageItem,
  CatalogProduct,
  ProductBuildSelection,
} from "./types";
import { customerFacingProductOptions } from "./customer-facing-options";
import { packageComponentName } from "./package-components";

export const YARBO_PRODUCT_SLUG = "yarbo";

export const YARBO_MODULE_ONLY_NOTICE =
  "Module only — requires a Yarbo Core to operate.";

export const YARBO_CORE_ABSENT_NOTICE =
  "Yarbo Core is not included. These modules require an existing Yarbo Core to operate.";

export const YARBO_INCLUDED_PLATFORM_EQUIPMENT = [
  "Yarbo Core",
  "Core charging equipment",
  "Yarbo Data Center",
  "Pro antennas",
];

export const YARBO_CORE_EQUIPMENT_DESCRIPTION =
  "Every Yarbo Core order and complete system includes the Yarbo Data Center and Pro antennas at no additional charge, including Y40, Y40P, and PAC-MAN systems.";

const YARBO_PAC_MAN_CORE_SYSTEMS = new Set([
  "yarbo-pac-man-snow-blower-gen-2",
  "yarbo-pac-man-snow-blower-gen-2-mower-pro",
]);

export function isYarboPacManCoreSystem(product: Pick<CatalogProduct, "slug">) {
  return YARBO_PAC_MAN_CORE_SYSTEMS.has(product.slug);
}

export function yarboOrderIncludesCore(product: CatalogProduct, selection: ProductBuildSelection) {
  if (isYarboPacManCoreSystem(product)) return true;
  return isYarboProduct(product) && Boolean(
    selection.purchaseMode === "complete-system"
      ? product.packages.some(item => item.id === selection.packageId)
      : selection.purchaseMode === "individual-equipment" && selection.includeBaseProduct
  );
}

const YARBO_INCLUDED_NAVIGATION_SLUGS = new Set(["yarbo-data-center", "yarbo-pro-antenna", "yarbo-pro-antennas"]);

export function isYarboIncludedNavigationItem(item: CatalogPackageItem) {
  return YARBO_INCLUDED_NAVIGATION_SLUGS.has(item.component?.slug ?? item.option?.slug ?? "");
}

/** Included-equipment copy only. Do not add options, prices or checkout lines. */
export function yarboIncludedEquipment(items: readonly CatalogPackageItem[] = []) {
  return [...YARBO_INCLUDED_PLATFORM_EQUIPMENT, ...items.filter(item =>
    item.includedInPackagePrice && !isYarboIncludedNavigationItem(item)
  ).map(item => `${packageComponentName(item)}${item.quantity > 1 ? ` x ${item.quantity}` : ""}`)];
}

export type YarboPurchaseMode = "complete-system" | "individual-equipment";

export type YarboPackageGroupKey =
  | "mower-pro"
  | "core-utility";

export type YarboPackageGroup = {
  key: YarboPackageGroupKey;
  label: string;
  description: string;
};

export const YARBO_PACKAGE_GROUPS: YarboPackageGroup[] = [
  {
    key: "mower-pro",
    label: "Mower Pro Packages",
    description: "Complete systems built around the Lawn Mower Pro Module.",
  },
  {
    key: "core-utility",
    label: "Core + Utility",
    description: "Complete systems without a mower module, built for snow, cleanup, and trimming.",
  },
];

const YARBO_MODULE_SLUGS = new Set([
  "yarbo-mower-module",
  "yarbo-lawn-mower-pro-module",
  "yarbo-snow-blower-module",
  "yarbo-leaf-blower-module",
  "yarbo-trimmer-module",
]);

const YARBO_DISCONTINUED_MODULE_SLUGS = new Set([
  "yarbo-mower-module",
]);

export function isYarboProduct(product: CatalogProduct) {
  return product.slug === YARBO_PRODUCT_SLUG;
}

export function isYarboModuleSlug(slug: string) {
  return YARBO_MODULE_SLUGS.has(slug);
}

export function isYarboModuleOption(option: CatalogOption) {
  return isYarboModuleSlug(option.slug) || option.catalogCategory === "module";
}

export function yarboOptionDisplayName(option: CatalogOption) {
  return option.name;
}

export function yarboPackageDisplayName(catalogPackage: CatalogPackage) {
  return catalogPackage.name;
}

export function yarboPackageModuleNames(catalogPackage: CatalogPackage) {
  return catalogPackage.items
    .filter((item) => item.component || (item.option && isYarboModuleOption(item.option)))
    .map((item) => {
      const name = packageComponentName(item);
      return item.quantity > 1 ? `${name} x ${item.quantity}` : name;
    });
}

function packageHasModule(catalogPackage: CatalogPackage, slug: string) {
  return catalogPackage.items.some((item) => (item.component?.slug ?? item.option?.slug) === slug);
}

export function yarboPackageMowerType(catalogPackage: CatalogPackage) {
  if (packageHasModule(catalogPackage, "yarbo-lawn-mower-pro-module")) {
    return "Mower Pro";
  }

  if (packageHasModule(catalogPackage, "yarbo-mower-module")) {
    return "Standard Mower";
  }

  return "No mower module";
}

export function inferYarboPackageGroup(
  catalogPackage: CatalogPackage
): YarboPackageGroupKey {
  const hasMowerPro = packageHasModule(
    catalogPackage,
    "yarbo-lawn-mower-pro-module"
  );
  if (hasMowerPro) return "mower-pro";
  return "core-utility";
}

export function groupYarboPackages(packages: CatalogPackage[]) {
  const currentPackages = packages.filter(
    (catalogPackage) =>
      !catalogPackage.items.some(
        (item) =>
          YARBO_DISCONTINUED_MODULE_SLUGS.has(item.component?.slug ?? item.option?.slug ?? "")
      )
  );

  return YARBO_PACKAGE_GROUPS.map((group) => ({
    ...group,
    packages: currentPackages.filter(
      (catalogPackage) => inferYarboPackageGroup(catalogPackage) === group.key
    ),
  })).filter((group) => group.packages.length > 0);
}

export function yarboPackageBestFit(catalogPackage: CatalogPackage) {
  const group = inferYarboPackageGroup(catalogPackage);
  if (group === "mower-pro") {
    return "Best for customers who want the Mower Pro starting point and optional cleanup capability.";
  }

  return "Best for customers focused on snow removal, blower, or trimming capability without a mower module.";
}

export function yarboIndividualModules(product: CatalogProduct) {
  return customerFacingProductOptions(product).filter(
    (option) =>
      isYarboModuleOption(option) &&
      !YARBO_DISCONTINUED_MODULE_SLUGS.has(option.slug)
  );
}

export function selectedYarboIndividualModules(
  product: CatalogProduct,
  selection: ProductBuildSelection
) {
  return yarboIndividualModules(product)
    .map((option) => ({
      option,
      quantity: Math.min(1, Math.max(0, selection.optionQuantities[option.id] ?? 0)),
    }))
    .filter(({ quantity }) => quantity > 0);
}

export function yarboCoreIsSelected(selection: ProductBuildSelection) {
  return Boolean(selection.includeBaseProduct);
}

export function yarboHasIndividualSelection(
  product: CatalogProduct,
  selection: ProductBuildSelection
) {
  return (
    yarboCoreIsSelected(selection) ||
    selectedYarboIndividualModules(product, selection).length > 0
  );
}
