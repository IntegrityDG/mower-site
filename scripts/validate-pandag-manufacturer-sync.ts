import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PANDAG_ALLOWED_REVIEW_FIELDS,
  PANDAG_PARENT_ID,
  PANDAG_PROTECTED_FIELDS,
  PANDAG_PROTECTED_SPECIFICATION_FIELDS,
  PANDAG_VARIANT_IDS,
  validatePandagCandidate,
  validatePandagSourceTarget,
  type PandagScope,
} from "../lib/manufacturer-sync/pandag-policy";
import type { ExtractedValue, SourceTarget } from "../lib/manufacturer-sync/types";

const SOURCE_URL = "https://www.pandag.com/product/pandag-g1-mower";
const targetIds = [
  "6a4f0e76-6b9d-4fbb-9a72-8b6154da3c11",
  "0de5fd6d-a7c6-4d6e-91d1-62c715b5a2b2",
  "58e09b88-b28e-4f73-a8ba-f684e512c3c3",
  "cb8745aa-931e-47d5-86fa-3da8f4d7d4d4",
];
const contaminatedSuggestionIds = [
  "13277f9f-f493-48e2-b046-3e2d59b5fabf",
  "fe293c6e-1362-4b7d-9b51-18ed65da1975",
  "d5dc8287-aaf2-4719-9af0-aa75a685cecb",
  "92bff41e-e5e2-4cfc-b431-d6d73c830e92",
  "bcbe58da-0279-491b-ad73-cf764e22657c",
  "3c332529-dbd9-46af-98fa-c3e99b70c532",
  "369033b8-fe13-4223-8ab0-d53c7bd79e12",
  "5b21da8c-d247-45f1-aee2-ea258e4e31e6",
  "de524ecf-89a2-4c4c-b11e-5fc4665fdda1",
];

function source(scope: PandagScope): SourceTarget {
  const variantId = scope === "platform" ? null : PANDAG_VARIANT_IDS[scope];
  return {
    id: targetIds[scope === "platform" ? 0 : scope === "m1500_sd" ? 1 : scope === "m1500_rd" ? 2 : 3],
    target_type: scope === "platform" ? "product" : "variant",
    product_id: scope === "platform" ? PANDAG_PARENT_ID : null,
    variant_id: variantId,
    option_id: null,
    package_id: null,
    service_id: null,
    product_service_id: null,
    source_brand: "Pandag",
    source_name: `Pandag ${scope} review`,
    source_url: SOURCE_URL,
    source_kind: "manufacturer_specs_page",
    fields_to_monitor: { model_scope: scope, review_only: true },
    allow_automated_fetch: false,
    allow_image_download: false,
    manual_only: true,
  };
}

function candidate(field: ExtractedValue["field"], value: string): ExtractedValue {
  return { field, value, confidence: 60, notes: "Synthetic validation candidate." };
}

for (const scope of ["platform", "m1500_sd", "m1500_rd", "pro_m3000"] as const) {
  assert.equal(validatePandagSourceTarget(source(scope)), scope);
}
assert.equal(PANDAG_PROTECTED_SPECIFICATION_FIELDS.length, 17);
for (const field of PANDAG_PROTECTED_SPECIFICATION_FIELDS) assert(PANDAG_PROTECTED_FIELDS.has(field));
for (const field of ["regular_price_cents", "sale_price_cents", "show_public_price", "contact_for_pricing", "dealer_cost_cents", "internal_price_cents", "margin"]) {
  assert(PANDAG_PROTECTED_FIELDS.has(field));
  assert(!PANDAG_ALLOWED_REVIEW_FIELDS.has(field));
}

assert(validatePandagCandidate(source("m1500_sd"), candidate("short_description", "Pandag G1 M1500 SD commercial availability update.")).accepted);
assert(!validatePandagCandidate(source("m1500_sd"), candidate("short_description", "Pandag G1 M1500 RD commercial availability update.")).accepted);
assert(!validatePandagCandidate(source("m1500_rd"), candidate("short_description", "Pandag G1 M1500 SD commercial availability update.")).accepted);
assert(!validatePandagCandidate(source("pro_m3000"), candidate("short_description", "Pandag G1 M1500 RD commercial availability update.")).accepted);
assert(!validatePandagCandidate(source("m1500_sd"), candidate("short_description", "M1500 SD and M1500 RD model comparison.")).accepted);
assert(!validatePandagCandidate(source("m1500_sd"), candidate("short_description", "M1500 SD/RD model comparison.")).accepted);
assert(!validatePandagCandidate(source("m1500_sd"), candidate("short_description", String.raw`\\\"children\\\":404,\\\"lineHeight\\\":\\\"49px\\\" M1500 SD`)).accepted);
assert(!validatePandagCandidate(source("platform"), candidate("short_description", "Home Products Explore Blog Get in Touch Pandag platform.")).accepted);
assert(!validatePandagCandidate(source("platform"), candidate("short_description", "Pandag G1 PRO M3000 availability update.")).accepted);
assert(!validatePandagCandidate(source("platform"), candidate("short_description", "Yarbo navigation comparison for Pandag.")).accepted);
assert(!validatePandagCandidate(source("platform"), candidate("weight", "330 kg")).accepted);

const migration = readFileSync(resolve("supabase/migrations/20260726030630_harden_pandag_manufacturer_sync.sql"), "utf8");
const executableSeed = readFileSync(resolve("scripts/seed-manufacturer-sources.ts"), "utf8");
const sqlSeed = readFileSync(resolve("supabase/seeds/manufacturer-source-targets.sql"), "utf8");
const syncScript = readFileSync(resolve("scripts/sync-manufacturer-catalog.ts"), "utf8");

for (const id of targetIds) {
  assert(executableSeed.includes(id));
  assert(sqlSeed.includes(id));
  assert(migration.includes(id));
}
for (const id of contaminatedSuggestionIds) assert(migration.includes(id));
assert(!executableSeed.includes("Pandag G1 M1500 SD/RD and G1 PRO M3000 specifications"));
assert(!sqlSeed.includes("Pandag G1 M1500 SD/RD and G1 PRO M3000 specifications"));
assert(syncScript.includes('review_status: "pending"'));
assert(!/supabase\.from\([^)]*\)\.update\([^)]*suggest/i.test(syncScript));
assert(!syncScript.includes("quote_requests"));

console.log("Pandag manufacturer-sync validation assertions passed.");
