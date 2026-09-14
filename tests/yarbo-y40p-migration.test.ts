import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260913213106_add_yarbo_core_package_pricing.sql", "utf8");

test("Y40P migration adds one constrained package/Core relationship without altering Y40 package prices", () => {
  assert.match(migration, /create table public\.catalog_package_core_prices/);
  assert.match(migration, /unique \(package_id, core_variant_id\)/);
  assert.match(migration, /foreign key \(package_id, product_id\)[\s\S]*?references public\.catalog_packages \(id, product_id\)/);
  assert.match(migration, /foreign key \(core_variant_id, product_id\)[\s\S]*?references public\.catalog_product_variants \(id, product_id\)/);
  assert.match(migration, /price_mode = 'package' and regular_price_cents is null/);
  assert.match(migration, /pkg\.regular_price_cents is distinct from seed\.approved_y40_cents/);
  assert.doesNotMatch(migration, /update public\.catalog_packages|insert into public\.catalog_packages/i);
  assert.equal((migration.match(/\('yarbo-(?:snow-blower|lawn-mower-pro|leaf-blower|snow-leaf|pro-snow|pro-leaf|pro-snow-leaf)',/g) ?? []).length, 7);
  assert.match(migration, /'yarbo-y40p'[\s\S]*?'coming_soon', 559900, 499900/);
  assert.match(migration, /'yarbo-y40'[\s\S]*?'active', null, null/);
});

test("Y40P migration exposes only public selling fields to browsers and leaves writes to the service role", () => {
  assert.match(migration, /alter table public\.catalog_package_core_prices enable row level security/);
  assert.match(migration, /revoke all on public\.catalog_package_core_prices from public, anon, authenticated/);
  assert.match(migration, /grant select \([\s\S]*?\) on public\.catalog_package_core_prices to anon, authenticated/);
  assert.match(migration, /grant all on public\.catalog_package_core_prices to service_role/);
  assert.match(migration, /create policy "Public reads visible package Core prices"[\s\S]*?for select[\s\S]*?to anon, authenticated/);
  assert.match(migration, /public_status <> 'hidden'[\s\S]*?and show_public_price[\s\S]*?and not contact_for_pricing/);
  assert.doesNotMatch(migration, /grant (?:insert|update|delete|all) on public\.catalog_package_core_prices to (?:anon|authenticated)/i);
  assert.doesNotMatch(migration, /dealer_cost|dealer_margin|private_note|internal_note/i);
  assert.match(migration, /variant\.public_status in \('active', 'coming_soon'\)/);
  assert.match(migration, /is_public[\s\S]*?definition\.public_status = 'active'/);
});
