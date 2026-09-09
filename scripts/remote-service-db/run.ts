// Opt-in local PostgreSQL verification. Importing this file does not connect.
// Existing databases are never reset, migrated, truncated or dropped.
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { assertContainer, assertDatabase, configureDisposableDatabase } from "../installation-cash-db/guards";

const endpoint = "npipe:////./pipe/dockerDesktopLinuxEngine";
const container = "c9ebb4abe137aaaec7d385676850ec3fb329a9b12504b0429ce398c6ed817300";
const root = "node_modules/.cache/ids-remote-service";
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const docker = (args: string[], input?: string) => execFileSync("docker", ["--host", endpoint, ...args], { input, encoding: "utf8", windowsHide: true, timeout: 60_000, maxBuffer: 40 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
const sql = (database: string, statement: string) => docker(["exec", "-i", container, "psql", "-X", "-w", "-qAt", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1"], statement + "\n").trim();
const identity = (database: string) => JSON.parse(sql(database, "select json_build_object('database',current_database(),'oid',(select oid from pg_database where datname=current_database()),'role',current_user,'sessionRole',session_user,'version',current_setting('server_version_num')::integer);"));

async function main() {
  const [phase, suffix] = process.argv.slice(2);
  assert.ok(["create", "feature"].includes(phase), "Only new databases are supported; there is no destructive reset/cleanup mode.");
  assert.match(suffix ?? "", /^remote_[0-9]{3}$/);
  const database = `ids_installation_cash_review_20260907_${suffix}`;
  configureDisposableDatabase(database);
  assertContainer(JSON.parse(docker(["inspect", container]))[0], container);
  assert.equal(sql("postgres", `select count(*) from pg_database where datname='${database}';`), "0", "Use a new disposable name; do not erase previous evidence.");
  const oldDatabases = JSON.parse(sql("postgres", "select json_agg(json_build_object('name',datname,'oid',oid) order by datname) from pg_database where datname like 'ids_installation_cash_review_20260907%';"));
  fs.mkdirSync(root, { recursive: true });
  const dir = `${root}/${suffix}`; fs.mkdirSync(dir);
  fs.writeFileSync(`${dir}/previous-databases.json`, JSON.stringify(oldDatabases, null, 2));
  if (phase === "feature") {
    // remote_005 is this task's successfully rehearsed released schema. Its new
    // feature transaction rolled back on a syntax error, so it remains a clean
    // synthetic baseline. Verify that fact before cloning it, never mutate it.
    const baseline = JSON.parse(fs.readFileSync(`${root}/remote_005/manifest.json`, "utf8"));
    assert.equal(baseline.database, "ids_installation_cash_review_20260907_remote_005");
    assertDatabase(identity(baseline.database), baseline.database, baseline.oid);
    assert.equal(sql(baseline.database, "select to_regclass('public.service_cases') is null;"), "t");
    for (const name of baseline.applied) assert.equal(hash(fs.readFileSync(`supabase/migrations/${name}`)), baseline.migrationHashes[name]);
    sql("postgres", `create database "${database}" template "${baseline.database}";`);
    const id = identity(database); assertDatabase(id, database);
    const migration = "20260909011843_remote_support_and_service.sql";
    const feature = fs.readFileSync(`supabase/migrations/${migration}`, "utf8");
    const manifest = { database, endpoint, container, oid: id.oid, baselineDatabase: baseline.database, migrationHashes: { ...baseline.migrationHashes, [migration]: hash(feature) } };
    fs.writeFileSync(`${dir}/manifest.json`, JSON.stringify(manifest, null, 2));
    try { sql(database, feature); }
    catch (error) { fs.writeFileSync(`${dir}/migration-error.log`, String((error as { stderr?: Buffer }).stderr ?? error)); throw new Error("Service migration failed; see ignored migration-error.log."); }
    fs.writeFileSync(`${root}/database.json`, JSON.stringify(manifest, null, 2));
    console.log(JSON.stringify({ database, oid: id.oid, serviceMigration: "passed", previousDatabasesPreserved: oldDatabases.length }));
    return;
  }
  // Schema only, plus publicly available catalog data; no customer, auth user,
  // quote, staff, subscription, payment or other business record is copied.
  const schema = docker(["exec", container, "pg_dump", "-U", "postgres", "-d", "postgres", "--schema-only", "--no-owner", "--no-privileges", "--schema=public", "--schema=catalog_private", "--schema=auth", "--schema=storage", "--schema=extensions"]);
  const catalog = docker(["exec", container, "pg_dump", "-U", "postgres", "-d", "postgres", "--data-only", "--no-owner", "--no-privileges", "--table=public.catalog_*"]);
  const baselineVersions = JSON.parse(sql("postgres", "select json_agg(version order by version) from supabase_migrations.schema_migrations;")) as string[];
  assert.deepEqual(baselineVersions, ["20260610", "20260715000100", "20260715000200", "20260715000300"], "Review a changed baseline before using it.");
  // These two data-only historical corrections require real legacy pricing/
  // rejected manufacturer suggestions. They contain no schema objects needed
  // here; copying those private business records would be inappropriate.
  const historicalDataOnly = ["20260726030630", "20260812040138"];
  const migrations = fs.readdirSync("supabase/migrations").filter(name => name.endsWith(".sql") && ![...baselineVersions, ...historicalDataOnly].includes(name.split("_")[0])).sort();
  const manifest = { database, endpoint, container, oid: 0, schemaHash: hash(schema), catalogHash: hash(catalog), migrationHashes: Object.fromEntries(migrations.map(name => [name, hash(fs.readFileSync(`supabase/migrations/${name}`))])), applied: [] as string[] };
  sql("postgres", `create database "${database}" template template0;`);
  const id = identity(database); assertDatabase(id, database); manifest.oid = id.oid;
  fs.writeFileSync(`${dir}/manifest.json`, JSON.stringify(manifest, null, 2));
  sql(database, schema.replace("CREATE SCHEMA public;", "CREATE SCHEMA IF NOT EXISTS public;"));
  sql(database, catalog);
  sql(database, fs.readFileSync("scripts/remote-service-db/catalog-prerequisite.sql", "utf8"));
  sql(database, "grant usage on schema public,catalog_private to service_role; grant all on all tables in schema catalog_private to service_role; do $$ declare t record; begin for t in select tablename from pg_tables where schemaname='public' and tablename like 'catalog_%' loop execute format('grant select on public.%I to anon,authenticated',t.tablename); execute format('grant all on public.%I to service_role',t.tablename); end loop; end $$;");
  for (const name of migrations) {
    try { sql(database, fs.readFileSync(`supabase/migrations/${name}`, "utf8")); }
    catch (error) { fs.writeFileSync(`${dir}/migration-error.log`, String((error as { stderr?: Buffer }).stderr ?? error)); throw new Error(`Migration failed in new disposable database: ${name}; see ignored migration-error.log`); }
    manifest.applied.push(name); fs.writeFileSync(`${dir}/manifest.json`, JSON.stringify(manifest, null, 2));
    console.log(`Local migration passed: ${name}`);
  }
  assertDatabase(identity(database), database, manifest.oid);
  for (const old of oldDatabases ?? []) assert.equal(sql("postgres", `select oid from pg_database where datname='${old.name}';`), String(old.oid));
  fs.writeFileSync(`${root}/database.json`, JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ database, oid: manifest.oid, appliedMigrations: migrations.length, existingDatabasesPreserved: oldDatabases?.length ?? 0 }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
