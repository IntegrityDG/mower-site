import { catalogProductRequiresQuote } from "@/lib/catalog/sales-mode";
import { catalogPurchaseState } from "@/lib/catalog/preorder";
import { CheckoutRejectionError, type CheckoutRequest } from "./types";

export type PriceableRow = { id: string; public_status: string; retired_at?: string | null; display_msrp_price_cents?: number | null; regular_price_cents: number | null; sale_price_cents: number | null; sale_starts_at: string | null; sale_ends_at: string | null; show_public_price?: boolean; contact_for_pricing?: boolean };
export type CheckoutProductRow = PriceableRow & { slug: string; brand: string; name: string; description?: string | null; admin_managed?: boolean };
export type CheckoutVariantRow = PriceableRow & { product_id: string; variant_slug: string; name: string; description: string | null; sku: string | null; preorder_enabled?: boolean };
export type CheckoutOptionRow = PriceableRow & { product_id: string; option_slug: string; name: string; description: string | null; minimum_quantity: number; maximum_quantity: number | null; catalog_category?: string; admin_managed?: boolean; accessory_listing_enabled?: boolean; accessory_tab?: string | null; show_in_builder?: boolean; accessory_action_type?: string | null; contact_for_pricing?: boolean };
export type CheckoutPackageRow = PriceableRow & { product_id: string; package_slug: string; package_name: string; description: string | null; admin_managed?: boolean };
export type VariantOptionRow = { id: string; variant_id: string; option_id: string; relationship_type: string };
export type PackageItemRow = { id: string; package_id: string; option_id: string | null; component_product_id?: string | null; component_variant_id?: string | null; quantity: number; included_in_package_price: boolean };
export type CheckoutCorePriceRow = PriceableRow & { product_id: string; package_id: string; core_variant_id: string; price_mode: "package" | "core_specific"; show_public_price: boolean; contact_for_pricing: boolean };
export type CheckoutCatalog = { product: CheckoutProductRow; variants: CheckoutVariantRow[]; options: CheckoutOptionRow[]; packages: CheckoutPackageRow[]; variantOptions: VariantOptionRow[]; packageItems: PackageItemRow[]; corePrices?: CheckoutCorePriceRow[]; componentProducts?: CheckoutProductRow[]; componentVariants?: CheckoutVariantRow[]; componentOptions?: CheckoutOptionRow[] };

const LYMOW_VARIANTS = new Set(["lymow-one-plus-5a", "lymow-one-plus-10a"]);
const LYMOW_CHARGERS = new Set(["lymow-5a-charger", "lymow-10a-charger"]);
const YARBO_MODULES = new Set(["yarbo-lawn-mower-pro-module", "yarbo-snow-blower-module", "yarbo-leaf-blower-module", "yarbo-trimmer-module"]);
const YARBO_HIDDEN = new Set(["yarbo-plow-module"]);
const active = (row: { public_status: string; retired_at?: string | null }) => row.public_status === "active" && !row.retired_at;
const reject = (code: ConstructorParameters<typeof CheckoutRejectionError>[0], message: string): never => { throw new CheckoutRejectionError(code, message); };
const unavailable = (name: string): never => reject("INACTIVE_CATALOG_RECORD", `${name} is currently unavailable. Please update your configuration before continuing.`);

export function checkoutProductIsSupported(product: {
  slug: string;
  brand: string;
  admin_managed?: boolean;
  adminManaged?: boolean;
  hasManagedPackages?: boolean;
}) {
  return (
    !catalogProductRequiresQuote(product) &&
    (product.slug === "lymow-one-plus" || product.slug === "yarbo" || product.admin_managed === true || product.adminManaged === true || product.hasManagedPackages === true)
  );
}

