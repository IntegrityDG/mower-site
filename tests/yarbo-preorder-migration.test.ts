import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const sql = readFileSync("supabase/migrations/20260915150725_enable_y40p_early_access_preorder.sql", "utf8");
const executable = sql.replace(/--[^\n]*/g, "");

test("preorder migration is transactional, additive, default OFF, and seeds exactly the existing Y40P identity", () => {
  assert.match(executable, /^\s*BEGIN;/);
  assert.match(executable, /COMMIT;\s*$/);
  assert.match(executable, /ADD COLUMN preorder_enabled boolean NOT NULL DEFAULT false/);
  assert.match(executable, /Expected exactly one Coming Soon Y40P/);
  assert.equal((executable.match(/UPDATE public\./g) ?? []).length, 1);
  assert.match(executable, /SET preorder_enabled = true\s+FROM public\.catalog_products p\s+WHERE p\.id = v\.product_id AND p\.slug = 'yarbo' AND v\.variant_slug = 'yarbo-y40p';/);
  assert.doesNotMatch(executable, /SET\s+(public_status|regular_price_cents|sale_price_cents|sale_starts_at|sale_ends_at)\s*=/);
  assert.doesNotMatch(executable, /INSERT INTO|DELETE FROM|DROP TABLE|catalog_package_core_prices|catalog_options|catalog_package_items/);
});

test("migration preserves SELECT RLS, revokes browser writes, and grants only public safe columns", () => {
  assert.match(executable, /REVOKE ALL ON public\.catalog_product_variants FROM PUBLIC, anon, authenticated/);
  assert.match(executable, /GRANT SELECT \([\s\S]*preorder_enabled\s*\) ON public\.catalog_product_variants TO anon, authenticated/);
  assert.doesNotMatch(executable, /GRANT (INSERT|UPDATE|DELETE|ALL|TRUNCATE)/);
  assert.doesNotMatch(executable, /DISABLE ROW LEVEL SECURITY|CREATE POLICY|DROP POLICY|SECURITY DEFINER/);
  assert.doesNotMatch(executable, /dealer_cost|margin|private_notes|admin_metadata|service_role/);
});
