import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

/** A real PostgreSQL WASM instance, isolated in memory; never connects to Supabase. */
export async function createTickerDatabaseFixture() {
  const qaRequire = createRequire(resolve(root, ".ticker-qa/package.json"));
  const { PGlite } = qaRequire("@electric-sql/pglite");
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
  const migrations = [
    "20260808030233_create_homepage_sales_specials.sql",
    "20260824005623_add_secondary_homepage_sales_special.sql",
    ...readdirSync(resolve(root, "supabase/migrations")).filter((name) => name.endsWith("_add_homepage_sales_ticker.sql")),
  ];
  assert.equal(migrations.length, 3, "Exactly one proposed ticker migration must be present.");
  for (const migration of migrations) await db.exec(readFileSync(resolve(root, "supabase/migrations", migration), "utf8"));
  return db;
}

export async function verifyTickerDatabase() {
  const { DEFAULT_TICKER_CONFIG, toPublicTickerSnapshot } = await import(new URL("../lib/promotions/ticker.ts", import.meta.url));
  const db = await createTickerDatabaseFixture();
  const sample = (id, message, fields = {}) => ({ id: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`, message, active: true, link: null, startsAt: null, endsAt: null, ...fields });
  const rpc = async (ticker, revision) => (await db.query("select public.save_homepage_sales_ticker($1::jsonb, $2::bigint) as result", [JSON.stringify(ticker), revision])).rows[0].result;
  try {
    const initial = (await db.query("select ticker, ticker_revision, ticker_updated_at, ticker_updated_by from public.homepage_sales_specials where id='homepage'")).rows[0];
    assert.deepEqual(initial.ticker, DEFAULT_TICKER_CONFIG);
    assert.equal(Number(initial.ticker_revision), 0);
    assert.equal(initial.ticker_updated_at, null);
    assert.equal(initial.ticker_updated_by, null);
    assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.homepage_sales_specials'::regclass")).rows[0].relrowsecurity, true);

    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query("select ticker from public.homepage_sales_specials"), /permission denied/i);
      await assert.rejects(rpc(DEFAULT_TICKER_CONFIG, 0), /permission denied/i);
      await db.exec("reset role");
      // Even an accidental future SELECT grant does not expose rows through RLS.
      await db.exec(`grant select on public.homepage_sales_specials to ${role}; set role ${role}`);
      assert.equal((await db.query("select * from public.homepage_sales_specials")).rows.length, 0);
      await db.exec(`reset role; revoke select on public.homepage_sales_specials from ${role}`);
    }

    await db.exec("set role service_role");
    const now = new Date("2026-10-19T18:00:00.000Z");
    const messages = [sample(1, "Visible first"), sample(2, "Hidden inactive", { active: false }), sample(3, "Private future", { startsAt: "2026-10-20T00:00:00.000Z" }), sample(4, "Hidden expired", { endsAt: "2026-10-19T18:00:00.000Z" }), sample(5, "Visible second", { startsAt: "2026-10-19T17:00:00.000Z", endsAt: "2026-10-19T19:00:00.000Z", link: "/products/yarbo" })];
    const config = { ...DEFAULT_TICKER_CONFIG, enabled: true, messages };
    const saved = await rpc(config, 0);
    assert.equal(saved.revision, 1);
    assert.deepEqual(saved.ticker, config);
    const attribution = (await db.query("select ticker_updated_by, ticker_updated_at, updated_at from public.homepage_sales_specials where id='homepage'")).rows[0];
    assert.equal(attribution.ticker_updated_by, "IDS Administrator");
    assert.ok(attribution.ticker_updated_at);
    assert.equal(new Date(attribution.updated_at).getTime(), new Date(attribution.ticker_updated_at).getTime());
    assert.equal(await rpc({ ...config, speed: 60 }, 0), null, "A stale revision cannot overwrite another Admin save.");

    const reordered = { ...config, messages: [...messages].reverse() };
    assert.deepEqual((await rpc(reordered, 1)).ticker.messages.map((item) => item.id), reordered.messages.map((item) => item.id));
    const stored = (await db.query("select ticker from public.homepage_sales_specials where id='homepage'")).rows[0].ticker;
    const publicSnapshot = toPublicTickerSnapshot(stored, now);
    assert.deepEqual(publicSnapshot.ticker.messages.map((item) => item.message), ["Visible second", "Visible first"]);
    assert.equal(publicSnapshot.nextChangeAt, "2026-10-19T19:00:00.000Z");
    assert.equal(JSON.stringify(publicSnapshot).includes("Private future"), false);
    assert.equal(JSON.stringify(publicSnapshot).includes("updated_by"), false);

    const invalid = [
      { ...config, speed: 0 }, { ...config, speed: 121 }, { ...config, speed: 20.5 },
      { ...config, backgroundColor: "red" }, { ...config, textColor: "#FFF" }, { ...config, accentColor: "url(bad)" },
      { ...config, enabled: "true" }, { ...config, pauseOnHover: "true" }, { ...config, unexpected: "private" },
      { ...config, messages: [sample(1, " ")] }, { ...config, messages: [sample(1, "x".repeat(201))] }, { ...config, messages: [sample(1, "line\nbreak")] },
      { ...config, messages: [sample(1, "bad URL", { link: "javascript:alert(1)" })] },
      { ...config, messages: [sample(1, "bad URL", { link: "//evil.test" })] },
      { ...config, messages: [sample(1, "bad URL", { link: "/\\evil.test" })] },
      { ...config, messages: [sample(1, "bad URL", { link: "https://user:pass@example.com" })] },
      { ...config, messages: [sample(1, "bad date", { startsAt: "2026-02-30T00:00:00.000Z" })] },
      { ...config, messages: [sample(1, "bad date", { startsAt: "2026-10-19T12:00:00" })] },
      { ...config, messages: [sample(1, "bad date", { startsAt: "2026-10-19T24:00:00.000Z" })] },
      { ...config, messages: [sample(1, "bad interval", { startsAt: "2026-10-19T18:00:00.000Z", endsAt: "2026-10-19T18:00:00.000Z" })] },
      { ...config, messages: [sample(1, "one"), sample(1, "duplicate identity")] },
      { ...config, messages: [sample(1, "bad identity", { id: "old-id" })] },
      { ...config, messages: Array.from({ length: 51 }, (_, index) => sample(index, "too many")) },
    ];
    for (const ticker of invalid) {
      await assert.rejects(rpc(ticker, 2), /invalid.*ticker/i);
      await assert.rejects(db.query("update public.homepage_sales_specials set ticker=$1::jsonb where id='homepage'", [JSON.stringify(ticker)]), /check constraint/i);
    }
    for (const speed of [20, 120]) assert.equal((await db.query("select public.valid_homepage_sales_ticker($1::jsonb) as valid", [JSON.stringify({ ...config, speed })])).rows[0].valid, true);
    for (const link of ["/", "/products/yarbo?source=ticker#details", "https://example.com/sale", "http://localhost:3000/sale", "https://[::1]:3000/test"]) assert.equal((await db.query("select public.valid_homepage_sales_ticker($1::jsonb) as valid", [JSON.stringify({ ...config, messages: [sample(1, "link", { link })] })])).rows[0].valid, true);
    assert.equal((await db.query("select public.valid_homepage_sales_ticker($1::jsonb) as valid", [JSON.stringify({ ...config, messages: [sample(1, "🌱".repeat(200))] })])).rows[0].valid, true);
    const secondary = (await db.query("select ticker, enabled, headline from public.homepage_sales_specials where id='homepage-secondary'")).rows[0];
    assert.deepEqual(secondary.ticker, DEFAULT_TICKER_CONFIG);
    assert.equal(secondary.enabled, false);
    assert.equal(secondary.headline, "Promotion headline");
    assert.deepEqual((await rpc({ ...config, messages: [] }, 2)).ticker.messages, []);
    await db.exec("reset role");
    console.log("Ticker exact migration + real PostgreSQL verification passed: defaults, constraints, authenticated saves, atomic sequence, stale revisions, timestamps/actor, scheduling/public projection and role/RLS permissions.");
  } finally {
    await db.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await verifyTickerDatabase();
