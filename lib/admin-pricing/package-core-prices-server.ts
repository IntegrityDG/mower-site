import "server-only";

import { getSupabaseServiceClient } from "@/lib/supabase";
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
};

const fields = "id,product_id,package_id,core_variant_id,price_mode,regular_price_cents,sale_price_cents,sale_starts_at,sale_ends_at,promotion_label,show_public_price,contact_for_pricing,public_status";

async function yarboProductId() {
  const { data, error } = await getSupabaseServiceClient().from("catalog_products").select("id").eq("slug", "yarbo").single();
  if (error || !data) throw new Error("Yarbo catalog is unavailable.");
  return data.id as string;
}

async function readRows(productId: string) {
  const client = getSupabaseServiceClient();
  const [prices, packages, variants] = await Promise.all([
    client.from("catalog_package_core_prices").select(fields).eq("product_id", productId),
    client.from("catalog_packages").select("id,package_name").eq("product_id", productId),
    client.from("catalog_product_variants").select("id,name,public_status").eq("product_id", productId),
  ]);
  if (prices.error || packages.error || variants.error) throw new Error("Package/Core pricing is unavailable.");
  const packageById = new Map((packages.data ?? []).map((row) => [row.id, row.package_name]));
  const variantById = new Map((variants.data ?? []).map((row) => [row.id, row]));
  return ((prices.data ?? []) as PriceRow[]).map((row): PackageCorePriceAdminRow => ({
    id: row.id,
    packageId: row.package_id,
    packageName: packageById.get(row.package_id) ?? row.package_id,
    coreVariantId: row.core_variant_id,
    coreName: variantById.get(row.core_variant_id)?.name ?? row.core_variant_id,
    coreStatus: variantById.get(row.core_variant_id)?.public_status ?? "hidden",
    priceMode: row.price_mode,
    regularPriceCents: row.regular_price_cents,
    salePriceCents: row.sale_price_cents,
    saleStartsAt: row.sale_starts_at,
    saleEndsAt: row.sale_ends_at,
    promotionLabel: row.promotion_label,
    showPublicPrice: row.show_public_price,
    contactForPricing: row.contact_for_pricing,
    publicStatus: row.public_status,
  })).sort((a, b) => a.packageName.localeCompare(b.packageName) || a.coreName.localeCompare(b.coreName));
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

export async function updatePackageCorePrice(id: string, patch: Record<string, unknown>) {
  const productId = await yarboProductId();
  const { data, error } = await getSupabaseServiceClient().from("catalog_package_core_prices")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id).eq("product_id", productId).eq("price_mode", "core_specific")
    .select("id").single();
  if (error || !data) throw new Error("Package/Core pricing update failed.");
  const row = (await readRows(productId)).find((item) => item.id === id);
  if (!row) throw new Error("Package/Core pricing update failed.");
  return row;
}
