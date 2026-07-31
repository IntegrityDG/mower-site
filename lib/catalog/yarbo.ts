import type {
  CatalogOption,
  CatalogPackage,
  CatalogProduct,
  ProductBuildSelection,
} from "./types";
import { customerFacingProductOptions } from "./customer-facing-options";

export const YARBO_PRODUCT_SLUG = "yarbo";

export const YARBO_MODULE_ONLY_NOTICE =
  "Module only — requires a Yarbo Core to operate.";

export const YARBO_CORE_ABSENT_NOTICE =
  "Yarbo Core is not included. These modules require an existing Yarbo Core to operate.";

export const YARBO_INCLUDED_PLATFORM_EQUIPMENT = [
  "Yarbo Core",
  "Core charging equipment",
  "Core navigation/RTK equipment",
];

export const YARBO_CORE_EQUIPMENT_DESCRIPTION =
  "Complete Yarbo systems include the Core plus the Core charging and navigation equipment required for platform operation.";

export type YarboPurchaseMode = "complete-system" | "individual-equipment";

export type YarboPackageGroupKey =
  | "mowing"
  | "mower-pro"
  | "snow"
  | "cleanup-trimming"
  | "multi-season"
  | "full-property-care";

export type YarboPackageGroup = {
  key: YarboPackageGroupKey;
  label: string;
  description: string;
};

export const YARBO_PACKAGE_GROUPS: YarboPackageGroup[] = [
  {
    key: "mowing",
    label: "Mowing Systems",
    description: "Complete systems built around the Standard Lawn Mower Module.",
  },
  {
    key: "mower-pro",
    label: "Mower Pro Systems",
    description: "Complete systems built around the Lawn Mower Pro Module.",
  },
  {
    key: "snow",
    label: "Snow Systems",
    description: "Complete systems built around the Snow Blower Module.",
  },
  {
    key: "cleanup-trimming",
    label: "Cleanup and Trimming Systems",
    description: "Complete systems for blower and trimmer-led property care.",
  },
  {
    key: "multi-season",
    label: "Multi-Season Systems",
    description: "Complete systems that combine mowing or Mower Pro with snow or cleanup modules.",
  },
  {
    key: "full-property-care",
    label: "Full Property-Care Systems",
    description: "Complete systems with mower, snow, blower, and trimmer capability.",
  },
];

const YARBO_OPTION_DISPLAY_NAMES: Record<string, string> = {
  "yarbo-mower-module": "Standard Lawn Mower Module",
  "yarbo-lawn-mower-pro-module": "Lawn Mower Pro Module",
  "yarbo-snow-blower-module": "Snow Blower Module",
  "yarbo-leaf-blower-module": "Blower Module",
  "yarbo-trimmer-module": "Yarbo Trimmer Package",
};

const YARBO_MODULE_SLUGS = new Set(Object.keys(YARBO_OPTION_DISPLAY_NAMES));

const YARBO_PACKAGE_DISPLAY_NAMES: Record<string, string> = {
  "yarbo-lawn-mower": "Yarbo Lawn Mower System",
  "yarbo-lawn-mower-trimmer": "Yarbo Lawn Mower + Trimmer System",
  "yarbo-lawn-leaf": "Yarbo Lawn Mower + Blower System",
  "yarbo-lawn-leaf-trimmer": "Yarbo Lawn Mower + Blower + Trimmer System",
  "yarbo-lawn-mower-pro": "Yarbo Lawn Mower Pro System",
  "yarbo-lawn-mower-pro-trimmer": "Yarbo Lawn Mower Pro + Trimmer System",
  "yarbo-pro-leaf": "Yarbo Lawn Mower Pro + Blower System",
  "yarbo-pro-leaf-trimmer": "Yarbo Lawn Mower Pro + Blower + Trimmer System",
  "yarbo-snow-blower": "Yarbo Snow Blower System",
  "yarbo-snow-blower-trimmer": "Yarbo Snow Blower + Trimmer System",
  "yarbo-snow-leaf": "Yarbo Snow Blower + Blower System",
  "yarbo-snow-leaf-trimmer": "Yarbo Snow Blower + Blower + Trimmer System",
  "yarbo-leaf-blower": "Yarbo Blower System",
  "yarbo-trimmer": "Yarbo Trimmer System",
  "yarbo-leaf-blower-trimmer": "Yarbo Blower + Trimmer System",
  "yarbo-snow-lawn": "Yarbo Snow Blower + Lawn Mower System",
  "yarbo-snow-lawn-trimmer": "Yarbo Snow Blower + Lawn Mower + Trimmer System",
  "yarbo-pro-snow": "Yarbo Lawn Mower Pro + Snow Blower System",
  "yarbo-pro-snow-trimmer": "Yarbo Lawn Mower Pro + Snow Blower + Trimmer System",
  "yarbo-lawn-snow-leaf": "Yarbo Lawn Mower + Snow Blower + Blower System",
  "yarbo-pro-snow-leaf": "Yarbo Lawn Mower Pro + Snow Blower + Blower System",
  "yarbo-lawn-snow-leaf-trimmer":
    "Yarbo Lawn Mower + Snow Blower + Blower + Trimmer System",
  "yarbo-pro-snow-leaf-trimmer":
    "Yarbo Lawn Mower Pro + Snow Blower + Blower + Trimmer System",
};

