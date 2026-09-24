import "server-only";

import { getSupabaseServiceClient } from "@/lib/supabase";
import { sellingPriceDecision } from "@/lib/pricing-program/policy";
import { readPricingProgramSettingsFailSafe } from "@/lib/pricing-program/server";
import type { PackageCorePriceAdminRow } from "./package-core-prices";

type PriceRow = {
  id: string;
  product_id: string;
  package_id: string;
  core_variant_id: string;
  price_mode: "package" | "core_specific";
  regular_price_cents: number | null;
  sale_price_cents: number | null;
  sale_starts_at: string | null;
  sale_ends_at: string | null;
  promotion_label: string | null;
  show_public_price: boolean;
  contact_for_pricing: boolean;
  public_status: string;
  updated_at: string;
};

const fields = "id,product_id,package_id,core_variant_id,price_mode,regular_price_cents,sale_price_cents,sale_starts_at,sale_ends_at,promotion_label,show_public_price,contact_for_pricing,public_status,updated_at";

async function yarboProductId() {
  const { data, error } = await getSupabaseServiceClient().from("catalog_products").select("id").eq("slug", "yarbo").single();
  if (error || !data) throw new Error("Yarbo catalog is unavailable.");
  return data.id as string;
}

async function readRows(productId: string) {
  const client = getSupabaseServiceClient();
  const [prices, packages, variants, pricingProgram] = await Promise.all([
    client.from("catalog_package_core_prices").select(fields).eq("product_id", productId),
    client.from("catalog_packages").select("id,package_name,display_msrp_price_cents,regular_price_cents,sale_price_cents,sale_starts_at,sale_ends_at,promotion_label,show_public_price,contact_for_pricing,public_status,updated_at").eq("product_id", productId),
    client.from("catalog_product_variants").select("id,name,public_status").eq("product_id", productId),
    readPricingProgramSettingsFailSafe(),
  ]);
  if (prices.error || packages.error || variants.error) throw new Error("Package/Core pricing is unavailable.");
  const packageById = new Map((packages.data ?? []).map((row) => [row.id, row]));
  const variantById = new Map((variants.data ?? []).map((row) => [row.id, row]));
  const now = Date.now();
  return ((prices.data ?? []) as PriceRow[]).map((row): PackageCorePriceAdminRow => {
    const packageRow = packageById.get(row.package_id);
    const priceRow = row.price_mode === "package" && packageRow ? packageRow : row;
    const decision = sellingPriceDecision(priceRow, pricingProgram.everydayLowPriceEnabled, now);
    const sourceShowsPrice = priceRow.public_status !== "hidden" && priceRow.show_public_price && !priceRow.contact_for_pricing;
    const pairShowsPrice = row.public_status !== "hidden" && row.show_public_price && !row.contact_for_pricing;
    const checkoutPriceCents = row.public_status === "active" && priceRow.public_status === "active" && sourceShowsPrice && pairShowsPrice
      ? decision.priceCents
      : null;
    return {
    id: row.id,
    packageId: row.package_id,
    packageName: packageRow?.package_name ?? row.package_id,
    coreVariantId: row.core_variant_id,
    coreName: variantById.get(row.core_variant_id)?.name ?? row.core_variant_id,
    coreStatus: variantById.get(row.core_variant_id)?.public_status ?? "hidden",
    priceMode: row.price_mode,
    regularPriceCents: priceRow.regular_price_cents,
    salePriceCents: priceRow.sale_price_cents,
    saleStartsAt: priceRow.sale_starts_at,
    saleEndsAt: priceRow.sale_ends_at,
    promotionLabel: priceRow.promotion_label,
    showPublicPrice: sourceShowsPrice && pairShowsPrice,
    contactForPricing: Boolean(priceRow.contact_for_pricing || row.contact_for_pricing),
    publicStatus: row.public_status,
    effectivePriceCents: sourceShowsPrice && pairShowsPrice ? decision.priceCents : null,
    checkoutPriceCents,
    saleState: decision.saleState,
    sourceLabel: row.price_mode === "package" ? "Y40 Package" : "Y40P Package/Core Override",
    explanation: row.price_mode === "package"
      ? "Y40 uses the package record. Editing the Y40P override does not change this amount."
      : "Y40P uses this package/Core-specific record. Editing the base package changes Y40 only.",
    updatedAt: row.price_mode === "package" ? packageRow?.updated_at ?? row.updated_at : row.updated_at,
    pricingProgramEnabled: pricingProgram.everydayLowPriceEnabled,
    };
  }).sort((a, b) => a.packageName.localeCompare(b.packageName) || a.coreName.localeCompare(b.coreName));
}

export async function readPackageCorePrices() {
  return readRows(await yarboProductId());
}

export async function readPackageCorePriceValues(id: string) {
  const productId = await yarboProductId();
  const { data, error } = await getSupabaseServiceClient().from("catalog_package_core_prices")
    .select(fields).eq("id", id).eq("product_id", productId).eq("price_mode", "core_specific").maybeSingle();
  if (error) throw new Error("Package/Core pricing is unavailable.");
  return data as Record<string, unknown> | null;
}

export async function updatePackageCorePrice(id: string, patch: Record<string, unknown>, expectedUpdatedAt: string) {
  const productId = await yarboProductId();
  const { data, error } = await getSupabaseServiceClient().from("catalog_package_core_prices")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id).eq("product_id", productId).eq("price_mode", "core_specific").eq("updated_at", expectedUpdatedAt)
    .select("id").maybeSingle();
  if (error) throw new Error("Package/Core pricing update failed.");
  if (!data) throw new Error("Pricing record changed after you opened it. Reload and review the newer values before saving.");
  const row = (await readRows(productId)).find((item) => item.id === id);
  if (!row) throw new Error("Package/Core pricing update failed.");
  return row;
}
