import { LYMOW_ENHANCED_DISCHARGE_KIT_SLUG } from "./lymow-enhanced-packages";
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

// Keep package components in the raw catalog for validating and displaying the
// bundle, but never present a bundle-only kit as a standalone add-on.
function customerSelectableOptions(product: CatalogProduct, options: readonly CatalogOption[]) {
  return customerFacingOptions(options, product.variants).filter(option =>
    product.slug !== "lymow-one-plus" || option.slug !== LYMOW_ENHANCED_DISCHARGE_KIT_SLUG
  );
}

export function customerFacingProductOptions(product: CatalogProduct) {
  const options = [
    ...product.optionGroups.flatMap((group) => group.options),
    ...product.ungroupedOptions,
  ];
  return customerSelectableOptions(product, options);
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
  return customerSelectableOptions(product, group.options);
}

export function customerFacingUngroupedOptions(product: CatalogProduct) {
  return customerSelectableOptions(product, product.ungroupedOptions);
}

// A builder action enables standalone checkout; showInBuilder separately opts
// the item into machine add-ons. Do not infer compatibility from its brand.
export function standaloneAccessoryOptions(product: CatalogProduct) {
  return customerFacingProductOptions(product).filter(
    (option) =>
      option.accessoryListingEnabled &&
      option.accessoryActionType === "builder" &&
      option.accessoryTab === (product.slug === "yarbo" ? "yarbo" : "lymow") &&
      (!option.isAvailable || (option.currentPriceCents !== null && !option.contactForPricing)),
  );
}

export function builderAccessoryOptions(product: CatalogProduct) {
  return standaloneAccessoryOptions(product).filter((option) => option.showInBuilder);
}
