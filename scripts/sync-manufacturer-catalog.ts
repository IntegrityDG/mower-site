import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { compareValue } from "../lib/manufacturer-sync/compare-values";
import { fetchApprovedSource } from "../lib/manufacturer-sync/fetch-source";
import { lymowAdapter } from "../lib/manufacturer-sync/adapters/lymow";
import { yarboAdapter } from "../lib/manufacturer-sync/adapters/yarbo";
import { pandagAdapter } from "../lib/manufacturer-sync/adapters/pandag";
import { isPandagSuggestionAllowed } from "../lib/manufacturer-sync/pandag-policy";
import { supportedManufacturers, type Manufacturer, type ManufacturerAdapter, type PublicTarget, type SourceTarget } from "../lib/manufacturer-sync/types";

loadEnvConfig(process.cwd());

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url) throw new Error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL).");
if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY. The sync cannot use a browser-safe key.");

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const privateCatalog = supabase.schema("catalog_private");
const adapters: Record<Manufacturer, ManufacturerAdapter> = { Lymow: lymowAdapter, Yarbo: yarboAdapter, Pandag: pandagAdapter };
const targetTables: Record<string, string> = { product: "catalog_products", variant: "catalog_product_variants", option: "catalog_options", package: "catalog_packages", service: "catalog_services", product_service: "catalog_product_services" };
const idColumns: Record<string, keyof SourceTarget> = { product: "product_id", variant: "variant_id", option: "option_id", package: "package_id", service: "service_id", product_service: "product_service_id" };

function requireNoError(label: string, error: { message: string } | null) { if (error) throw new Error(`${label}: ${error.message}`); }
function manufacturer(value: string | null): Manufacturer | null { return supportedManufacturers.find((item) => item.toLowerCase() === value?.trim().toLowerCase()) ?? null; }
function targetName(row: Record<string, unknown>) { return String(row.name ?? row.package_name ?? row.group_name ?? row.slug ?? row.id ?? "Catalog target"); }

async function loadTarget(source: SourceTarget): Promise<PublicTarget> {
  const table = targetTables[source.target_type]; const idColumn = idColumns[source.target_type];
  if (!table || !idColumn) throw new Error(`Unsupported target type: ${source.target_type}`);
  const id = source[idColumn]; if (typeof id !== "string") throw new Error("Source target is missing its linked record ID.");
  const result = await supabase.from(table).select("*").eq("id", id).single();
  requireNoError(`Read ${table}`, result.error); const values = result.data as Record<string, unknown>;
  return { id, table, name: targetName(values), values };
}

