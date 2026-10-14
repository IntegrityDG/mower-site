// Run with Node, passing the installed @electric-sql/pglite/dist/index.js path.
// Uses an in-memory PostgreSQL engine; never connects to Supabase.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";

if (!process.argv[2]) throw new Error("Usage: node scripts/validate-y40-package-controls.mjs <pglite/dist/index.js>");
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const migrationDir = new URL("../supabase/migrations/", import.meta.url);
const migrationNames = readdirSync(migrationDir).filter(name => name.endsWith("_y40_package_relationship_visibility_controls.sql"));
assert.equal(migrationNames.length, 1, "Exactly one forward migration must implement these controls");
const migration = readFileSync(new URL(migrationNames[0], migrationDir), "utf8");
const previous = readFileSync(new URL("../supabase/migrations/20261005235941_pricing_catalog_management_overhaul.sql", import.meta.url), "utf8");
const writer = previous.match(/create function public\.admin_manage_catalog[\s\S]*?\$\$;[\s\S]*?grant execute on function public\.admin_manage_catalog[^;]+;/)?.[0];
assert.ok(writer, "Load the actual existing admin RPC, not a simulated writer");
const ids = { product: "11111111-1111-4111-8111-111111111111", package: "22222222-2222-4222-8222-222222222222", y40: "33333333-3333-4333-8333-333333333333", y40p: "44444444-4444-4444-8444-444444444444", relation: "55555555-5555-4555-8555-555555555555", proRelation: "66666666-6666-4666-8666-666666666666" };
const version = "2026-10-13T10:00:00Z";
let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log(`PASS ${name}`); }
async function state() {
  const result = await db.query(`select jsonb_build_object('package',(select to_jsonb(p) from public.catalog_packages p where id=$1), 'relationships',(select jsonb_agg(to_jsonb(cp) order by id) from public.catalog_package_core_prices cp), 'cost',(select dealer_cost_cents from catalog_private.catalog_internal_pricing where package_id=$1)) as state`, [ids.package]);
  return result.rows[0].state;
}
async function update(values, packageVersion = version) {
  return db.query("select public.admin_update_y40_package_pricing($1::uuid,$2::timestamptz,$3::jsonb)", [ids.package, packageVersion, JSON.stringify(values)]);
}
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema catalog_private;
    create table public.catalog_products(id uuid primary key,slug text,brand text,catalog_category text,retired_at timestamptz,public_status text);
    create table public.catalog_product_variants(id uuid primary key,product_id uuid,name text,variant_slug text,public_status text,updated_at timestamptz);
    create table public.catalog_packages(id uuid primary key,product_id uuid,package_name text,package_slug text,retired_at timestamptz,core_selectable boolean,updated_at timestamptz,
      display_msrp_price_cents integer,regular_price_cents integer,sale_price_cents integer,sale_starts_at timestamptz,sale_ends_at timestamptz,promotion_label text,show_public_price boolean,contact_for_pricing boolean,public_status text);
    create table public.catalog_package_core_prices(id uuid primary key,product_id uuid,package_id uuid,core_variant_id uuid,price_mode text,updated_at timestamptz,
      display_msrp_price_cents integer,regular_price_cents integer,sale_price_cents integer,sale_starts_at timestamptz,sale_ends_at timestamptz,promotion_label text,show_public_price boolean,contact_for_pricing boolean,public_status text,
      check(price_mode <> 'package' or (display_msrp_price_cents is null and regular_price_cents is null and sale_price_cents is null and sale_starts_at is null and sale_ends_at is null and promotion_label is null)));
    create table catalog_private.catalog_internal_pricing(id uuid primary key default gen_random_uuid(),package_id uuid,dealer_cost_cents integer,updated_at timestamptz default clock_timestamp());
    grant usage on schema public,catalog_private to service_role;
    grant all on all tables in schema public,catalog_private to service_role;
    insert into public.catalog_products values('${ids.product}','yarbo','Yarbo','machine',null,'active');
    insert into public.catalog_product_variants values('${ids.y40}','${ids.product}','Y40 Core','yarbo-y40','active','${version}'),('${ids.y40p}','${ids.product}','Y40P Core','yarbo-y40p','coming_soon','${version}');
    insert into public.catalog_packages values('${ids.package}','${ids.product}','Leaf Blower + Trimmer','yarbo-leaf-blower-trimmer',null,true,'${version}',639900,589900,639900,'2026-10-06T05:00:00Z','2026-10-13T05:00:00Z',null,true,false,'active');
    insert into public.catalog_package_core_prices values('${ids.relation}','${ids.product}','${ids.package}','${ids.y40}','package','${version}',null,null,null,null,null,null,false,false,'active'),('${ids.proRelation}','${ids.product}','${ids.package}','${ids.y40p}','core_specific','${version}',799900,749900,799900,'2026-10-06T05:00:00Z','2026-10-13T05:00:00Z',null,true,false,'active');
    insert into catalog_private.catalog_internal_pricing(package_id,dealer_cost_cents) values('${ids.package}',400000);
  `);
  await db.exec(writer);
  const before = await state();
  await check("existing RPC rejects relationship visibility parameters without changing either record", async () => {
    await assert.rejects(db.query("select public.admin_manage_catalog('yarbo-y40-package',$1::uuid,$2::timestamptz,$3::jsonb)", [ids.package,version,JSON.stringify({ core_show_public_price: true })]), /Unknown catalog property/);
    assert.deepEqual(await state(), before);
  });
  await db.exec(migration);
  await check("customer roles cannot call the new RPC", async () => {
    for (const role of ["anon","authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(update({}), error => error.code === "42501");
      await db.exec("reset role");
    }
  });
  await db.exec("set role service_role");
  await check("stale package version rejects both updates", async () => {
    await assert.rejects(update({ core_show_public_price:true,core_availability_expected_updated_at:version,regular_price_cents:123 },"2026-10-12T00:00:00Z"), error => error.code === "40001");
    assert.deepEqual(await state(),before);
  });
  await check("stale or missing relationship version rejects package pricing and cost updates", async () => {
    for (const expected of [undefined,"2026-10-12T00:00:00Z"]) {
      await assert.rejects(update({ core_show_public_price:true,core_availability_expected_updated_at:expected,regular_price_cents:123,dealer_cost_cents:456 }), error => error.code === "40001");
      assert.deepEqual(await state(),before);
    }
  });
  await check("invalid visibility values roll back without changing either authority", async () => {
    for (const value of [null,"true",1]) await assert.rejects(update({ core_show_public_price:value,core_availability_expected_updated_at:version }), /must be boolean/);
    assert.deepEqual(await state(),before);
  });
  await db.exec("reset role");
  await db.exec(`create function public.test_late_failure() returns trigger language plpgsql as $$ begin if new.show_public_price and not old.show_public_price then raise exception 'forced late relationship failure'; end if; return new; end $$; create trigger test_late_failure before update on public.catalog_package_core_prices for each row execute function public.test_late_failure();`);
  await db.exec("set role service_role");
  await check("a late relationship failure rolls back package, relationship, and dealer-cost changes", async () => {
    await assert.rejects(update({ public_status:'active',core_show_public_price:true,core_availability_expected_updated_at:version,regular_price_cents:123,dealer_cost_cents:456 }), /forced late relationship failure/);
    assert.deepEqual(await state(),before);
  });
  await db.exec("reset role; drop trigger test_late_failure on public.catalog_package_core_prices; set role service_role");
  await check("successful combined save preserves package price authority and every Y40P field", async () => {
    await update({ public_status:'active',core_show_public_price:true,core_contact_for_pricing:false,core_availability_expected_updated_at:version,regular_price_cents:589900 });
    const after = await state();
    assert.deepEqual({ ...after.package,updated_at:before.package.updated_at },before.package);
    const relationship = after.relationships.find(r=>r.id===ids.relation);
    assert.equal(relationship.show_public_price,true);
    for (const field of ["display_msrp_price_cents","regular_price_cents","sale_price_cents","sale_starts_at","sale_ends_at","promotion_label"]) assert.equal(relationship[field],null);
    assert.deepEqual(after.relationships.find(r=>r.id===ids.proRelation),before.relationships.find(r=>r.id===ids.proRelation));
    assert.equal(after.cost,before.cost);
  });
  await check("a previous relationship version cannot overwrite a successful save", async () => {
    const snapshot = await state();
    await assert.rejects(update({ core_contact_for_pricing:true,core_availability_expected_updated_at:version },snapshot.package.updated_at), error=>error.code==="40001");
    assert.deepEqual(await state(),snapshot);
  });
  await check("relationship-only contact changes preserve package flags and all amounts", async () => {
    const snapshot = await state(); const relationship = snapshot.relationships.find(r=>r.id===ids.relation);
    await update({ core_contact_for_pricing:true,core_availability_expected_updated_at:relationship.updated_at },snapshot.package.updated_at);
    const after = await state();
    assert.deepEqual({ ...after.package,updated_at:snapshot.package.updated_at },snapshot.package);
    assert.equal(after.relationships.find(r=>r.id===ids.relation).contact_for_pricing,true);
    assert.equal(after.package.contact_for_pricing,false);
  });
  console.log(`${passed} PostgreSQL migration checks passed`);
} finally { await db.close(); }
