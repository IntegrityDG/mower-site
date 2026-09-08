// NO default execution. Each phase requires a separate explicit invocation.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { TARGET, configureDisposableDatabase, assertApproval, assertContainer, assertCreateAbsent, assertDatabase, assertLocalEndpoint, assertRun, parsePhase, type Approval, type Container, type RunManifest } from "./guards";
import { PsqlConnection, literal } from "./psql";
import { runDatabaseTests } from "./tests";
import { runWorkflowTests } from "./workflow-tests";
import { runStripeDatabaseTests } from "./stripe-tests";

export const SQL_FILES = [
  "scripts/installation-cash-db/00-demo-prerequisite.sql", "scripts/installation-cash-db/01-admin-login-prerequisite.sql", "supabase/migrations/20260904204800_professional_installations.sql",
  "supabase/migrations/20260907233602_installation_cash_safeguards.sql",
  "supabase/migrations/20260907234000_installation_workflow_scheduling.sql",
  "supabase/migrations/20260907235702_installation_stripe_reconciliation.sql", "scripts/installation-cash-db/10-fixtures.sql",
];
export const HASH_FILES = [ ...SQL_FILES,
  "scripts/installation-cash-db/guards.ts", "scripts/installation-cash-db/psql.ts", "scripts/installation-cash-db/runner.ts",
  "scripts/installation-cash-db/tests.ts", "scripts/installation-cash-db/fixtures.json", "lib/installations/accounting.ts", "lib/installations/policy.ts",
  "scripts/installation-cash-db/workflow-tests.ts", "lib/installations/admin-policy.ts", "lib/installations/stripe-policy.ts",
  "scripts/installation-cash-db/stripe-tests.ts", "tests/helpers/installation-stripe-fixtures.ts", "tests/helpers/installation-fixtures.ts",
];
export function sourceHashes(root: string) {
  return Object.fromEntries(HASH_FILES.map(file => [file, createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex")]));
}
const identitySql = "select json_build_object('database',current_database(),'oid',(select oid from pg_database where datname=current_database()),'role',current_user,'sessionRole',session_user,'version',current_setting('server_version_num')::integer)";
const objectsSql = `select coalesce(json_agg(object order by object),'[]'::json) from (
  select 'relation:'||n.nspname||'.'||c.relname as object from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','ids_cash_review')
  union all select 'function:'||p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','ids_cash_review')
  union all select 'trigger:'||tgrelid::regclass::text||'.'||tgname from pg_trigger where not tgisinternal and tgrelid in (select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','ids_cash_review'))
  union all select 'constraint:'||conrelid::regclass::text||'.'||conname from pg_constraint where connamespace in (select oid from pg_namespace where nspname in ('public','ids_cash_review'))
) objects`;
function safeEnv(): NodeJS.ProcessEnv {
  return { ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(DOCKER_HOST$|DOCKER_CONTEXT$|PG|POSTGRES|DATABASE|SUPABASE|NEXT_PUBLIC_SUPABASE|STRIPE|RESEND|SMTP|EMAIL|INSTALLATION_)/.test(name))), NODE_ENV: "test" };
}
export async function main(argv = process.argv.slice(2), root = process.cwd()) {
  const phase = parsePhase(argv[0]);
  assert.equal(new Set(argv.filter(v => v.startsWith("--"))).size, argv.filter(v => v.startsWith("--")).length, "Duplicate options are forbidden");
  const option = (name: string) => { const at = argv.indexOf(name); return at >= 0 ? argv[at + 1] : undefined; };
  const allowed = new Set(["--approval", "--manifest", "--approve-create", "--approve-tests", "--approve-drop"]);
  for (let i = 1; i < argv.length; i += 2) assert.ok(allowed.has(argv[i]) && argv[i + 1] && !argv[i + 1].startsWith("--"), "Unknown or incomplete option");
  const approvalPath = option("--approval"); assert.ok(approvalPath, "A reviewed approval file is required");
  const approval = JSON.parse(fs.readFileSync(approvalPath, "utf8")) as Approval;
  configureDisposableDatabase(approval.database);
  const hashes = sourceHashes(root);
  const token = option(phase === "create" ? "--approve-create" : phase === "test" ? "--approve-tests" : "--approve-drop");
  assertApproval(approval, hashes, phase, token);
  const manifestPath = path.resolve(option("--manifest") ?? "docs/review/cash-safeguards/database-run.json");
  assert.ok(manifestPath.startsWith(path.resolve(root) + path.sep), "Run manifest must remain in this worktree");
  const env = safeEnv();
  const docker = (args: string[], input?: string) => execFileSync("docker", args, { input, env, encoding: "utf8", windowsHide: true, timeout: 30000, stdio: ["pipe", "pipe", "pipe"] });
  const endpoint = JSON.parse(docker(["context", "inspect", "--format", "{{json .Endpoints.docker.Host}} "]).trim()) as string;
  assertLocalEndpoint(endpoint, process.env.DOCKER_HOST);
  const localDocker = (args: string[], input?: string) => docker(["--host", endpoint, ...args], input);
  const inspectFormat = '{"Id":{{json .Id}},"Name":{{json .Name}},"State":{"Running":{{json .State.Running}}},"Config":{"Labels":{"com.supabase.cli.project":{{json (index .Config.Labels "com.supabase.cli.project")}}}},"HostConfig":{"NetworkMode":{{json .HostConfig.NetworkMode}}},"NetworkSettings":{"Ports":{{json .NetworkSettings.Ports}}}}';
  const inspect = (id: string) => JSON.parse(localDocker(["inspect", "--format", inspectFormat, id])) as Container;
  assertContainer(inspect(approval.containerId), approval.containerId);
  const network = JSON.parse(localDocker(["network", "inspect", "--format", "{{json .Options}}", TARGET.network]));
  assert.equal(network["com.docker.network.bridge.host_binding_ipv4"], TARGET.host);
  const ids = localDocker(["ps", "--no-trunc", "--filter", `label=com.supabase.cli.project=${TARGET.project}`, "--format", "{{.ID}} "]).trim().split(/\s+/).filter(Boolean);
  for (const id of ids) for (const ports of Object.values(inspect(id).NetworkSettings.Ports)) for (const binding of ports ?? []) assert.equal(binding.HostIp, TARGET.host, "Non-loopback harness port");
  const one = (db: string, sql: string, readOnly = true) => {
    assert.ok(db === "postgres" || db === TARGET.database);
    assertContainer(inspect(approval.containerId), approval.containerId);
    const args = ["exec", "-i", "-e", `PGOPTIONS=-c default_transaction_read_only=${readOnly ? "on" : "off"}`, approval.containerId,
      "psql", "-X", "-w", "-qAt", "-U", TARGET.role, "-d", db, "-v", "ON_ERROR_STOP=1"];
    return localDocker(args, sql + "\n").trim();
  };
  const identity = (db: string) => JSON.parse(one(db, identitySql + ";"));
  assertDatabase(identity("postgres"), "postgres");
  const roles = JSON.parse(one("postgres", "select json_agg(json_build_object('name',rolname,'super',rolsuper,'bypass',rolbypassrls,'createDb',rolcreatedb)) from pg_roles where rolname in ('postgres','service_role','anon','authenticated');")) as { name: string; super: boolean; bypass: boolean; createDb: boolean }[];
  assert.equal(roles.length, 4, "Required Supabase roles missing; do not create cluster roles");
  assert.ok(roles.find(r => r.name === "service_role")?.bypass, "Service role requires existing RLS bypass");
  for (const role of roles.filter(r => ["anon", "authenticated"].includes(r.name))) assert.ok(!role.super && !role.bypass, "Unexpected browser role attributes");
  const builtins = JSON.parse(one("postgres", "select json_build_object('uuid',to_regprocedure('pg_catalog.gen_random_uuid()') is not null,'plpgsql',exists(select 1 from pg_language where lanname='plpgsql'),'ranges',to_regtype('pg_catalog.tstzrange') is not null);"));
  assert.ok(builtins.uuid && builtins.plpgsql && builtins.ranges, "Required PostgreSQL built-ins missing");
  const exists = one("postgres", `select exists(select 1 from pg_database where datname=${literal(TARGET.database)});`) === "t";
  if (phase === "preflight") {
    const schema = JSON.parse(one("postgres", "select coalesce(json_agg(table_name order by table_name),'[]'::json) from information_schema.tables where table_schema='public' and (table_name like 'installation%' or table_name='demo_requests');"));
    console.log(JSON.stringify({ phase, containerId: approval.containerId, project: TARGET.project, target: `${TARGET.host}:${TARGET.port}/${TARGET.database}`, postgres: identity("postgres"), candidateExists: exists, existingRelevantTables: schema, roles, builtins, hashes }, null, 2));
    return;
  }
  const inventory = () => JSON.parse(one(TARGET.database, `select coalesce(json_agg(r order by r->>'table',r->>'id'),'[]'::json) from (
    select json_build_object('table','installations','id',id) as r from public.installations
    union all select json_build_object('table','installation_pricing_settings','id',id) from public.installation_pricing_settings
    union all select json_build_object('table','installation_payments','id',id,'key',idempotency_key) from public.installation_payments
    union all select json_build_object('table','installation_adjustments','id',id) from public.installation_adjustments
    union all select json_build_object('table','installation_work_sessions','id',id) from public.installation_work_sessions
    union all select json_build_object('table','installation_cash_corrections','id',id,'key',idempotency_key) from public.installation_cash_corrections
    union all select json_build_object('table','installation_cash_refunds','id',id,'key',idempotency_key) from public.installation_cash_refunds
    union all select json_build_object('table','installation_audit_events','id',id,'key',details->>'operationKey') from public.installation_audit_events
    union all select json_build_object('table','installation_admin_operations','id',operation_key) from public.installation_admin_operations
    union all select json_build_object('table','installation_pricing_history','id',operation_key) from public.installation_pricing_history
    union all select json_build_object('table','installation_processor_events','id',event_id) from public.installation_processor_events
    union all select json_build_object('table','demo_requests','id',id) from public.demo_requests
  ) records;`));
  const save = (manifest: RunManifest) => fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  if (phase === "create") {
    assertCreateAbsent(exists); assert.ok(!fs.existsSync(manifestPath), "Existing run manifest must be preserved");
    assert.ok(roles.find(r => r.name === "postgres")?.createDb || roles.find(r => r.name === "postgres")?.super);
    // The ONLY write sent via postgres is explicitly approved CREATE DATABASE.
    one("postgres", `CREATE DATABASE ${TARGET.database} WITH TEMPLATE template0 OWNER postgres;`, false);
    const dbIdentity = identity(TARGET.database); assertDatabase(dbIdentity, TARGET.database);
    const manifest: RunManifest = { runId: randomUUID(), containerId: approval.containerId, database: TARGET.database, databaseOid: dbIdentity.oid,
      hashes, prepared: false, testsStarted: false, createdObjects: [], records: [] };
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true }); save(manifest);
    one(TARGET.database, `begin; create schema ids_cash_review; revoke all on schema ids_cash_review from public,anon,authenticated,service_role;
      create table ids_cash_review.run_manifest(run_id text primary key,database_oid oid not null);
      insert into ids_cash_review.run_manifest values(${literal(manifest.runId)},${manifest.databaseOid}); commit;`, false);
    for (const file of SQL_FILES) {
      assertApproval(approval, sourceHashes(root), phase, token); assertDatabase(identity(TARGET.database), TARGET.database, manifest.databaseOid);
      try { one(TARGET.database, fs.readFileSync(path.join(root, file), "utf8"), false); }
      catch (error) {
        const stderr = String((error as { stderr?: unknown }).stderr ?? "");
        throw new Error(`Schema file ${file}: ${stderr.split(/\r?\n/).find(line => line.startsWith("ERROR:")) ?? "local psql failed; preserve the incomplete manifest"}`);
      }
    }
    manifest.prepared = true;
    manifest.createdObjects = JSON.parse(one(TARGET.database, objectsSql + ";"));
    manifest.records = inventory();
    save(manifest); console.log(JSON.stringify({ phase, prepared: true, manifest: path.relative(root, manifestPath), databaseOid: manifest.databaseOid })); return;
  }
  assert.ok(exists, "Disposable database is absent");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as RunManifest;
  assertDatabase(identity(TARGET.database), TARGET.database, manifest.databaseOid);
  const marker = JSON.parse(one(TARGET.database, "select json_build_object('runId',run_id,'databaseOid',database_oid) from ids_cash_review.run_manifest;"));
  assertRun(manifest, approval, marker, phase === "cleanup" ? token : undefined);
  assert.deepEqual(JSON.parse(one(TARGET.database, objectsSql + ";")), manifest.createdObjects, "Unexpected disposable objects; stop for review");
  if (phase === "cleanup") {
    assert.deepEqual(inventory(),manifest.records,"Records changed after the reviewed run; preserve the database and capture a newly reviewed inventory before cleanup");
    assert.equal(one("postgres", `select count(*) from pg_stat_activity where datname=${literal(TARGET.database)};`), "0", "Close test connections; never force-disconnect unrelated sessions");
    // Optional, explicitly approved DROP only. Never FORCE, never volumes/reset.
    one("postgres", `DROP DATABASE ${TARGET.database};`, false);
    console.log(JSON.stringify({ phase, dropped: TARGET.database, retainedManifest: path.relative(root, manifestPath) })); return;
  }
  assert.equal(manifest.testsStarted, false, "Tests already started; preserve failed run instead of reusing it");
  manifest.testsStarted = true; save(manifest);
  const connections: PsqlConnection[] = [];
  const connect = () => { const c = new PsqlConnection(endpoint, approval.containerId, TARGET.database, env); connections.push(c); return c; };
  try {
    const verifySession = async (c: PsqlConnection) => {
      assertDatabase(await c.json(identitySql), TARGET.database, manifest.databaseOid);
      const sessionMarker = await c.json<{ runId: string; databaseOid: number }>("select json_build_object('runId',run_id,'databaseOid',database_oid) from ids_cash_review.run_manifest");
      assertRun(manifest, approval, sessionMarker);
    };
    const results = await runDatabaseTests(connect, record => { manifest.records.push({ observedOperation: record }); save(manifest); }, verifySession);
    const workflow = await runWorkflowTests(connect, verifySession);
    const stripe = await runStripeDatabaseTests(connect,verifySession);
    manifest.records = inventory(); save(manifest);
    fs.writeFileSync(manifestPath.replace(/\.json$/, "-results.json"), JSON.stringify({ ...results, workflow, stripe, databaseOid: manifest.databaseOid, containerId: manifest.containerId }, null, 2) + "\n");
    console.log(JSON.stringify({ ...results, workflow, stripe }));
  } finally { for (const connection of connections) connection.close(); }
  // No database cleanup in finally, on success, or on error.
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error("Cash DB phase stopped. Preserve the target and run manifest. No automatic cleanup."); console.error(error instanceof Error ? error.message.split("\n")[0] : "Unknown phase failure"); process.exitCode = 1; });
}