async function main() {
  console.log("\nManufacturer Catalog Sync\n");
  const run = await privateCatalog.from("catalog_sync_runs").insert({ status: "running" }).select("id").single();
  requireNoError("Create sync run", run.error); if (!run.data) throw new Error("Create sync run returned no record."); const runId = run.data.id as string;
  let productsChecked = 0, changesDetected = 0, errorsCount = 0;
  const report: { name: string; sources: number; changes: number; images: number; errors: string[]; notes: string[] }[] = [];
  try {
    const sourceResult = await privateCatalog.from("catalog_source_targets").select("*").eq("is_active", true).eq("allow_automated_fetch", true).eq("manual_only", false);
    requireNoError("Read approved sources", sourceResult.error);
    const sources = (sourceResult.data ?? []) as SourceTarget[];
    const eligible = sources.filter((source) => manufacturer(source.source_brand));
    const grouped = new Map<string, SourceTarget[]>();
    for (const source of eligible) { const key = `${source.target_type}:${String(source[idColumns[source.target_type]])}`; grouped.set(key, [...(grouped.get(key) ?? []), source]); }

    for (const group of grouped.values()) {
      let target: PublicTarget;
      try { target = await loadTarget(group[0]); } catch (error) { errorsCount++; report.push({ name: group[0].source_name ?? "Unknown target", sources: 0, changes: 0, images: 0, errors: [error instanceof Error ? error.message : String(error)], notes: [] }); continue; }
      productsChecked++; const item = { name: target.name ?? "Catalog target", sources: 0, changes: 0, images: 0, errors: [] as string[], notes: [] as string[] };
      for (const source of group) {
        const brand = manufacturer(source.source_brand); if (!brand) continue;
        try {
          const fetched = await fetchApprovedSource(source); const extraction = adapters[brand].extract(source, fetched); item.sources++; item.notes.push(...extraction.notes);
          const snapshot = await privateCatalog.from("catalog_source_snapshots").insert({ source_target_id: source.id, http_status: fetched.status, content_hash: fetched.contentHash, extracted_data: extraction, raw_excerpt: fetched.body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 1000), success: true }).select("id").single();
          requireNoError("Save source snapshot", snapshot.error); if (!snapshot.data) throw new Error("Save source snapshot returned no record.");
          for (const value of extraction.values) {
            if (brand === "Pandag" && !isPandagSuggestionAllowed(source, value)) {
              item.notes.push(`Blocked non-actionable Pandag candidate for ${value.field}.`);
              continue;
            }
            if (value.field === "official_image_url") item.images++;
            const difference = compareValue(value, target.values); if (!difference) continue;
            const duplicate = await privateCatalog.from("catalog_change_suggestions").select("id").eq("source_target_id", source.id).eq("target_record_id", target.id).eq("field_name", difference.fieldName).eq("suggested_value", difference.suggestedValue).eq("review_status", "pending").maybeSingle();
            requireNoError("Check pending suggestion", duplicate.error); if (duplicate.data) continue;
            const suggestion = await privateCatalog.from("catalog_change_suggestions").insert({ source_target_id: source.id, snapshot_id: snapshot.data.id, target_type: source.target_type, target_table: target.table, target_record_id: target.id, field_name: difference.fieldName, current_value: difference.currentValue, suggested_value: difference.suggestedValue, confidence_score: value.confidence, suggestion_reason: value.notes, review_status: "pending" });
            requireNoError("Save review suggestion", suggestion.error); item.changes++; changesDetected++;
          }
          const update = await privateCatalog.from("catalog_source_targets").update({ last_checked_at: new Date().toISOString(), last_success_at: new Date().toISOString(), last_error_message: null }).eq("id", source.id);
          requireNoError("Update source status", update.error);
        } catch (error) {
          errorsCount++; const message = error instanceof Error ? error.message : String(error); item.errors.push(`${source.source_name ?? source.source_url}: ${message}`);
          await privateCatalog.from("catalog_source_snapshots").insert({ source_target_id: source.id, success: false, error_message: message });
          await privateCatalog.from("catalog_source_targets").update({ last_checked_at: new Date().toISOString(), last_error_at: new Date().toISOString(), last_error_message: message }).eq("id", source.id);
        }
      }
      report.push(item);
    }

    if (!eligible.length) console.log("No approved automated manufacturer sources were found. Add official URLs and explicitly set allow_automated_fetch=true after review.\n");
    for (const item of report) { console.log(item.name); console.log(`* Checked ${item.sources} official source${item.sources === 1 ? "" : "s"}`); console.log(item.changes ? `* ${item.changes} possible change${item.changes === 1 ? "" : "s"}` : "* No new changes detected"); if (item.images) console.log(`* ${item.images} image candidate${item.images === 1 ? "" : "s"}`); for (const note of item.notes) console.log(`* Note: ${note}`); for (const error of item.errors) console.log(`* Error: ${error}`); console.log(`* Status: ${item.errors.length ? "needs verification" : item.changes ? "review required" : "checked"}\n`); }
    const status = errorsCount ? "completed_with_errors" : "completed";
    const summary = { dry_run: true, public_records_modified: 0, approved_sources_found: eligible.length };
    const finish = await privateCatalog.from("catalog_sync_runs").update({ completed_at: new Date().toISOString(), status, products_checked: productsChecked, changes_detected: changesDetected, errors_count: errorsCount, summary }).eq("id", runId);
    requireNoError("Complete sync run", finish.error);
    console.log("Summary\n"); console.log(`* Products checked: ${productsChecked}`); console.log(`* Change candidates: ${changesDetected}`); console.log(`* Errors: ${errorsCount}`); console.log("* No public catalog records were modified");
  } catch (error) {
    await privateCatalog.from("catalog_sync_runs").update({ completed_at: new Date().toISOString(), status: "failed", products_checked: productsChecked, changes_detected: changesDetected, errors_count: errorsCount + 1, summary: { error: error instanceof Error ? error.message : String(error) } }).eq("id", runId);
    throw error;
  }
}

main().catch((error) => { console.error("\nManufacturer catalog sync failed:", error instanceof Error ? error.message : error); console.error("No public catalog records were modified."); process.exitCode = 1; });