export function resolveCheckoutPackageComponents(catalog: CheckoutCatalog, packageId: string, now = Date.now()) {
  const products = [catalog.product, ...(catalog.componentProducts ?? [])];
  const variants = [...catalog.variants, ...(catalog.componentVariants ?? [])];
  const options = [...catalog.options, ...(catalog.componentOptions ?? [])];
  const seen = new Set<string>();
  const components = catalog.packageItems.filter((item) => item.package_id === packageId).map((item) => {
    const references = [item.option_id, item.component_product_id, item.component_variant_id].filter(Boolean);
    if (references.length !== 1) reject("INCOMPATIBLE_SELECTION", "Package contains an invalid component relationship.");
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) reject("INVALID_QUANTITY", "Package component quantity is invalid.");
    const kind = item.option_id ? "option" as const : item.component_variant_id ? "variant" as const : "product" as const;
    const row = kind === "option" ? options.find((row) => row.id === item.option_id)
      : kind === "variant" ? variants.find((row) => row.id === item.component_variant_id)
      : products.find((row) => row.id === item.component_product_id);
    if (!row) throw new CheckoutRejectionError("UNKNOWN_CATALOG_RECORD", "A package component was not found.");
    const identity = `${kind}:${row.id}`;
    if (seen.has(identity)) reject("DUPLICATE_SELECTION", "Package contains duplicate components.");
    seen.add(identity);
    const parent = kind === "product" ? row as CheckoutProductRow : products.find((product) => product.id === (row as CheckoutOptionRow | CheckoutVariantRow).product_id);
    // Legacy option fixtures are scoped to the anchor. Live reads supply every cross-brand parent.
    if (!parent) reject("CROSS_PRODUCT_SELECTION", "A package component parent was not found.");
    if (!active(parent!)) unavailable(parent!.name);
    if (catalogProductRequiresQuote(parent!)) reject("QUOTE_ONLY_PRODUCT", "A quote-only item cannot be purchased in this package.");
    if (row.retired_at || (kind === "variant" ? !["available", "preorder"].includes(catalogPurchaseState(row as CheckoutVariantRow, now)) : !active(row))) unavailable(row.name);
    if (catalog.product.slug === "yarbo" && ((kind === "product" && row.id === catalog.product.id) || (kind === "variant" && ["yarbo-y40", "yarbo-y40p"].includes((row as CheckoutVariantRow).variant_slug)))) reject("YARBO_PACKAGE_DOUBLE_COUNT", "Choose the Yarbo Core separately; a package cannot contain physical Core components.");
    return { item, kind, row, parent: parent! };
  });
  for (const component of components) {
    if (component.kind !== "variant") continue;
    const variant = component.row as CheckoutVariantRow;
    if (components.some((other) => other.kind === "product" && other.row.id === variant.product_id)) reject("DUPLICATE_SELECTION", "Package contains both a machine and its configuration.");
    for (const option of components.filter((other) => other.kind === "option")) {
      const relationships = catalog.variantOptions.filter((link) => link.option_id === option.row.id);
      if (relationships.some((link) => link.variant_id === variant.id && link.relationship_type === "excluded")) reject("INCOMPATIBLE_SELECTION", "A package component is incompatible with its machine configuration.");
    }
    for (const link of catalog.variantOptions.filter((link) => link.variant_id === variant.id && ["defines_variant", "included", "required"].includes(link.relationship_type))) {
      const option = options.find((option) => option.id === link.option_id);
      if (!option || !active(option)) reject("INACTIVE_CATALOG_RECORD", "Required machine configuration equipment is unavailable.");
      if (link.relationship_type === "required" && !components.some((other) => other.kind === "option" && other.row.id === link.option_id)) reject("MISSING_CONFIGURATION", "A required package component is missing.");
    }
  }
  return components;
}

