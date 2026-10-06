import "server-only";

import { getSupabaseServiceClient } from "@/lib/supabase";
import { sellingPriceDecision } from "@/lib/pricing-program/policy";
import { readPricingProgramSettingsFailSafe } from "@/lib/pricing-program/server";
import { loadPublicCatalog } from "@/lib/catalog/load-public-catalog";
import { yarboCoreCanBeSelected, yarboCorePrice } from "@/lib/catalog/yarbo-core";
import { updateCatalogPricing } from "@/lib/catalog-management/server";
import type { PackageCorePriceAdminRow } from "./package-core-prices";

type PriceRow = {
  id: string; product_id: string; package_id: string; core_variant_id: string;
  price_mode: "package" | "core_specific";
  display_msrp_price_cents: number | null; regular_price_cents: number | null;
  sale_price_cents: number | null; sale_starts_at: string | null; sale_ends_at: string | null;
  promotion_label: string | null; show_public_price: boolean; contact_for_pricing: boolean;
  public_status: string; updated_at: string;
};

const fields = "id,product_id,package_id,core_variant_id,price_mode,display_msrp_price_cents,regular_price_cents,sale_price_cents,sale_starts_at,sale_ends_at,promotion_label,show_public_price,contact_for_pricing,public_status,updated_at";

async function yarboProductId() {
  const { data, error } = await getSupabaseServiceClient().from("catalog_products").select("id").eq("slug", "yarbo").is("retired_at", null).single();
  if (error || !data) throw new Error("Yarbo catalog is unavailable.");
  return data.id as string;
}

