import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

type TargetType = "product" | "variant" | "option" | "package";
type Definition = {
  targetType: TargetType; targetSlug: string; brand: "Lymow" | "Yarbo" | "Pandag";
  name: string; url: string; kind: "manufacturer_product_page" | "manufacturer_specs_page" | "other";
  fields: string[]; category: string; notes: string;
};

const productFields = ["short_description", "cutting_width", "cutting_height", "battery", "runtime", "charging_time", "maximum_area", "slope_capability", "navigation_system", "obstacle_detection", "drive_system", "official_image_url", "official_document_url"];
const yarboModuleFields = ["cutting_width", "cutting_height", "runtime", "charging_time", "maximum_area", "slope_capability", "navigation_system", "obstacle_detection", "drive_system", "dimensions", "weight", "official_image_url", "official_document_url"];
const reviewed = "Reviewed 2026-07-15 on an official manufacturer-controlled public page.";

const definitions: Definition[] = [
  { targetType: "product", targetSlug: "lymow-one-plus", brand: "Lymow", name: "Lymow One Plus product page", url: "https://www.lymow.com/products/lymow-one-plus-robotic-lawn-mower", kind: "manufacturer_product_page", fields: productFields, category: "product_page", notes: `${reviewed} Contains product-specific specifications.` },
  { targetType: "product", targetSlug: "lymow-one-plus", brand: "Lymow", name: "Lymow One Plus accessories collection", url: "https://www.lymow.com/collections/accessories", kind: "other", fields: [], category: "accessories", notes: `${reviewed} Retained for accessory availability/reference only.` },
  { targetType: "product", targetSlug: "lymow-one-plus", brand: "Lymow", name: "Lymow warranty policy", url: "https://www.lymow.com/pages/warranty-policy", kind: "other", fields: ["warranty"], category: "warranty", notes: `${reviewed} Applies specifically to Lymow One Plus and Lymow One.` },
  { targetType: "variant", targetSlug: "lymow-one-plus-5a", brand: "Lymow", name: "Lymow One Plus 5A configuration", url: "https://www.lymow.com/products/lymow-one-plus-robotic-lawn-mower", kind: "manufacturer_specs_page", fields: ["charging_time", "recommended_area", "maximum_area"], category: "specifications", notes: `${reviewed} The page identifies the 5A configuration.` },
  { targetType: "variant", targetSlug: "lymow-one-plus-10a", brand: "Lymow", name: "Lymow One Plus 10A configuration", url: "https://www.lymow.com/products/lymow-one-plus-robotic-lawn-mower", kind: "manufacturer_specs_page", fields: ["charging_time", "recommended_area", "maximum_area"], category: "specifications", notes: `${reviewed} The page identifies the 10A configuration.` },
  ...[
    ["lymow-10a-charging-station-adapter", "10A Charging Station Adapter", "https://www.lymow.com/products/10a-adapter-with-extension-cable-for-lymow-one-plus-charging-station", ["official_image_url"]],
    ["lymow-5a-charging-station-adapter", "5A Charging Station Adapter", "https://www.lymow.com/products/5a-adapter-with-extension-cable-for-lymow-one-plus-charging-station", ["official_image_url"]],
    ["lymow-battery-528wh", "Lymow One Plus 528Wh LiFePO4 Battery", "https://www.lymow.com/products/528wh-lifepo4-battery-for-lymow-one-plus", ["battery", "official_image_url"]],
    ["lymow-battery-direct-charging-cable", "Lymow One Plus Battery Direct Charging Cable", "https://www.lymow.com/products/battery-direct-charging-cable-for-lymow-one-plus-528wh-battery", ["official_image_url"]],
    ["lymow-rtk-reference-station", "Lymow RTK Reference Station", "https://www.lymow.com/products/rtk-set", ["navigation_system", "official_image_url"]],
    ["lymow-rtk-power-adapter", "Lymow RTK Power Adapter", "https://www.lymow.com/products/rtk-power-supply", ["official_image_url"]],
    ["lymow-rtk-extension-cable", "Lymow RTK Station Extension Cable", "https://www.lymow.com/products/rtk-station-extension-cable", ["official_image_url"]],
    ["lymow-tracks-pair", "Lymow One Plus Replacement Track", "https://www.lymow.com/products/replacement-track-for-lymow-one-plus", ["official_image_url"]],
  ].map(([targetSlug, name, sourceUrl, fields]) => ({ targetType: "option" as const, targetSlug: targetSlug as string, brand: "Lymow" as const, name: name as string, url: sourceUrl as string, kind: "manufacturer_product_page" as const, fields: fields as string[], category: "accessories", notes: `Exact option match. ${reviewed}` })),
  { targetType: "product", targetSlug: "yarbo", brand: "Yarbo", name: "Yarbo Core", url: "https://www.yarbo.com/products/yarbo-core", kind: "manufacturer_product_page", fields: ["short_description", "battery", "runtime", "charging_time", "navigation_system", "obstacle_detection", "drive_system", "dimensions", "weight", "warranty", "official_image_url", "official_document_url"], category: "product_page", notes: reviewed },
  { targetType: "package", targetSlug: "yarbo-lawn-mower-pro", brand: "Yarbo", name: "Yarbo Lawn Mower Pro", url: "https://www.yarbo.com/products/yarbo-lawn-mower-pro", kind: "manufacturer_product_page", fields: yarboModuleFields, category: "product_page", notes: `Exact full-system package match. ${reviewed}` },
  { targetType: "package", targetSlug: "yarbo-snow-blower", brand: "Yarbo", name: "Yarbo Snow Blower", url: "https://www.yarbo.com/products/yarbo-snow-blower", kind: "manufacturer_product_page", fields: ["short_description", "battery", "runtime", "charging_time", "slope_capability", "navigation_system", "obstacle_detection", "drive_system", "dimensions", "weight", "warranty", "official_image_url", "official_document_url"], category: "product_page", notes: `Exact full-system package match. ${reviewed}` },
  ...[
    ["yarbo-mower-module", "Yarbo Lawn Mower Module", "https://www.yarbo.com/products/lawn-mower-module", yarboModuleFields],
    ["yarbo-lawn-mower-pro-module", "Yarbo Lawn Mower Pro Module", "https://www.yarbo.com/products/yarbo-lawn-mower-pro-module", yarboModuleFields],
    ["yarbo-snow-blower-module", "Yarbo Snow Blower Module", "https://www.yarbo.com/products/snow-blower-module", yarboModuleFields.filter((field) => !field.startsWith("cutting_"))],
    ["yarbo-leaf-blower-module", "Yarbo Blower Module", "https://www.yarbo.com/products/blower-module", yarboModuleFields.filter((field) => !field.startsWith("cutting_"))],
    ["yarbo-trimmer-module", "Yarbo Trimmer Module", "https://www.yarbo.com/products/trimmer-back-brace-mount", yarboModuleFields.filter((field) => !field.startsWith("cutting_"))],
    ["yarbo-plow-module", "Yarbo Snow Plow Blade", "https://www.yarbo.com/products/plow-blade", ["dimensions", "weight", "official_image_url"]],
    ["yarbo-tow-hitch", "Yarbo Tow Hitch", "https://www.yarbo.com/products/tow-hitch", ["dimensions", "weight", "official_image_url"]],
  ].map(([targetSlug, name, sourceUrl, fields]) => ({ targetType: "option" as const, targetSlug: targetSlug as string, brand: "Yarbo" as const, name: name as string, url: sourceUrl as string, kind: "manufacturer_product_page" as const, fields: fields as string[], category: targetSlug === "yarbo-plow-module" || targetSlug === "yarbo-tow-hitch" ? "accessories" : "product_page", notes: `Exact catalog option match. ${reviewed}` })),
  { targetType: "product", targetSlug: "pandag-g1", brand: "Pandag", name: "Pandag G1 M1500 SD/RD and G1 PRO M3000 specifications", url: "https://www.pandag.com/product/pandag-g1-mower", kind: "manufacturer_specs_page", fields: productFields.filter((field) => field !== "short_description"), category: "specifications", notes: `${reviewed} Covers all three model tabs. Public pricing monitoring is prohibited.` },
];

