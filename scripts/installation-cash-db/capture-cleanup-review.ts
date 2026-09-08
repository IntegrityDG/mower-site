// Read-only database capture. Produces a separate review candidate; never drops,
// changes the original run manifest, or grants permission for later cleanup.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {configureDisposableDatabase,assertApproval,assertContainer,assertDatabase,assertLocalEndpoint,assertRun,type Approval,type RunManifest} from './guards';
import {sourceHashes} from './runner';

const suffix=process.argv[2];assert.match(suffix??'',/^[a-z0-9_]{1,26}$/);
const dir='docs/review/installation-readiness',source=`${dir}/db-${suffix}-run.json`,output=`${dir}/db-${suffix}-cleanup-review.json`;
assert.ok(!fs.existsSync(output),'Preserve the existing cleanup review; do not overwrite it');
const approval=JSON.parse(fs.readFileSync(`${dir}/db-${suffix}-approval.json`,'utf8')) as Approval;
const manifest=JSON.parse(fs.readFileSync(source,'utf8')) as RunManifest;
configureDisposableDatabase(approval.database);assertApproval(approval,sourceHashes(process.cwd()),'preflight');
const docker=(args:string[],input?:string)=>execFileSync('docker',args,{input,encoding:'utf8',windowsHide:true,timeout:30000,stdio:['pipe','pipe','pipe']});
const endpoint=JSON.parse(docker(['context','inspect','--format','{{json .Endpoints.docker.Host}}']));assertLocalEndpoint(endpoint,process.env.DOCKER_HOST);
const local=(args:string[],input?:string)=>docker(['--host',endpoint,...args],input);
const inspect=JSON.parse(local(['inspect','--format','{"Id":{{json .Id}},"Name":{{json .Name}},"State":{"Running":{{json .State.Running}}},"Config":{"Labels":{"com.supabase.cli.project":{{json (index .Config.Labels "com.supabase.cli.project")}}}},"HostConfig":{"NetworkMode":{{json .HostConfig.NetworkMode}}},"NetworkSettings":{"Ports":{{json .NetworkSettings.Ports}}}}',approval.containerId]));
assertContainer(inspect,approval.containerId);
const query=(database:string,sql:string)=>JSON.parse(local(['exec','-i','-e','PGOPTIONS=-c default_transaction_read_only=on -c statement_timeout=15000',approval.containerId,'psql','-X','-w','-qAt','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1'],sql+';\n'));
assertDatabase(query(approval.database,"select json_build_object('database',current_database(),'oid',(select oid from pg_database where datname=current_database()),'role',current_user,'sessionRole',session_user,'version',current_setting('server_version_num')::integer)"),approval.database,manifest.databaseOid);
assertRun(manifest,approval,query(approval.database,"select json_build_object('runId',run_id,'databaseOid',database_oid) from ids_cash_review.run_manifest"));
// Reuse the exact reviewed runner's static SELECTs so inventory definitions cannot
// silently diverge. Hash verification above pins the runner, and read-only PG
// enforces this helper's database boundary even if a future extraction changes.
const runner=fs.readFileSync('scripts/installation-cash-db/runner.ts','utf8');
const objects=runner.match(/const objectsSql = `([\s\S]*?)`;/)?.[1];
const inventory=runner.match(/const inventory = \(\) => JSON.parse\(one\(TARGET.database, `([\s\S]*?)`\)\);/)?.[1];
assert.ok(objects&&inventory,'Static inventory SELECTs were not found');
assert.ok(objects.startsWith('select ')&&inventory.startsWith('select '),'Inventory must be SELECT statements');
assert.ok(!objects.includes('${')&&!inventory.includes('${'),'Inventory must not contain interpolation');
assert.deepEqual(query(approval.database,objects),manifest.createdObjects,'Objects changed; preserve and investigate');
const active=query('postgres',`select count(*) from pg_stat_activity where datname='${approval.database}'`);assert.equal(active,0,'Stop task app/REST connections before capturing the cleanup review');
const records=query(approval.database,inventory);
const review={...manifest,records,cleanupReview:{capturedAt:new Date().toISOString(),sourceManifest:source,sourceManifestSha256:createHash('sha256').update(fs.readFileSync(source)).digest('hex'),previousRecordCount:manifest.records.length,currentRecordCount:records.length,readOnlyCapture:true,cleanupApproved:false}};
fs.writeFileSync(output,JSON.stringify(review,null,2)+'\n');
console.log(JSON.stringify({database:manifest.database,databaseOid:manifest.databaseOid,runId:manifest.runId,records:records.length,review:output,readOnly:true,cleanupExecuted:false}));