async function readRows(productId: string) {
  const client = getSupabaseServiceClient();
  const [prices, packages, variants, costs, pricingProgram, publicCatalog] = await Promise.all([
    client.from("catalog_package_core_prices").select(fields).eq("product_id", productId),
    client.from("catalog_packages").select("id,package_name,display_msrp_price_cents,regular_price_cents,sale_price_cents,sale_starts_at,sale_ends_at,promotion_label,show_public_price,contact_for_pricing,public_status,updated_at").eq("product_id", productId).is("retired_at", null),
    client.from("catalog_product_variants").select("id,name,public_status").eq("product_id", productId).is("retired_at", null),
    client.schema("catalog_private").from("catalog_internal_pricing").select("package_id,package_core_price_id,dealer_cost_cents").order("updated_at"),
    readPricingProgramSettingsFailSafe(),
    loadPublicCatalog("yarbo"),
  ]);
  if (prices.error || packages.error || variants.error || costs.error) throw new Error("Package pricing is unavailable.");
  const packageById = new Map((packages.data ?? []).map((row) => [row.id, row]));
  const variantById = new Map((variants.data ?? []).map((row) => [row.id, row]));
  const costByPackage = new Map((costs.data ?? []).filter((row) => row.package_id).map((row) => [row.package_id, row.dealer_cost_cents as number | null]));
  const costByCore = new Map((costs.data ?? []).filter((row) => row.package_core_price_id).map((row) => [row.package_core_price_id, row.dealer_cost_cents as number | null]));
  const product = publicCatalog.products.find((row) => row.id === productId);
  const now = Date.now();
  return ((prices.data ?? []) as PriceRow[]).filter((row) => packageById.has(row.package_id) && variantById.has(row.core_variant_id)).map((row): PackageCorePriceAdminRow => {
    const packageRow = packageById.get(row.package_id)!;
    const priceRow = row.price_mode === "package" ? packageRow : row;
    const decision = sellingPriceDecision(priceRow, pricingProgram.everydayLowPriceEnabled, now);
    const pkg = product?.packages.find((item) => item.id === row.package_id);
    const core = product?.variants.find((item) => item.id === row.core_variant_id);
    const publicPrice = product && pkg && core ? yarboCorePrice(product, core, pkg) : null;
    const sourceShowsPrice = priceRow.public_status !== "hidden" && priceRow.show_public_price && !priceRow.contact_for_pricing;
    const pairShowsPrice = row.public_status !== "hidden" && row.show_public_price && !row.contact_for_pricing;
    const showPublicPrice = Boolean(product && pkg && core && publicPrice && sourceShowsPrice && pairShowsPrice && publicPrice.showPublicPrice && !publicPrice.contactForPricing);
    const customerPrice = showPublicPrice && publicPrice ? publicPrice.currentPriceCents : null;
    const available = Boolean(product && pkg && core && yarboCoreCanBeSelected(product, core, pkg));
    const dealerCost = row.price_mode === "core_specific" ? costByCore.get(row.id) ?? costByPackage.get(row.package_id) ?? null : costByPackage.get(row.package_id) ?? null;
    const explanation = row.price_mode === "package"
      ? "Y40 uses the package pricing source. Editing the Y40P override changes Y40P only."
      : "Y40P uses its own package pricing source. Editing the Y40 package changes Y40 only.";
    return {
      id: row.id, packageId: row.package_id, packageName: packageRow.package_name,
      coreVariantId: row.core_variant_id, coreName: variantById.get(row.core_variant_id)!.name,
      coreStatus: variantById.get(row.core_variant_id)!.public_status, priceMode: row.price_mode,
      displayMsrpPriceCents: priceRow.display_msrp_price_cents,
      regularPriceCents: priceRow.regular_price_cents, salePriceCents: priceRow.sale_price_cents,
      saleStartsAt: priceRow.sale_starts_at, saleEndsAt: priceRow.sale_ends_at,
      promotionLabel: priceRow.promotion_label, showPublicPrice,
      contactForPricing: Boolean(priceRow.contact_for_pricing || row.contact_for_pricing),
      storedShowPublicPrice: priceRow.show_public_price,
      storedContactForPricing: priceRow.contact_for_pricing,
      publicStatus: row.public_status, effectivePriceCents: customerPrice,
      checkoutPriceCents: available ? customerPrice : null,
      saleState: publicPrice?.salePhase ?? decision.saleState,
      sourceLabel: row.price_mode === "package" ? "Y40 Package" : "Y40P Package/Core Override",
      explanation, updatedAt: row.price_mode === "package" ? packageRow.updated_at : row.updated_at,
      pricingProgramEnabled: pricingProgram.everydayLowPriceEnabled,
      dealerCostCents: dealerCost,
      normalDealerCostCents: row.price_mode === "core_specific" ? costByCore.get(row.id) ?? null : costByPackage.get(row.package_id) ?? null,
      isAvailable: available,
      priceContextBlocked: !product || !pkg || !core,
      effectiveAvailabilityStatus: available ? "active" : core?.publicStatus === "coming_soon" ? "coming_soon" : "unavailable",
      availabilityExplanation: available
        ? core?.purchaseState === "preorder" ? "Available through the existing Core preorder window." : "Package, Core, relationship, and components are available."
        : "Checkout requires an available package, Core, relationship, components, and public price.",
    };
  }).sort((a, b) => a.packageName.localeCompare(b.packageName) || a.coreName.localeCompare(b.coreName));
}

export async function readPackageCorePrices() { return readRows(await yarboProductId()); }

export async function readPackageCorePriceValues(id: string) {
  const productId = await yarboProductId();
  const { data, error } = await getSupabaseServiceClient().from("catalog_package_core_prices")
    .select(fields).eq("id", id).eq("product_id", productId).eq("price_mode", "core_specific").maybeSingle();
  if (error) throw new Error("Package pricing is unavailable.");
  if (data) {
    const parent = await getSupabaseServiceClient().from("catalog_packages").select("retired_at").eq("id", data.package_id).maybeSingle();
    if (parent.error) throw new Error("Package pricing is unavailable.");
    if (!parent.data || parent.data.retired_at) return null;
  }
  return data as Record<string, unknown> | null;
}

export async function updatePackageCorePrice(id: string, patch: Record<string, unknown>, expectedUpdatedAt: string) {
  await updateCatalogPricing("package-core-prices", id, patch, expectedUpdatedAt);
  const row = (await readRows(await yarboProductId())).find((item) => item.id === id);
  if (!row) throw new Error("Package pricing update failed.");
  return row;
}