loadEnvConfig(process.cwd());
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing server-side Supabase environment variables.");
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const privateClient = client.schema("catalog_private");

async function main() {
  if (process.argv.includes("--dry-run")) {
    console.log("\nManufacturer source seed dry run");
    console.table({
      "Definitions reviewed": definitions.length,
      Lymow: definitions.filter((source) => source.brand === "Lymow").length,
      Yarbo: definitions.filter((source) => source.brand === "Yarbo").length,
      Pandag: definitions.filter((source) => source.brand === "Pandag").length,
    });
    console.log("No database records were modified.");
    return;
  }
  const tableConfig: Record<TargetType, { table: string; slug: string; idColumn: string }> = {
    product: { table: "catalog_products", slug: "slug", idColumn: "product_id" }, variant: { table: "catalog_product_variants", slug: "variant_slug", idColumn: "variant_id" },
    option: { table: "catalog_options", slug: "option_slug", idColumn: "option_id" }, package: { table: "catalog_packages", slug: "package_slug", idColumn: "package_id" },
  };
  const lookups = new Map<string, string>();
  for (const [type, config] of Object.entries(tableConfig) as [TargetType, typeof tableConfig[TargetType]][]) {
    const result = await client.from(config.table).select(`id,${config.slug}`);
    if (result.error) throw new Error(`${config.table}: ${result.error.message}`);
    for (const row of result.data as unknown as Record<string, unknown>[]) {
      lookups.set(`${type}:${String(row[config.slug])}`, String(row.id));
    }
  }
  const existingResult = await privateClient.from("catalog_source_targets").select("target_type,product_id,variant_id,option_id,package_id,source_url");
  if (existingResult.error) throw new Error(`Read existing sources: ${existingResult.error.message}`);
  const existing = new Set((existingResult.data ?? []).map((row) => {
    const config = tableConfig[row.target_type as TargetType]; const id = config ? row[config.idColumn as keyof typeof row] : null;
    return `${row.target_type}:${String(id)}:${String(row.source_url).replace(/\/$/, "").toLowerCase()}`;
  }));
  const rows: Record<string, unknown>[] = []; const unmatched: string[] = [];
  for (const source of definitions) {
    const config = tableConfig[source.targetType]; const targetId = lookups.get(`${source.targetType}:${source.targetSlug}`);
    if (!targetId) { unmatched.push(`${source.targetType}:${source.targetSlug}`); continue; }
    const identity = `${source.targetType}:${targetId}:${source.url.replace(/\/$/, "").toLowerCase()}`;
    if (existing.has(identity)) continue;
    rows.push({ target_type: source.targetType, [config.idColumn]: targetId, source_brand: source.brand, source_name: source.name, source_url: source.url, source_kind: source.kind, fields_to_monitor: { fields: source.fields, source_category: source.category }, public_pricing_monitoring_allowed: false, source_notes: source.notes, pricing_monitoring_notes: source.brand === "Pandag" ? "Pandag pricing is manual/private only." : "Public pricing is not monitored by this source seed.", check_frequency: "monthly", manual_only: false, is_active: true, allow_automated_fetch: true, allow_image_download: false, updated_at: new Date().toISOString() });
  }
  if (rows.length) { const insert = await privateClient.from("catalog_source_targets").insert(rows); if (insert.error) throw new Error(`Insert sources: ${insert.error.message}`); }
  console.log("\nManufacturer source seed complete");
  console.table({ "Definitions reviewed": definitions.length, "Sources added": rows.length, "Already present": definitions.length - rows.length - unmatched.length, "Unmatched definitions": unmatched.length });
  for (const brand of ["Lymow", "Yarbo", "Pandag"] as const) console.log(`${brand}: ${rows.filter((row) => row.source_brand === brand).length} added`);
  if (unmatched.length) console.log(`Unmatched: ${unmatched.join(", ")}`);
  console.log("No public catalog records were modified.");
}

main().catch((error) => { console.error("Manufacturer source seed failed:", error instanceof Error ? error.message : error); process.exitCode = 1; });
