import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260812040138_correct_ids_everyday_catalog_pricing.sql",
  "utf8",
);

test("one-time IDS correction uses the three exact owner-authorized formulas", () => {
  assert.match(migration, /catalog_product_variants[\s\S]*regular_price_cents = display_msrp_price_cents - 15000/);
  assert.match(migration, /catalog_packages[\s\S]*regular_price_cents = display_msrp_price_cents - 20000/);
  assert.match(migration, /catalog_options[\s\S]*regular_price_cents = display_msrp_price_cents - 10000/);
});

test("Lymow and Yarbo module targets are exact guarded whitelists", () => {
  for (const slug of ["lymow-one-plus-5a", "lymow-one-plus-10a", "yarbo-mower-module", "yarbo-lawn-mower-pro-module", "yarbo-leaf-blower-module", "yarbo-snow-blower-module", "yarbo-trimmer-module"]) {
    assert.match(migration, new RegExp(`'${slug}'`));
  }
  assert.doesNotMatch(migration, /like\s+'%module%'/i);
  assert.match(migration, /display_msrp_price_cents is not null/);
  assert.match(migration, /brand = 'Yarbo'/);
});

test("migration updates only regular prices on the three approved public tables", () => {
  const updates = [...migration.matchAll(/update\s+([\w.]+)\s+set\s+([\w_]+)/gi)].map((match) => [match[1], match[2]]);
  assert.deepEqual(updates, [
    ["public.catalog_product_variants", "regular_price_cents"],
    ["public.catalog_packages", "regular_price_cents"],
    ["public.catalog_options", "regular_price_cents"],
  ]);
  assert.doesNotMatch(migration, /catalog_private|catalog_price_schedules|sale_price_cents|display_msrp_price_cents\s*=/i);
  assert.doesNotMatch(migration, /Pandag/i);
});
