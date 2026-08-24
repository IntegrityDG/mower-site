import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = "supabase/migrations/20260823225906_remove_discontinued_yarbo_standard_mower_catalog.sql";
const migration = readFileSync(migrationPath, "utf8");

test("Standard Mower packages are deleted by exact option relationship, not by name", () => {
  assert.match(migration, /delete from public\.catalog_packages package/);
  assert.match(migration, /from public\.catalog_package_items package_item/);
  assert.match(migration, /package_item\.package_id = package\.id/);
  assert.match(migration, /standard_mower\.option_slug = 'yarbo-mower-module'/);
  assert.doesNotMatch(migration, /\b(?:like|ilike|similar to)\b/i);
  assert.doesNotMatch(migration, /package(?:_name)?\s*=/i);
});

test("only the exact discontinued module and Standard-only accessories are deleted", () => {
  assert.match(migration, /option\.option_slug = 'yarbo-mower-module'/);
  assert.match(migration, /'yarbo-cutting-blades-bolts-40pc'/);
  assert.match(migration, /'yarbo-cutting-disc-bolts'/);

  const executableSql = migration.replace(/^\s*--.*$/gm, "");
  assert.doesNotMatch(executableSql, /yarbo-lawn-mower-pro-module/);
  assert.doesNotMatch(executableSql, /yarbo-pro-cutting-discs-bolts-2pc/);
  assert.doesNotMatch(executableSql, /yarbo-lawn-mower-pro-cover/);
});

test("migration documents Mower Pro protection and preserves historical data", () => {
  assert.match(migration, /Mower Pro \(yarbo-lawn-mower-pro-module\)[\s\S]*must remain untouched/);
  assert.match(migration, /yarbo-pro-cutting-discs-bolts-2pc/);
  assert.match(migration, /yarbo-lawn-mower-pro-cover/);
  assert.match(migration, /ON DELETE SET NULL/i);
  assert.doesNotMatch(migration, /delete from\s+(?:checkout_private\.)?(?:orders|order_items|payment_attempts)/i);

  const checkoutFoundation = readFileSync("supabase/migrations/20260727034240_create_private_checkout_foundation.sql", "utf8");
  assert.match(checkoutFoundation, /option_id uuid references public\.catalog_options\(id\) on delete set null/);
  assert.match(checkoutFoundation, /package_id uuid references public\.catalog_packages\(id\) on delete set null/);
  assert.match(checkoutFoundation, /name_snapshot text not null/);
  assert.match(checkoutFoundation, /metadata_snapshot jsonb not null/);

  const pricingFoundation = readFileSync("supabase/migrations/20260818023107_add_pricing_promotion_content_and_sale_imports.sql", "utf8");
  assert.match(pricingFoundation, /option_id uuid references public\.catalog_options\(id\) on delete set null/);
  assert.match(pricingFoundation, /package_id uuid references public\.catalog_packages\(id\) on delete set null/);
});
