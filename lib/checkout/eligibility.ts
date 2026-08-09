import { salesModeForProductSlug } from "@/lib/catalog/sales-mode";
import { CheckoutRejectionError, type CheckoutRequest } from "./types";

export type PriceableRow = { id: string; public_status: string; regular_price_cents: number | null; sale_price_cents: number | null; sale_starts_at: string | null; sale_ends_at: string | null };
export type CheckoutProductRow = PriceableRow & { slug: string; brand: string; name: string; description?: string | null };
export type CheckoutVariantRow = PriceableRow & { product_id: string; variant_slug: string; name: string; description: string | null; sku: string | null };
export type CheckoutOptionRow = PriceableRow & { product_id: string; option_slug: string; name: string; description: string | null; minimum_quantity: number; maximum_quantity: number | null; accessory_listing_enabled?: boolean; accessory_tab?: string | null; show_in_builder?: boolean; accessory_action_type?: string | null; contact_for_pricing?: boolean };
export type CheckoutPackageRow = PriceableRow & { product_id: string; package_slug: string; package_name: string; description: string | null };
export type VariantOptionRow = { id: string; variant_id: string; option_id: string; relationship_type: string };
export type PackageItemRow = { id: string; package_id: string; option_id: string; quantity: number; included_in_package_price: boolean };
export type CheckoutCatalog = { product: CheckoutProductRow; variants: CheckoutVariantRow[]; options: CheckoutOptionRow[]; packages: CheckoutPackageRow[]; variantOptions: VariantOptionRow[]; packageItems: PackageItemRow[] };

const LYMOW_VARIANTS = new Set(["lymow-one-plus-5a", "lymow-one-plus-10a"]);
const LYMOW_CHARGERS = new Set(["lymow-5a-charger", "lymow-10a-charger"]);
const YARBO_MODULES = new Set(["yarbo-mower-module", "yarbo-lawn-mower-pro-module", "yarbo-snow-blower-module", "yarbo-leaf-blower-module", "yarbo-trimmer-module"]);
const YARBO_HIDDEN = new Set(["yarbo-plow-module"]);
const active = (row: { public_status: string }) => row.public_status === "active";
const reject = (code: ConstructorParameters<typeof CheckoutRejectionError>[0], message: string): never => { throw new CheckoutRejectionError(code, message); };

export function checkoutProductIsSupported(product: {
  slug: string;
  brand: string;
}) {
  return (
    product.brand.toLowerCase() !== "pandag" &&
    salesModeForProductSlug(product.slug) === "self_service" &&
    (product.slug === "lymow-one-plus" || product.slug === "yarbo")
  );
}