const YARBO_PACKAGE_GROUP_BY_SLUG: Record<string, YarboPackageGroupKey> = {
  "yarbo-lawn-mower": "mowing",
  "yarbo-lawn-mower-trimmer": "mowing",
  "yarbo-lawn-leaf": "mowing",
  "yarbo-lawn-leaf-trimmer": "mowing",
  "yarbo-lawn-mower-pro": "mower-pro",
  "yarbo-lawn-mower-pro-trimmer": "mower-pro",
  "yarbo-pro-leaf": "mower-pro",
  "yarbo-pro-leaf-trimmer": "mower-pro",
  "yarbo-snow-blower": "snow",
  "yarbo-snow-blower-trimmer": "snow",
  "yarbo-snow-leaf": "snow",
  "yarbo-snow-leaf-trimmer": "snow",
  "yarbo-leaf-blower": "cleanup-trimming",
  "yarbo-trimmer": "cleanup-trimming",
  "yarbo-leaf-blower-trimmer": "cleanup-trimming",
  "yarbo-snow-lawn": "multi-season",
  "yarbo-snow-lawn-trimmer": "multi-season",
  "yarbo-pro-snow": "multi-season",
  "yarbo-pro-snow-trimmer": "multi-season",
  "yarbo-lawn-snow-leaf": "multi-season",
  "yarbo-pro-snow-leaf": "multi-season",
  "yarbo-lawn-snow-leaf-trimmer": "full-property-care",
  "yarbo-pro-snow-leaf-trimmer": "full-property-care",
};

export function isYarboProduct(product: CatalogProduct) {
  return product.slug === YARBO_PRODUCT_SLUG;
}

export function isYarboModuleSlug(slug: string) {
  return YARBO_MODULE_SLUGS.has(slug);
}

export function isYarboModuleOption(option: CatalogOption) {
  return isYarboModuleSlug(option.slug);
}

export function yarboOptionDisplayName(option: CatalogOption) {
  return (
    YARBO_OPTION_DISPLAY_NAMES[option.slug] ??
    option.name.replaceAll("Leaf Blower", "Blower")
  );
}

export function yarboPackageDisplayName(catalogPackage: CatalogPackage) {
  return (
    YARBO_PACKAGE_DISPLAY_NAMES[catalogPackage.slug] ??
    catalogPackage.name.replaceAll("Leaf Blower", "Blower")
  );
}

export function yarboPackageModuleNames(catalogPackage: CatalogPackage) {
  return catalogPackage.items
    .filter((item) => item.option && isYarboModuleOption(item.option))
    .map((item) => {
      const name = item.option ? yarboOptionDisplayName(item.option) : "Yarbo module";
      return item.quantity > 1 ? `${name} x ${item.quantity}` : name;
    });
}

function packageHasModule(catalogPackage: CatalogPackage, slug: string) {
  return catalogPackage.items.some((item) => item.option?.slug === slug);
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
  const mappedGroup = YARBO_PACKAGE_GROUP_BY_SLUG[catalogPackage.slug];
  if (mappedGroup) return mappedGroup;

  const hasStandardMower = packageHasModule(catalogPackage, "yarbo-mower-module");
  const hasMowerPro = packageHasModule(
    catalogPackage,
    "yarbo-lawn-mower-pro-module"
  );
  const hasSnow = packageHasModule(catalogPackage, "yarbo-snow-blower-module");
  const hasBlower = packageHasModule(catalogPackage, "yarbo-leaf-blower-module");
  const hasTrimmer = packageHasModule(catalogPackage, "yarbo-trimmer-module");
  const moduleCount = [hasStandardMower, hasMowerPro, hasSnow, hasBlower, hasTrimmer]
    .filter(Boolean).length;

  if (moduleCount >= 4) return "full-property-care";
  if (hasSnow && (hasStandardMower || hasMowerPro)) return "multi-season";
  if (hasMowerPro) return "mower-pro";
  if (hasStandardMower) return "mowing";
  if (hasSnow) return "snow";
  return "cleanup-trimming";
}

export function groupYarboPackages(packages: CatalogPackage[]) {
  return YARBO_PACKAGE_GROUPS.map((group) => ({
    ...group,
    packages: packages.filter(
      (catalogPackage) => inferYarboPackageGroup(catalogPackage) === group.key
    ),
  })).filter((group) => group.packages.length > 0);
}

export function yarboPackageBestFit(catalogPackage: CatalogPackage) {
  const group = inferYarboPackageGroup(catalogPackage);
  const mowerType = yarboPackageMowerType(catalogPackage);

  if (group === "mowing") {
    return "Best for customers starting with standard autonomous mowing and optional warm-season cleanup.";
  }

  if (group === "mower-pro") {
    return "Best for customers who want the Mower Pro starting point and optional cleanup capability.";
  }

  if (group === "snow") {
    return "Best for customers starting with snow removal and optional cleanup or trimming capability.";
  }

  if (group === "cleanup-trimming") {
    return "Best for customers focused on blower and trimmer-led property care.";
  }

  if (group === "full-property-care") {
    return `Best for customers who want the broadest Yarbo package with ${mowerType.toLowerCase()}, snow, blower, and trimmer capability.`;
  }

  return `Best for customers combining ${mowerType.toLowerCase()} with another seasonal Yarbo capability.`;
}

export function yarboIndividualModules(product: CatalogProduct) {
  return customerFacingProductOptions(product).filter(isYarboModuleOption);
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
