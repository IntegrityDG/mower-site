import "server-only";

import { getSupabaseServiceClient } from "@/lib/supabase";
import { checkoutDisplayName, validateCheckoutEligibility, type CheckoutCatalog, type PriceableRow } from "./eligibility";
import { CheckoutRejectionError, type CatalogSourceReference, type CheckoutRequest, type OrderPriceItem, type OrderPriceSnapshot } from "./types";

function currentPrice(row: PriceableRow, now: number) {
  const starts = row.sale_starts_at ? new Date(row.sale_starts_at).getTime() : Number.NEGATIVE_INFINITY;
  const ends = row.sale_ends_at ? new Date(row.sale_ends_at).getTime() : Number.POSITIVE_INFINITY;
  const price = row.sale_price_cents !== null && now >= starts && now <= ends ? row.sale_price_cents : row.regular_price_cents;
  if (price === null || !Number.isSafeInteger(price) || price < 0) throw new CheckoutRejectionError("UNPRICED_ITEM", "A selected catalog item does not have a valid current price.");
  return price;
}

const ensure = <T>(result: { data: T[] | null; error: { message: string } | null }, label: string) => {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data ?? [];
};

export async function resolveAuthoritativeOrderPricing(input: CheckoutRequest): Promise<OrderPriceSnapshot> {
  const supabase = getSupabaseServiceClient();
  const productResult = await supabase.from("catalog_products").select("*").eq("id", input.selection.productId).limit(1);
  if (productResult.error) throw new Error(`Product: ${productResult.error.message}`);
  const product = productResult.data?.[0];
  if (!product) throw new CheckoutRejectionError("UNKNOWN_CATALOG_RECORD", "Product was not found.");
  const [variantsResult, optionsResult, packagesResult, variantOptionsResult, packageItemsResult, schedulesResult] = await Promise.all([
    supabase.from("catalog_product_variants").select("*").eq("product_id", product.id),
    supabase.from("catalog_options").select("*").eq("product_id", product.id),
    supabase.from("catalog_packages").select("*").eq("product_id", product.id),
    supabase.from("catalog_variant_options").select("*"),
    supabase.from("catalog_package_items").select("*"),
    supabase.from("catalog_price_schedules").select("id, product_id, variant_id, option_id, package_id, regular_price_cents, sale_price_cents, starts_at, ends_at, public_status").eq("public_status", "active"),
  ]);
  const catalog: CheckoutCatalog = { product, variants: ensure(variantsResult, "Variants"), options: ensure(optionsResult, "Options"), packages: ensure(packagesResult, "Packages"), variantOptions: ensure(variantOptionsResult, "Variant options"), packageItems: ensure(packageItemsResult, "Package items") };
  const schedules = ensure(schedulesResult, "Price schedules");
  const eligibility = validateCheckoutEligibility(input, catalog);
  const now = Date.now();
  const sources: CatalogSourceReference[] = [{ table: "catalog_products", id: product.id }];
  const effectivePrice = (row: PriceableRow, type: "product" | "variant" | "option" | "package") => {
    const idKey = `${type}_id` as "product_id" | "variant_id" | "option_id" | "package_id";
    const schedule = schedules.filter((item) => item[idKey] === row.id && (!item.starts_at || now >= new Date(item.starts_at).getTime()) && (!item.ends_at || now <= new Date(item.ends_at).getTime())).sort((a, b) => new Date(b.starts_at ?? 0).getTime() - new Date(a.starts_at ?? 0).getTime())[0];
    if (schedule) {
      sources.push({ table: "catalog_price_schedules", id: schedule.id });
      return currentPrice({ ...row, regular_price_cents: schedule.regular_price_cents, sale_price_cents: schedule.sale_price_cents, sale_starts_at: schedule.starts_at, sale_ends_at: schedule.ends_at }, now);
    }
    return currentPrice(row, now);
  };
  const chargeable: OrderPriceItem[] = [];
  const included: OrderPriceItem[] = [];
  if (product.slug === "lymow-one-plus" && eligibility.variant) {
    if (eligibility.selectedPackage) throw new CheckoutRejectionError("INCOMPATIBLE_SELECTION", "Lymow package checkout is unavailable.");
    const amount = effectivePrice(eligibility.variant, "variant"); sources.push({ table: "catalog_product_variants", id: eligibility.variant.id });
    chargeable.push({ itemType: "variant", sourceId: eligibility.variant.id, sku: eligibility.variant.sku, name: eligibility.variant.name, description: eligibility.variant.description, quantity: 1, unitAmountCents: amount, extendedAmountCents: amount, includedInPackagePrice: false, parentSourceId: null });
    for (const selected of eligibility.selectedOptions) { const amount = effectivePrice(selected.option, "option"); sources.push({ table: "catalog_options", id: selected.option.id }); chargeable.push({ itemType: "option", sourceId: selected.option.id, sku: null, name: selected.option.name, description: selected.option.description, quantity: selected.quantity, unitAmountCents: amount, extendedAmountCents: amount * selected.quantity, includedInPackagePrice: false, parentSourceId: null }); }
  } else if (product.slug === "yarbo" && eligibility.selectedPackage) {
    const amount = effectivePrice(eligibility.selectedPackage, "package"); sources.push({ table: "catalog_packages", id: eligibility.selectedPackage.id });
    chargeable.push({ itemType: "package", sourceId: eligibility.selectedPackage.id, sku: null, name: eligibility.selectedPackage.package_name.replaceAll("Leaf Blower", "Blower"), description: eligibility.selectedPackage.description, quantity: 1, unitAmountCents: amount, extendedAmountCents: amount, includedInPackagePrice: false, parentSourceId: null });
    for (const item of eligibility.packageItems ?? []) { const option = catalog.options.find((row) => row.id === item.option_id)!; sources.push({ table: "catalog_package_items", id: item.id }, { table: "catalog_options", id: option.id }); included.push({ itemType: "package_component", sourceId: option.id, sku: null, name: checkoutDisplayName(option), description: option.description, quantity: item.quantity, unitAmountCents: 0, extendedAmountCents: 0, includedInPackagePrice: true, parentSourceId: eligibility.selectedPackage.id }); }
  } else {
    if (input.selection.includeBaseProduct) { const amount = effectivePrice(product, "product"); chargeable.push({ itemType: "product", sourceId: product.id, sku: null, name: product.name, description: product.description ?? null, quantity: 1, unitAmountCents: amount, extendedAmountCents: amount, includedInPackagePrice: false, parentSourceId: null }); }
    for (const selected of eligibility.selectedOptions) { const amount = effectivePrice(selected.option, "option"); sources.push({ table: "catalog_options", id: selected.option.id }); chargeable.push({ itemType: "option", sourceId: selected.option.id, sku: null, name: checkoutDisplayName(selected.option), description: selected.option.description, quantity: selected.quantity, unitAmountCents: amount, extendedAmountCents: amount * selected.quantity, includedInPackagePrice: false, parentSourceId: null }); }
  }
  const subtotal = chargeable.reduce((sum, item) => sum + item.extendedAmountCents, 0);
  return Object.freeze({ currency: "usd", product: { id: product.id, slug: product.slug, name: product.name }, variant: eligibility.variant ? { id: eligibility.variant.id, slug: eligibility.variant.variant_slug, name: eligibility.variant.name, sku: eligibility.variant.sku } : null, purchaseMode: input.selection.purchaseMode, chargeableItems: Object.freeze(chargeable), includedPackageComponents: Object.freeze(included), subtotalCents: subtotal, discountCents: 0, feeCents: 0, shippingCents: 0, taxCents: 0, totalCents: subtotal, paymentMethod: input.paymentMethod, pricedAt: new Date(now).toISOString(), catalogSources: Object.freeze(sources), warnings: Object.freeze(eligibility.moduleOnlyWarning ? [eligibility.moduleOnlyWarning] : []), safeMetadata: { phase: "4B1" as const, adjustments: "not_implemented" as const } });
}