export function validateCheckoutEligibility(request: CheckoutRequest, catalog: CheckoutCatalog) {
  const { product } = catalog;
  if (product.id !== request.selection.productId) reject("UNKNOWN_CATALOG_RECORD", "Product was not found.");
  if (!checkoutProductIsSupported(product)) reject("QUOTE_ONLY_PRODUCT", "This product is quote-only.");
  if (!active(product)) reject("INACTIVE_CATALOG_RECORD", "Product is not available for checkout.");
  const selectedOptions = request.selection.options.map(({ optionId, quantity }) => {
    const option = catalog.options.find((row) => row.id === optionId);
    if (!option) throw new CheckoutRejectionError("UNKNOWN_CATALOG_RECORD", "Option was not found.");
    if (option.product_id !== product.id) reject("CROSS_PRODUCT_SELECTION", "The selected option belongs to another product.");
    if (!active(option)) reject("INACTIVE_CATALOG_RECORD", "The selected option is not active.");
    const maximum = Math.min(option.maximum_quantity ?? 10, 10);
    if (quantity < Math.max(1, option.minimum_quantity) || quantity > maximum) reject("INVALID_QUANTITY", "Option quantity is outside its allowed range.");
    return { option, quantity };
  });
  const variant = request.selection.variantId ? catalog.variants.find((row) => row.id === request.selection.variantId) : null;
  const selectedPackage = request.selection.packageId ? catalog.packages.find((row) => row.id === request.selection.packageId) : null;
  if (request.selection.variantId && !variant) throw new CheckoutRejectionError("UNKNOWN_CATALOG_RECORD", "Variant was not found.");
  if (request.selection.packageId && !selectedPackage) throw new CheckoutRejectionError("UNKNOWN_CATALOG_RECORD", "Package was not found.");
  if (variant?.product_id !== undefined && variant.product_id !== product.id) reject("CROSS_PRODUCT_SELECTION", "The selected variant belongs to another product.");
  if (variant && !active(variant)) reject("INACTIVE_CATALOG_RECORD", "The selected variant is not active.");
  if (selectedPackage?.product_id !== undefined && selectedPackage.product_id !== product.id) reject("CROSS_PRODUCT_SELECTION", "The selected package belongs to another product.");
  if (selectedPackage && !active(selectedPackage)) reject("INACTIVE_CATALOG_RECORD", "The selected package is not active.");

  if (product.slug === "lymow-one-plus") {
    if (!variant || !LYMOW_VARIANTS.has(variant.variant_slug) || request.selection.purchaseMode !== "standard") throw new CheckoutRejectionError("MISSING_CONFIGURATION", "Choose one supported Lymow variant.");
    if (selectedPackage) reject("INCOMPATIBLE_SELECTION", "Lymow package checkout is unavailable; choose the 5A or 10A variant without a package.");
    if (selectedOptions.some(({ option }) => LYMOW_CHARGERS.has(option.option_slug))) reject("LYMOW_CHARGER_SUBMITTED", "The Lymow charger is included and cannot be submitted separately.");
    if (selectedOptions.some(({ option }) => !option.accessory_listing_enabled || option.accessory_tab !== "lymow" || !option.show_in_builder || option.accessory_action_type !== "builder" || option.contact_for_pricing || option.regular_price_cents === null)) reject("INCOMPATIBLE_SELECTION", "This Lymow option is not available for checkout.");
    const defining = catalog.variantOptions.filter((link) => link.variant_id === variant.id && link.relationship_type === "defines_variant");
    const definingChargers = defining.map((link) => catalog.options.find((option) => option.id === link.option_id)).filter((option): option is CheckoutOptionRow => Boolean(option && option.product_id === product.id && LYMOW_CHARGERS.has(option.option_slug)));
    const expected = variant.variant_slug.endsWith("5a") ? "lymow-5a-charger" : "lymow-10a-charger";
    if (defining.length !== 1 || definingChargers.length !== 1 || definingChargers[0].option_slug !== expected) reject("LYMOW_CHARGER_RELATIONSHIP_INVALID", "Lymow charger relationship is invalid.");
    if (!active(definingChargers[0])) reject("INACTIVE_CATALOG_RECORD", "The required Lymow charger is not active.");
    for (const { option } of selectedOptions) {
      const relationships = catalog.variantOptions.filter((link) => link.option_id === option.id && link.relationship_type !== "defines_variant");
      if (relationships.some((link) => link.variant_id === variant.id && link.relationship_type === "excluded") || (relationships.length > 0 && !relationships.some((link) => link.variant_id === variant.id && ["compatible", "included", "required"].includes(link.relationship_type)))) reject("INCOMPATIBLE_SELECTION", "Option is incompatible with the selected Lymow variant.");
    }
    const missingRequired = catalog.variantOptions.filter((link) => link.variant_id === variant.id && link.relationship_type === "required").some((link) => !selectedOptions.some(({ option }) => option.id === link.option_id));
    if (missingRequired) reject("MISSING_CONFIGURATION", "A required Lymow option is missing.");
    return { variant, selectedPackage: null, selectedOptions, moduleOnlyWarning: null };
  }

  if (product.slug !== "yarbo") reject("INCOMPATIBLE_SELECTION", "Product is not approved for checkout.");
  if (variant) reject("INCOMPATIBLE_SELECTION", "Yarbo does not accept a variant selection.");
  if (selectedOptions.some(({ option }) => YARBO_HIDDEN.has(option.option_slug))) reject("YARBO_HIDDEN_OPTION", "This Yarbo option is not available.");
  const validYarboAccessory = (option: CheckoutOptionRow) => option.accessory_listing_enabled === true && option.accessory_tab === "yarbo" && option.show_in_builder === true && option.accessory_action_type === "builder" && !option.contact_for_pricing && option.regular_price_cents !== null;
  if (selectedOptions.some(({ option }) => !YARBO_MODULES.has(option.option_slug) && !validYarboAccessory(option))) reject("INCOMPATIBLE_SELECTION", "Only approved Yarbo modules and builder accessories may be selected.");
  if (request.selection.purchaseMode === "complete-system") {
    if (!selectedPackage) throw new CheckoutRejectionError("MISSING_CONFIGURATION", "Choose one Yarbo package.");
    if (request.selection.includeBaseProduct || selectedOptions.some(({ option }) => YARBO_MODULES.has(option.option_slug))) reject("YARBO_PACKAGE_DOUBLE_COUNT", "A Yarbo package cannot include standalone Core or module selections.");
    const items = catalog.packageItems.filter((item) => item.package_id === selectedPackage.id);
    if (new Set(items.map((item) => item.option_id)).size !== items.length) reject("DUPLICATE_SELECTION", "Package contains duplicate components.");
    const packageOptions = items.map((item) => catalog.options.find((option) => option.id === item.option_id));
    if (packageOptions.some((option) => !option || option.product_id !== product.id)) reject("CROSS_PRODUCT_SELECTION", "The selected package contains a missing or cross-product component.");
    if (packageOptions.some((option) => option && !active(option))) reject("INACTIVE_CATALOG_RECORD", "A required component of the selected package is not active.");
    return { variant: null, selectedPackage, selectedOptions: selectedOptions.filter(({ option }) => validYarboAccessory(option)), packageItems: items, moduleOnlyWarning: null };
  }
  if (request.selection.purchaseMode !== "individual-equipment" || selectedPackage) reject("INCOMPATIBLE_SELECTION", "Invalid Yarbo purchase mode.");
  const selectedModules = selectedOptions.filter(({ option }) => YARBO_MODULES.has(option.option_slug));
  if (!request.selection.includeBaseProduct && !selectedModules.length) reject("MISSING_CONFIGURATION", "Choose Yarbo Core or at least one module.");
  return { variant: null, selectedPackage: null, selectedOptions, moduleOnlyWarning: !request.selection.includeBaseProduct && selectedModules.length ? "Yarbo Core is not included. These modules require an existing Yarbo Core to operate." : null };
}

export function checkoutDisplayName(option: CheckoutOptionRow) {
  return option.option_slug === "yarbo-leaf-blower-module" ? "Blower Module" : option.name.replaceAll("Leaf Blower", "Blower");
}
