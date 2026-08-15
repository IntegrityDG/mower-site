import type {
  CatalogOption,
  CatalogOptionGroup,
  CatalogProduct,
  CatalogVariant,
} from "./types";

type VariantDefinition = Pick<CatalogVariant, "definingOptionIds">;

const TEMPORARY_LYMOW_CHARGER_GROUP = "lymow-charger-config";
const TEMPORARY_LYMOW_CHARGER_OPTIONS = new Set([
  "lymow-5a-charger",
  "lymow-10a-charger",
]);

// Rollout compatibility for environments where charger mirrors are still
// hidden and defines_variant links are therefore absent from the public read.
// Remove this branch only after migration 20260731194650 has been applied and
// verified in every active environment. The relationship-based rule below is
// the permanent semantic for all internal variant-definition options.
function isTemporaryLymowChargerMirror(option: CatalogOption) {
  return TEMPORARY_LYMOW_CHARGER_OPTIONS.has(option.slug);
}

export function definingOptionIdSet(variants: readonly VariantDefinition[]) {
  return new Set(variants.flatMap((variant) => variant.definingOptionIds));
}

export function customerFacingOptions(
  options: readonly CatalogOption[],
  variants: readonly VariantDefinition[],
) {
  const internalOptionIds = definingOptionIdSet(variants);
  return options.filter(
    (option) =>
      !internalOptionIds.has(option.id) &&
      !isTemporaryLymowChargerMirror(option),
  );
}

export function customerFacingProductOptions(product: CatalogProduct) {
  const options = [
    ...product.optionGroups.flatMap((group) => group.options),
    ...product.ungroupedOptions,
  ];
  return customerFacingOptions(options, product.variants);
}

export function customerFacingGroupOptions(
  product: CatalogProduct,
  group: CatalogOptionGroup,
) {
  if (
    product.slug === "lymow-one-plus" &&
    group.slug === TEMPORARY_LYMOW_CHARGER_GROUP
  ) {
    return [];
  }
  return customerFacingOptions(group.options, product.variants);
}

export function customerFacingUngroupedOptions(product: CatalogProduct) {
  return customerFacingOptions(product.ungroupedOptions, product.variants);
}

export function builderAccessoryOptions(product: CatalogProduct) {
  return customerFacingProductOptions(product).filter(
    (option) =>
      option.accessoryListingEnabled &&
      option.showInBuilder &&
      option.accessoryActionType === "builder" &&
      option.accessoryTab === (product.slug === "yarbo" ? "yarbo" : "lymow") &&
      (!option.isAvailable || (option.currentPriceCents !== null && !option.contactForPricing)),
  );
}
