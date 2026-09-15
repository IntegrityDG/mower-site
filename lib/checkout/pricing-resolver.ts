import "server-only";
import { currentPrice, resolveEquipmentCatalogPricing } from "./equipment-pricing";

import { getSupabaseServiceClient } from "@/lib/supabase";
import { checkoutDisplayName, type CheckoutCatalog } from "./eligibility";
import { CheckoutRejectionError, type CatalogSourceReference, type CheckoutRequest, type OrderPriceItem, type OrderPriceSnapshot } from "./types";
import { resolvePaymentAdjustments } from "./payment-pricing";
import { applyActivePriceSchedule, selectActivePriceSchedule } from "@/lib/catalog/active-price-schedule";
import { readPricingProgramSettingsFailSafe } from "@/lib/pricing-program/server";
import { addOptionalServices } from "./optional-services";
import { readPublicServiceAvailability } from "@/lib/service/availability";

const ensure = <T>(result: { data: T[] | null; error: { message: string } | null }, label: string) => {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data ?? [];
};

const ACCESSORY_BLOCKLIST = new Set(["lymow-5a-charger", "lymow-10a-charger", "yarbo-4g-service", "yarbo-plow-module"]);

async function resolveAccessoryOnlyPricing(input: CheckoutRequest): Promise<OrderPriceSnapshot> {
  if (input.selection.variantId || input.selection.packageId || input.selection.includeBaseProduct || input.selection.options.length === 0) throw new CheckoutRejectionError("MISSING_CONFIGURATION", "Choose at least one eligible accessory.");
  const supabase = getSupabaseServiceClient();
  const { everydayLowPriceEnabled } =
    await readPricingProgramSettingsFailSafe();
  const optionIds = input.selection.options.map((item) => item.optionId);
  const optionsResult = await supabase.from("catalog_options").select("*").in("id", optionIds);
  const options = ensure(optionsResult, "Options");
  if (options.length !== optionIds.length) throw new CheckoutRejectionError("UNKNOWN_CATALOG_RECORD", "An accessory was not found.");
  const productIds = [...new Set(options.map((option) => option.product_id))];
  const productsResult = await supabase.from("catalog_products").select("*").in("id", productIds);
  const products = ensure(productsResult, "Products");
  if (products.length !== productIds.length) throw new CheckoutRejectionError("UNKNOWN_CATALOG_RECORD", "An accessory product was not found.");
  if (input.selection.productId !== options[0].product_id) throw new CheckoutRejectionError("CROSS_PRODUCT_SELECTION", "The accessory anchor product is invalid.");
  for (const selected of input.selection.options) {
    const option = options.find((row) => row.id === selected.optionId)!;
    const product = products.find((row) => row.id === option.product_id);
    const correctTab = product?.slug === "lymow-one-plus" ? "lymow" : product?.slug === "yarbo" ? "yarbo" : product?.slug === "ids-aftermarket" ? "aftermarket" : null;
    if (!product || !correctTab) throw new CheckoutRejectionError("QUOTE_ONLY_PRODUCT", "This accessory is not eligible for checkout.");
    if (product.public_status !== "active") throw new CheckoutRejectionError("INACTIVE_CATALOG_RECORD", `${product.name} is currently unavailable. Please update your configuration before continuing.`);
    if (option.public_status !== "active") throw new CheckoutRejectionError("INACTIVE_CATALOG_RECORD", `${option.name} is currently unavailable. Please update your configuration before continuing.`);
    if (option.accessory_listing_enabled !== true || option.accessory_tab !== correctTab || option.show_in_builder !== true || (correctTab !== "aftermarket" && option.accessory_action_type !== "builder") || option.contact_for_pricing || option.regular_price_cents === null || ACCESSORY_BLOCKLIST.has(option.option_slug)) throw new CheckoutRejectionError("INCOMPATIBLE_SELECTION", "This accessory is not available for IDS checkout.");
    const maximum = Math.min(option.maximum_quantity ?? 10, 10);
    if (selected.quantity < Math.max(1, option.minimum_quantity) || selected.quantity > maximum) throw new CheckoutRejectionError("INVALID_QUANTITY", "Accessory quantity is outside its allowed range.");
  }
  const schedulesResult = await supabase.from("catalog_price_schedules").select("id, option_id, regular_price_cents, sale_price_cents, starts_at, ends_at, public_status").in("option_id", optionIds).eq("public_status", "active");
  const schedules = ensure(schedulesResult, "Price schedules");
  const now = Date.now();
  const sources: CatalogSourceReference[] = products.map((product) => ({ table: "catalog_products", id: product.id }));
  const chargeable: OrderPriceItem[] = input.selection.options.map((selected) => {
    const option = options.find((row) => row.id === selected.optionId)!;
    const schedule = selectActivePriceSchedule(schedules, "option", option.id, now);
    if (schedule) sources.push({ table: "catalog_price_schedules", id: schedule.id });
    sources.push({ table: "catalog_options", id: option.id });
    const amount = currentPrice(applyActivePriceSchedule(option, schedule), now, everydayLowPriceEnabled);
    return { itemType: "option", sourceId: option.id, sku: null, name: checkoutDisplayName(option), description: option.description, quantity: selected.quantity, unitAmountCents: amount, extendedAmountCents: amount * selected.quantity, includedInPackagePrice: false, parentSourceId: null };
  });
  const subtotal = chargeable.reduce((sum, item) => sum + item.extendedAmountCents, 0);
  const adjustments = resolvePaymentAdjustments(subtotal, input.paymentMethod);
  const anchor = products.find((product) => product.id === input.selection.productId)!;
  return Object.freeze({ currency: "usd", product: { id: anchor.id, slug: "accessories", name: "Accessories & Parts" }, variant: null, purchaseMode: "accessories", chargeableItems: Object.freeze(chargeable), includedPackageComponents: Object.freeze([]), subtotalCents: subtotal, discountCents: adjustments.discountCents, feeCents: 0, shippingCents: 0, taxCents: 0, totalCents: adjustments.totalCents, paymentMethod: input.paymentMethod, pricedAt: new Date(now).toISOString(), catalogSources: Object.freeze(sources), warnings: Object.freeze([]), safeMetadata: { phase: "4B2B" as const, discountPolicy: adjustments.discountPolicy } });
}

