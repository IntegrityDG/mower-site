import { catalogPurchaseState, preorderItemName, PREORDER_FULFILLMENT_NOTICE } from "@/lib/catalog/preorder";
import { checkoutDisplayName, validateCheckoutEligibility, type CheckoutCatalog, type PriceableRow } from "./eligibility";
import { CheckoutRejectionError, type CatalogSourceReference, type CheckoutRequest, type OrderPriceItem, type OrderPriceSnapshot } from "./types";
import { resolvePaymentAdjustments } from "./payment-pricing";
import { applyActivePriceSchedule, selectActivePriceSchedule, type ActivePriceSchedule } from "@/lib/catalog/active-price-schedule";
import { operationalPriceCents } from "./operational-price";
import { yarboPackagePriceSource } from "./yarbo-package-price";

export function currentPrice(row: PriceableRow, now: number, everydayLowPriceEnabled: boolean) {
  const price = operationalPriceCents(row, now, everydayLowPriceEnabled);
  if (price === null || !Number.isSafeInteger(price) || price < 0) throw new CheckoutRejectionError("UNPRICED_ITEM", "A selected catalog item does not have a valid current price.");
  return price;
}

/** Shared by live checkout and integration tests; all input rows come from the server catalog. */
export function resolveEquipmentCatalogPricing(input: CheckoutRequest, catalog: CheckoutCatalog,
  schedules: readonly ActivePriceSchedule[] = [], now = Date.now(), everydayLowPriceEnabled = true): OrderPriceSnapshot {
  const { product } = catalog;

  const eligibility = validateCheckoutEligibility(input, catalog, now);
  const isPreorder = eligibility.variant !== null && eligibility.variant !== undefined &&
    catalogPurchaseState(eligibility.variant, now) === "preorder";
  const preorder = isPreorder && eligibility.variant ? {
    coreName: eligibility.variant.name,
    startsAt: eligibility.variant.sale_starts_at!,
    endsAt: eligibility.variant.sale_ends_at!,
    notice: `This order includes a ${eligibility.variant.name} Early Access pre-order. ${PREORDER_FULFILLMENT_NOTICE}`,
  } : undefined;
  const sources: CatalogSourceReference[] = [{ table: "catalog_products", id: product.id }];
  const effectivePrice = (row: PriceableRow, type: "product" | "variant" | "option" | "package") => {
    const schedule = selectActivePriceSchedule(schedules, type, row.id, now);
    if (schedule) {
      sources.push({ table: "catalog_price_schedules", id: schedule.id });
      return currentPrice(applyActivePriceSchedule(row, schedule), now, everydayLowPriceEnabled);
    }
    return currentPrice(row, now, everydayLowPriceEnabled);
  };
  const chargeable: OrderPriceItem[] = [];
  const included: OrderPriceItem[] = [];
  if (product.slug === "lymow-one-plus" && eligibility.variant) {
    if (eligibility.selectedPackage) throw new CheckoutRejectionError("INCOMPATIBLE_SELECTION", "Lymow package checkout is unavailable.");
    const amount = effectivePrice(eligibility.variant, "variant"); sources.push({ table: "catalog_product_variants", id: eligibility.variant.id });
    chargeable.push({ itemType: "variant", sourceId: eligibility.variant.id, sku: eligibility.variant.sku, name: eligibility.variant.name, description: eligibility.variant.description, quantity: 1, unitAmountCents: amount, extendedAmountCents: amount, includedInPackagePrice: false, parentSourceId: null });
    for (const selected of eligibility.selectedOptions) { const amount = effectivePrice(selected.option, "option"); sources.push({ table: "catalog_options", id: selected.option.id }); chargeable.push({ itemType: "option", sourceId: selected.option.id, sku: null, name: selected.option.name, description: selected.option.description, quantity: selected.quantity, unitAmountCents: amount, extendedAmountCents: amount * selected.quantity, includedInPackagePrice: false, parentSourceId: null }); }
  } else if (product.slug === "yarbo" && eligibility.selectedPackage) {
    const packagePriceSource = yarboPackagePriceSource(eligibility.selectedPackage, eligibility.corePrice);
    const amount = packagePriceSource === eligibility.selectedPackage
      ? effectivePrice(eligibility.selectedPackage, "package")
      : currentPrice(packagePriceSource, now, everydayLowPriceEnabled);
    sources.push({ table: "catalog_packages", id: eligibility.selectedPackage.id });
    if (eligibility.variant) sources.push({ table: "catalog_product_variants", id: eligibility.variant.id });
    if (eligibility.corePrice) sources.push({ table: "catalog_package_core_prices", id: eligibility.corePrice.id });
    chargeable.push({ itemType: "package", sourceId: eligibility.selectedPackage.id, sku: null, name: preorderItemName(`${eligibility.variant?.name ?? "Y40 Core"} + ${eligibility.selectedPackage.package_name.replaceAll("Leaf Blower", "Blower")}`, isPreorder), description: preorder?.notice ?? eligibility.selectedPackage.description, quantity: 1, unitAmountCents: amount, extendedAmountCents: amount, includedInPackagePrice: false, parentSourceId: null });
    for (const item of eligibility.packageItems ?? []) { const option = catalog.options.find((row) => row.id === item.option_id)!; sources.push({ table: "catalog_package_items", id: item.id }, { table: "catalog_options", id: option.id }); included.push({ itemType: "package_component", sourceId: option.id, sku: null, name: checkoutDisplayName(option), description: option.description, quantity: item.quantity, unitAmountCents: 0, extendedAmountCents: 0, includedInPackagePrice: true, parentSourceId: eligibility.selectedPackage.id }); }
    for (const selected of eligibility.selectedOptions) { const accessoryAmount = effectivePrice(selected.option, "option"); sources.push({ table: "catalog_options", id: selected.option.id }); chargeable.push({ itemType: "option", sourceId: selected.option.id, sku: null, name: selected.option.name, description: selected.option.description, quantity: selected.quantity, unitAmountCents: accessoryAmount, extendedAmountCents: accessoryAmount * selected.quantity, includedInPackagePrice: false, parentSourceId: null }); }
  } else {
    if (input.selection.includeBaseProduct) {
      const core = product.slug === "yarbo" ? eligibility.variant : null;
      const amount = core && core.variant_slug === "yarbo-y40p"
        ? effectivePrice(core, "variant")
        : effectivePrice(product, "product");
      if (core) sources.push({ table: "catalog_product_variants", id: core.id });
      chargeable.push({ itemType: core ? "variant" : "product", sourceId: core?.id ?? product.id, sku: core?.sku ?? null, name: preorderItemName(core?.name ?? (product.slug === "yarbo" ? "Y40 Core" : product.name), isPreorder), description: preorder?.notice ?? core?.description ?? product.description ?? null, quantity: 1, unitAmountCents: amount, extendedAmountCents: amount, includedInPackagePrice: false, parentSourceId: null });
    }
    for (const selected of eligibility.selectedOptions) { const amount = effectivePrice(selected.option, "option"); sources.push({ table: "catalog_options", id: selected.option.id }); chargeable.push({ itemType: "option", sourceId: selected.option.id, sku: null, name: checkoutDisplayName(selected.option), description: selected.option.description, quantity: selected.quantity, unitAmountCents: amount, extendedAmountCents: amount * selected.quantity, includedInPackagePrice: false, parentSourceId: null }); }
  }
  const subtotal = chargeable.reduce((sum, item) => sum + item.extendedAmountCents, 0);
  const adjustments = resolvePaymentAdjustments(subtotal, input.paymentMethod);
  return Object.freeze({ ...(preorder ? { preorder } : {}), currency: "usd", product: { id: product.id, slug: product.slug, name: product.name }, variant: eligibility.variant ? { id: eligibility.variant.id, slug: eligibility.variant.variant_slug, name: eligibility.variant.name, sku: eligibility.variant.sku } : null, purchaseMode: input.selection.purchaseMode, chargeableItems: Object.freeze(chargeable), includedPackageComponents: Object.freeze(included), subtotalCents: subtotal, discountCents: adjustments.discountCents, feeCents: 0, shippingCents: 0, taxCents: 0, totalCents: adjustments.totalCents, paymentMethod: input.paymentMethod, pricedAt: new Date(now).toISOString(), catalogSources: Object.freeze(sources), warnings: Object.freeze([...(eligibility.moduleOnlyWarning ? [eligibility.moduleOnlyWarning] : []), ...(preorder ? [preorder.notice] : [])]), safeMetadata: { phase: "4B2B" as const, discountPolicy: adjustments.discountPolicy } });
}
