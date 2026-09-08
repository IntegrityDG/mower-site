// Offline guard tests only: no Docker process, PostgreSQL connection or SQL call.
import assert from "node:assert/strict";
import test from "node:test";
import { TARGET, assertApproval, assertContainer, assertCreateAbsent, assertDatabase, assertLocalEndpoint, assertRun, parsePhase, type Approval, type Container, type RunManifest } from "../scripts/installation-cash-db/guards";
import { main, sourceHashes } from "../scripts/installation-cash-db/runner";
import { rpcSql } from "../scripts/installation-cash-db/tests";
const containerId="a".repeat(64), hashes={"review.sql":"b".repeat(64)};
const approval:Approval={approved:true,containerId,project:TARGET.project,database:TARGET.database,hashes};
const container:Container={Id:containerId,Name:TARGET.containerName,State:{Running:true},Config:{Labels:{"com.supabase.cli.project":TARGET.project}},HostConfig:{NetworkMode:TARGET.network},NetworkSettings:{Ports:{"5432/tcp":[{HostIp:TARGET.host,HostPort:TARGET.port}]}}};
const manifest:RunManifest={runId:"11111111-1111-4111-8111-111111111111",containerId,database:TARGET.database,databaseOid:12345,hashes,prepared:true,testsStarted:false,createdObjects:[],records:[]};
test("no default/all phase; no-argument main rejects before any external process",async()=>{
  for(const phase of [undefined,"all","reset","start","repair"])assert.throws(()=>parsePhase(phase));
  await assert.rejects(main([]),/No default/);
});
test("approval requires exact hashes, full pinned ID, target and phase-specific token",()=>{
  assertApproval(approval,hashes,"preflight");assertApproval(approval,hashes,"create",TARGET.database);
  for(const bad of [{approved:false},{containerId:"short"},{database:"postgres"},{project:"another-project"},{hashes:{"review.sql":"different"}}])assert.throws(()=>assertApproval({...approval,...bad},hashes,"create",TARGET.database));
  for(const phase of ["create","test","cleanup"] as const)for(const token of [undefined,"yes","postgres"])assert.throws(()=>assertApproval(approval,hashes,phase,token));
  assert.throws(()=>assertApproval(approval,{...hashes,"unreviewed.sql":"x"},"test",TARGET.database));
});
test("Docker target guards reject remote endpoints and mismatched environment",()=>{
  const endpoint="npipe:////./pipe/dockerDesktopLinuxEngine";assertLocalEndpoint(endpoint);
  for(const invalid of ["tcp://127.0.0.1:2375","ssh://remote","tcp://production:2376",""])assert.throws(()=>assertLocalEndpoint(invalid));
  assert.throws(()=>assertLocalEndpoint(endpoint,"tcp://remote:2375"));
});
test("container/project/network/port identity fails closed",()=>{
  assertContainer(container,containerId);
  const variants: Partial<Container>[]=[{Id:"c".repeat(64)},{Name:"/another"},{State:{Running:false}},{Config:{Labels:{"com.supabase.cli.project":"another"}}},{HostConfig:{NetworkMode:"bridge"}},{NetworkSettings:{Ports:{}}},...(["0.0.0.0","::","::1"] as const).map(HostIp=>({NetworkSettings:{Ports:{"5432/tcp":[{HostIp,HostPort:TARGET.port}]}}})),{NetworkSettings:{Ports:{"5432/tcp":[{HostIp:TARGET.host,HostPort:"5433"}]}}}];
  for(const value of variants)assert.throws(()=>assertContainer({...container,...value},containerId));
});
test("database identity/role/version checks and no reuse",()=>{
  const identity={database:TARGET.database,oid:12345,role:"postgres",sessionRole:"postgres",version:170006};
  assertDatabase(identity,TARGET.database,12345);assertCreateAbsent(false);assert.throws(()=>assertCreateAbsent(true));
  for(const bad of [{database:"postgres"},{oid:99},{role:"service_role"},{sessionRole:"other"},{version:160010}])assert.throws(()=>assertDatabase({...identity,...bad},TARGET.database,12345));
});
test("cleanup requires the exact test-created database/OID/marker/hashes",()=>{
  const marker={runId:manifest.runId,databaseOid:manifest.databaseOid};assertRun(manifest,approval,marker,TARGET.database);
  for(const bad of [{database:"postgres"},{database:"other"},{containerId:"c".repeat(64)},{databaseOid:999},{prepared:false},{runId:"22222222-2222-4222-8222-222222222222"},{hashes:{}}])assert.throws(()=>assertRun({...manifest,...bad},approval,marker,TARGET.database));
  assert.throws(()=>assertRun(manifest,approval,{...marker,runId:"unknown"},TARGET.database));assert.throws(()=>assertRun(manifest,approval,marker,"postgres"));
});
test("hash inventory is local-only and includes SQL, fixture, runner, and trusted calculator",()=>{
  const files=sourceHashes(process.cwd());
  for(const name of ["supabase/migrations/20260907233602_installation_cash_safeguards.sql","scripts/installation-cash-db/10-fixtures.sql","scripts/installation-cash-db/runner.ts","lib/installations/accounting.ts"])assert.match(files[name],/^[a-f0-9]{64}$/);
});
test("test SQL builder quotes synthetic data and restricts callable functions",()=>{
  assert.match(rpcSql("ids_correct_installation_cash",{p_reason:"It's a recording correction"}),/It''s/);
  assert.throws(()=>rpcSql("drop_database",{}));assert.throws(()=>rpcSql("ids_record_installation_cash",{"p_bad);drop":1}));
});