export function validateCheckoutEligibility(request: CheckoutRequest, catalog: CheckoutCatalog, now = Date.now()) {
  const { product } = catalog;
  if (product.id !== request.selection.productId) reject("UNKNOWN_CATALOG_RECORD", "Product was not found.");
  if (!checkoutProductIsSupported(product) && !(!catalogProductRequiresQuote(product) && catalog.packages.some((row) => row.id === request.selection.packageId && row.admin_managed))) reject("QUOTE_ONLY_PRODUCT", "This product is quote-only.");
  if (!active(product)) unavailable(product.name);
  const selectedOptions = request.selection.options.map(({ optionId, quantity }) => {
    const option = catalog.options.find((row) => row.id === optionId);
    if (!option) throw new CheckoutRejectionError("UNKNOWN_CATALOG_RECORD", "Option was not found.");
    if (option.product_id !== product.id) reject("CROSS_PRODUCT_SELECTION", "The selected option belongs to another product.");
    if (!active(option)) unavailable(option.name);
    const maximum = Math.min(option.maximum_quantity ?? 10, 10);
    if (quantity < Math.max(1, option.minimum_quantity) || quantity > maximum) reject("INVALID_QUANTITY", "Option quantity is outside its allowed range.");
    return { option, quantity };
  });
  const variant = request.selection.variantId ? catalog.variants.find((row) => row.id === request.selection.variantId) : null;
  const selectedPackage = request.selection.packageId ? catalog.packages.find((row) => row.id === request.selection.packageId) : null;
  if (request.selection.variantId && !variant) throw new CheckoutRejectionError("UNKNOWN_CATALOG_RECORD", "Variant was not found.");
  if (request.selection.packageId && !selectedPackage) throw new CheckoutRejectionError("UNKNOWN_CATALOG_RECORD", "Package was not found.");
  if (variant?.product_id !== undefined && variant.product_id !== product.id) reject("CROSS_PRODUCT_SELECTION", "The selected variant belongs to another product.");
  if (variant && (variant.retired_at || !["available", "preorder"].includes(catalogPurchaseState(variant, now)))) {
    if (variant.public_status === "coming_soon") reject("INACTIVE_CATALOG_RECORD", `${variant.name} is Coming Soon and cannot be purchased yet.`);
    unavailable(variant.name);
  }
  if (selectedPackage?.product_id !== undefined && selectedPackage.product_id !== product.id) reject("CROSS_PRODUCT_SELECTION", "The selected package belongs to another product.");
  if (selectedPackage && !active(selectedPackage)) unavailable(selectedPackage.package_name);
  if (variant && catalogPurchaseState(variant, now) === "preorder") {
    const components = catalog.variantOptions.filter((link) => link.variant_id === variant.id &&
      ["defines_variant", "included", "required"].includes(link.relationship_type));
    for (const link of components) {
      const option = catalog.options.find((row) => row.id === link.option_id);
      if (!option || option.product_id !== product.id) reject("CROSS_PRODUCT_SELECTION", "A required Core component was not found.");
      if (!active(option!)) unavailable(option!.name);
      if (link.relationship_type === "required" &&
        !selectedOptions.some(({ option: selected }) => selected.id === link.option_id) &&
        !catalog.packageItems.some((item) => item.package_id === selectedPackage?.id && item.option_id === link.option_id)) {
        reject("MISSING_CONFIGURATION", "A required Core component is missing.");
      }
    }
  }

  if (product.slug !== "yarbo" && selectedPackage?.admin_managed) {
    if (request.selection.purchaseMode !== "standard" || request.selection.includeBaseProduct) reject("INCOMPATIBLE_SELECTION", "Choose this package without a separate base machine.");
    if (selectedPackage.show_public_price === false || selectedPackage.contact_for_pricing) reject("UNPRICED_ITEM", "This package requires a pricing request.");
    const packageComponents = resolveCheckoutPackageComponents(catalog, selectedPackage.id, now);
    if (!packageComponents.length) reject("MISSING_CONFIGURATION", "This package has no sellable components.");
    if (variant && !packageComponents.some((component) => component.kind === "variant" && component.row.id === variant.id)) reject("INCOMPATIBLE_SELECTION", "The selected configuration is not part of this package.");
    if (selectedOptions.some(({ option }) => packageComponents.some((component) => component.kind === "option" && component.row.id === option.id))) reject("DUPLICATE_SELECTION", "A package component cannot also be charged as an add-on.");
    return { variant, selectedPackage, selectedOptions, corePrice: null, packageComponents, packageItems: packageComponents.map((component) => component.item), moduleOnlyWarning: null };
  }

  if (product.admin_managed && product.slug !== "yarbo" && product.slug !== "lymow-one-plus") {
    if (request.selection.purchaseMode !== "standard" || selectedPackage) reject("INCOMPATIBLE_SELECTION", "Invalid product purchase mode.");
    if (catalog.variants.length && !variant) reject("MISSING_CONFIGURATION", "Choose a product configuration.");
    if (variant && selectedOptions.some(({ option }) => catalog.variantOptions.some((link) => link.variant_id === variant.id && link.option_id === option.id && link.relationship_type === "excluded"))) reject("INCOMPATIBLE_SELECTION", "An add-on is incompatible with the selected configuration.");
    if (variant) for (const link of catalog.variantOptions.filter((link) => link.variant_id === variant.id && ["defines_variant", "included", "required"].includes(link.relationship_type))) {
      const option = catalog.options.find((option) => option.id === link.option_id);
      if (!option || !active(option)) reject("INACTIVE_CATALOG_RECORD", "Required configuration equipment is unavailable.");
      if (link.relationship_type === "required" && !selectedOptions.some(({ option }) => option.id === link.option_id)) reject("MISSING_CONFIGURATION", "A required configuration add-on is missing.");
    }
    if (product.show_public_price === false || product.contact_for_pricing) reject("UNPRICED_ITEM", "This product requires a pricing request.");
    return { variant, selectedPackage: null, selectedOptions, corePrice: null, moduleOnlyWarning: null };
  }

  if (product.slug === "lymow-one-plus") {
    if (!variant || !LYMOW_VARIANTS.has(variant.variant_slug) || request.selection.purchaseMode !== "standard") throw new CheckoutRejectionError("MISSING_CONFIGURATION", "Choose one supported Lymow variant.");
    if (selectedPackage) reject("INCOMPATIBLE_SELECTION", "Lymow package checkout is unavailable; choose the 5A or 10A variant without a package.");
    if (selectedOptions.some(({ option }) => LYMOW_CHARGERS.has(option.option_slug))) reject("LYMOW_CHARGER_SUBMITTED", "The Lymow charger is included and cannot be submitted separately.");
    if (selectedOptions.some(({ option }) => !option.accessory_listing_enabled || option.accessory_tab !== "lymow" || !option.show_in_builder || option.accessory_action_type !== "builder" || option.contact_for_pricing || option.regular_price_cents === null)) reject("INCOMPATIBLE_SELECTION", "This Lymow option is not available for checkout.");
    const defining = catalog.variantOptions.filter((link) => link.variant_id === variant.id && link.relationship_type === "defines_variant");
    const definingChargers = defining.map((link) => catalog.options.find((option) => option.id === link.option_id)).filter((option): option is CheckoutOptionRow => Boolean(option && option.product_id === product.id && LYMOW_CHARGERS.has(option.option_slug)));
    const expected = variant.variant_slug.endsWith("5a") ? "lymow-5a-charger" : "lymow-10a-charger";
    if (defining.length !== 1 || definingChargers.length !== 1 || definingChargers[0].option_slug !== expected) reject("LYMOW_CHARGER_RELATIONSHIP_INVALID", "Lymow charger relationship is invalid.");
    if (!active(definingChargers[0])) unavailable(definingChargers[0].name);
    for (const { option } of selectedOptions) {
      const relationships = catalog.variantOptions.filter((link) => link.option_id === option.id && link.relationship_type !== "defines_variant");
      if (relationships.some((link) => link.variant_id === variant.id && link.relationship_type === "excluded") || (relationships.length > 0 && !relationships.some((link) => link.variant_id === variant.id && ["compatible", "included", "required"].includes(link.relationship_type)))) reject("INCOMPATIBLE_SELECTION", "Option is incompatible with the selected Lymow variant.");
    }
    const missingRequired = catalog.variantOptions.filter((link) => link.variant_id === variant.id && link.relationship_type === "required").some((link) => !selectedOptions.some(({ option }) => option.id === link.option_id));
    if (missingRequired) reject("MISSING_CONFIGURATION", "A required Lymow option is missing.");
    return { variant, selectedPackage: null, selectedOptions, corePrice: null, moduleOnlyWarning: null };
  }

  if (product.slug !== "yarbo") reject("INCOMPATIBLE_SELECTION", "Product is not approved for checkout.");
  const isYarboModule = (option: CheckoutOptionRow) => YARBO_MODULES.has(option.option_slug) || (option.admin_managed === true && option.catalog_category === "module" && option.product_id === product.id);
  if (variant && !["yarbo-y40", "yarbo-y40p"].includes(variant.variant_slug)) reject("INCOMPATIBLE_SELECTION", "Choose a supported Yarbo Core.");
  if (selectedOptions.some(({ option }) => YARBO_HIDDEN.has(option.option_slug))) reject("YARBO_HIDDEN_OPTION", "This Yarbo option is not available.");
  const validYarboAccessory = (option: CheckoutOptionRow) => option.accessory_listing_enabled === true && option.accessory_tab === "yarbo" && option.show_in_builder === true && option.accessory_action_type === "builder" && !option.contact_for_pricing;
  if (selectedOptions.some(({ option }) => !isYarboModule(option) && !validYarboAccessory(option))) reject("INCOMPATIBLE_SELECTION", "Only approved Yarbo modules and builder accessories may be selected.");
  if (request.selection.purchaseMode === "complete-system") {
    if (!selectedPackage) throw new CheckoutRejectionError("MISSING_CONFIGURATION", "Choose one Yarbo package.");
    if (catalog.variants.some((core) => ["yarbo-y40", "yarbo-y40p"].includes(core.variant_slug)) && !variant) reject("MISSING_CONFIGURATION", "Choose one Yarbo Core for this package.");
    if (request.selection.includeBaseProduct || selectedOptions.some(({ option }) => isYarboModule(option))) reject("YARBO_PACKAGE_DOUBLE_COUNT", "A Yarbo package cannot include standalone Core or module selections.");
    const packageComponents = resolveCheckoutPackageComponents(catalog, selectedPackage.id, now);
    const packageOptions = packageComponents.filter((component) => component.kind === "option").map((component) => component.row as CheckoutOptionRow);
    const corePrice = variant
      ? (catalog.corePrices ?? []).find((row) => row.package_id === selectedPackage.id && row.core_variant_id === variant.id)
      : null;
    if (variant && (!corePrice || corePrice.product_id !== product.id || !active(corePrice) || corePrice.price_mode !== (variant.variant_slug === "yarbo-y40" ? "package" : "core_specific") || corePrice.contact_for_pricing || !corePrice.show_public_price)) reject("INCOMPATIBLE_SELECTION", "This package and Core combination is not available.");
    if (variant && packageOptions.some((option) => option && isYarboModule(option) && !catalog.variantOptions.some((link) => link.variant_id === variant.id && link.option_id === option.id && link.relationship_type === "compatible"))) reject("INCOMPATIBLE_SELECTION", "A package module is not compatible with the selected Core.");
    return { variant, selectedPackage, selectedOptions: selectedOptions.filter(({ option }) => validYarboAccessory(option)), corePrice, packageComponents, packageItems: packageComponents.map((component) => component.item), moduleOnlyWarning: null };
  }
  if (request.selection.purchaseMode !== "individual-equipment" || selectedPackage) reject("INCOMPATIBLE_SELECTION", "Invalid Yarbo purchase mode.");
  const selectedModules = selectedOptions.filter(({ option }) => isYarboModule(option));
  if (request.selection.includeBaseProduct && catalog.variants.some((core) => ["yarbo-y40", "yarbo-y40p"].includes(core.variant_slug)) && !variant) reject("MISSING_CONFIGURATION", "Choose one Yarbo Core.");
  if (!request.selection.includeBaseProduct && variant) reject("INCOMPATIBLE_SELECTION", "Module-only orders cannot include a Core selection.");
  if (variant && selectedModules.some(({ option }) => !catalog.variantOptions.some((link) => link.variant_id === variant.id && link.option_id === option.id && link.relationship_type === "compatible"))) reject("INCOMPATIBLE_SELECTION", "A module is not compatible with the selected Core.");
  if (!request.selection.includeBaseProduct && !selectedModules.length) reject("MISSING_CONFIGURATION", "Choose Yarbo Core or at least one module.");
  return { variant, selectedPackage: null, selectedOptions, corePrice: null, moduleOnlyWarning: !request.selection.includeBaseProduct && selectedModules.length ? "Yarbo Core is not included. These modules require an existing Yarbo Core to operate." : null };
}

export function checkoutDisplayName(option: CheckoutOptionRow) {
  return option.option_slug === "yarbo-leaf-blower-module" ? "Blower Module" : option.name.replaceAll("Leaf Blower", "Blower");
}