async function resolveEquipmentPricing(input: CheckoutRequest): Promise<OrderPriceSnapshot> {
  if (input.selection.purchaseMode === "accessories") return resolveAccessoryOnlyPricing(input);
  const supabase = getSupabaseServiceClient();
  const { everydayLowPriceEnabled } =
    await readPricingProgramSettingsFailSafe();
  const productResult = await supabase.from("catalog_products").select("*").eq("id", input.selection.productId).limit(1);
  if (productResult.error) throw new Error(`Product: ${productResult.error.message}`);
  const product = productResult.data?.[0];
  if (!product) throw new CheckoutRejectionError("UNKNOWN_CATALOG_RECORD", "Product was not found.");
  const [variantsResult, optionsResult, packagesResult, variantOptionsResult, packageItemsResult, schedulesResult, corePricesResult] = await Promise.all([
    supabase.from("catalog_product_variants").select("*").eq("product_id", product.id),
    supabase.from("catalog_options").select("*").eq("product_id", product.id),
    supabase.from("catalog_packages").select("*").eq("product_id", product.id),
    supabase.from("catalog_variant_options").select("*"),
    supabase.from("catalog_package_items").select("*"),
    supabase.from("catalog_price_schedules").select("id, product_id, variant_id, option_id, package_id, regular_price_cents, sale_price_cents, starts_at, ends_at, public_status").eq("public_status", "active"),
    product.slug === "yarbo" && input.selection.variantId
      ? supabase.from("catalog_package_core_prices").select("*").eq("product_id", product.id)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const catalog: CheckoutCatalog = { product, variants: ensure(variantsResult, "Variants"), options: ensure(optionsResult, "Options"), packages: ensure(packagesResult, "Packages"), variantOptions: ensure(variantOptionsResult, "Variant options"), packageItems: ensure(packageItemsResult, "Package items"), corePrices: ensure(corePricesResult, "Package Core prices") };
  const schedules = ensure(schedulesResult, "Price schedules");
  return resolveEquipmentCatalogPricing(input, catalog, schedules, Date.now(), everydayLowPriceEnabled);
}

export async function resolveAuthoritativeOrderPricing(input: CheckoutRequest): Promise<OrderPriceSnapshot> {
  const availability = await readPublicServiceAvailability();
  return addOptionalServices(await resolveEquipmentPricing(input), input, {
    install: { available: availability.professional_installation.available, message: availability.professional_installation.public_message },
    setup: { available: availability.professional_setup.available, message: availability.professional_setup.public_message },
    remoteSupport: { available: availability.new_remote_support_subscriptions.available, message: availability.new_remote_support_subscriptions.public_message },
  });
}
