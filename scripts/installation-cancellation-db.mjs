// Synthetic in-memory PostgreSQL only. No environment credentials or hosted connections.
// Install separately: npm install --prefix /tmp/ids-pglite-test --ignore-scripts --save-exact @electric-sql/pglite@0.5.16
// Run: PGLITE_PACKAGE=/tmp/ids-pglite-test/node_modules/@electric-sql/pglite/dist/index.js node scripts/installation-cancellation-db.mjs
import { fileURLToPath, pathToFileURL } from 'node:url';
const packageSpecifier=process.env.PGLITE_PACKAGE;
const {PGlite}=await import(packageSpecifier ? pathToFileURL(packageSpecifier).href : '@electric-sql/pglite');
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const root=fileURLToPath(new URL('../supabase/migrations/',import.meta.url));
const db=new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create table demo_settings(id boolean, scheduling_horizon_days integer); insert into demo_settings values(true,365); create table demo_availability_rules(weekday integer,enabled boolean,start_time time,end_time time); insert into demo_availability_rules select n,true,'08:00'::time,'20:00'::time from generate_series(0,6)n; create table demo_availability_exceptions(starts_at timestamptz,ends_at timestamptz); create table demo_requests(id uuid primary key, status text, requested_start_at timestamptz,requested_end_at timestamptz);`);
for(const prefix of ['20260904204800','20260907233602','20260907234000','20260907235702','20260908152507']){const file=fs.readdirSync(root).find(n=>n.startsWith(prefix));try{await db.exec(fs.readFileSync(root+file,'utf8')); console.log('APPLIED',file);}catch(e){console.error('FAILED',file,e.message,e.where); process.exit(1);}}
const acl=await db.query(`select oid::regprocedure::text as signature,proacl::text from pg_proc where proname in ('ids_create_installation','ids_create_setup_only','ids_apply_installation_admin') order by 1`);
const legacyPayload={idempotencyKey:randomUUID(),startAt:(await db.query("select start_at from ids_list_installation_slots(current_date+50,current_date+50) limit 1")).rows[0].start_at.toISOString(),name:'Prior synthetic',email:'prior@example.invalid',phone:'5555555555',address:'Synthetic prior property',equipment:'synthetic',internetAvailability:'yes',groundingAcknowledged:true,responsibilitiesAcknowledged:true,termsAcknowledged:true,undergroundRequested:false,cashRequested:false,estimatedUndergroundFeet:0,termsVersion:'2026-09-08-setup'};
const prior=(await db.query('select ids_create_installation($1) as r',[legacyPayload])).rows[0].r;
const priorSnapshot=(await db.query('select to_jsonb(i) as r from installations i where id=$1',[prior.id])).rows[0].r;
const reviewMigrations=fs.readdirSync(root).filter(n=>n.endsWith('_installation_cancellation_review.sql'));
assert.equal(reviewMigrations.length,1,'Expected exactly one reviewed cancellation migration');
await db.exec(fs.readFileSync(root+reviewMigrations[0],'utf8'));
const migratedPrior=(await db.query('select to_jsonb(i) as r from installations i where id=$1',[prior.id])).rows[0].r;
assert.deepEqual(migratedPrior,{...priorSnapshot,cancellation_review:null});
assert.deepEqual((await db.query('select ids_create_installation($1) as r',[legacyPayload])).rows[0].r,prior);
console.log('PASS pre-migration legacy record unchanged and original RPC request replays');
assert.deepEqual((await db.query(`select oid::regprocedure::text as signature,proacl::text from pg_proc where proname in ('ids_create_installation','ids_create_setup_only','ids_apply_installation_admin') order by 1`)).rows,acl.rows);
console.log('PASS migration executes and ACL unchanged',acl.rows);
let offset=1;
async function payload(setup=false){const slot=(await db.query(`select start_at from ids_list_installation_slots((current_date+$1::integer)::date,(current_date+$1::integer)::date) limit 1`,[offset++])).rows[0];return {idempotencyKey:randomUUID(),startAt:slot.start_at.toISOString(),name:'Synthetic Test',email:'test@example.invalid',phone:'5555555555',address:'Synthetic property',equipment:'synthetic',internetAvailability:'yes',groundingAcknowledged:!setup,responsibilitiesAcknowledged:true,termsAcknowledged:true,undergroundRequested:false,cashRequested:false,estimatedUndergroundFeet:0,setupSelected:setup,termsVersion:'2026-11-15-cancellation-review'};}
async function create(p,setup=false){return (await db.query(setup?`select ids_create_setup_only($1,'Synthetic test') as r`:`select ids_create_installation($1) as r`,[p])).rows[0].r;}
async function rejects(fn,msg){await assert.rejects(fn,e=>e.message.includes(msg));console.log('PASS reject',msg);}
for(const setup of [false,true]){const oldClient=await payload(setup);delete oldClient.termsVersion;const oldJob=await create(oldClient,setup);assert.equal((await db.query('select terms_version from installations where id=$1',[oldJob.id])).rows[0].terms_version,'2026-09-08-setup');assert.equal((await create(oldClient,setup)).id,oldJob.id);}
console.log('PASS omitted-version old app intake preserves legacy agreement for installation and Setup; retries replay');
const p=await payload(), job=await create(p); assert.deepEqual(await create(p),job);
assert.equal((await db.query('select terms_version from installations where id=$1',[job.id])).rows[0].terms_version,p.termsVersion);
for(const ver of ['2026-09-04',null]){const stale={...await payload(),termsVersion:ver};await rejects(()=>create(stale),'installation_terms_changed');assert.equal((await db.query('select count(*)::int as n from installations where idempotency_key=$1',[stale.idempotencyKey])).rows[0].n,0);}
const sp=await payload(true); await create(sp,true); assert.equal((await create(sp,true)).replayed,true);
const badsp={...await payload(true),termsVersion:'2026-09-04'};await rejects(()=>create(badsp,true),'installation_terms_changed');
// Legacy fixtures model original accepted requests without modifying released migrations.
const lp={...await payload(),termsVersion:'2026-09-04'}, ls={...await payload(true),termsVersion:'2026-09-08-setup'};
for(const [original,setup] of [[lp,false],[ls,true]]){const fresh=await create({...original,termsVersion:p.termsVersion},setup);await db.query('update installations set terms_version=$2,request_payload=$3 where id=$1',[fresh.id,original.termsVersion,setup?{setupOnly:true,request:original,reason:'Synthetic test'}:original]);assert.equal((await create(original,setup)).id,fresh.id);}
console.log('PASS intake new versions, exact new/legacy replay, stale rejection');
function bal(charges=100000,adjust=0,net=50000,pending=0){const b=charges-net;return {approvedChargesCents:charges,adjustmentCents:adjust,receivedCents:net,completedRefundsCents:0,pendingRefundsCents:pending,receiptCorrectionsCents:0,netPaidCents:net,balanceCents:b,balanceDueCents:Math.max(0,b),customerCreditCents:Math.max(0,-b),paymentState:b<0?'customer_credit':b===0?'paid':net>0?'partially_paid':'unpaid'};}
const before=bal(),after=bal(35000,-65000), review={cause:'customer',feeCents:25000,purchasedMaterialsCents:10000,materialsChoice:'awaiting_choice',settlementFinal:true};
const basePayload={action:'cancel',cancellationCause:'customer',cancellationReviewed:true,cancellationFeeCents:25000,purchasedMaterialsCents:10000,materialsPurchaseEvidence:'Synthetic purchase proof'};
const patch={status:'cancelled',cancellation_review:review};const adjustments=[{kind:'credit',description:'Synthetic cancellation settlement',amount_cents:-65000}];
await db.query('update installations set pricing_snapshot=$2 where id=$1',[job.id,{laborCents:80000,materialsAllowanceCents:20000}]);
async function admin(opts={}){const state=(await db.query('select ids_installation_admin_state($1) as r',[opts.id??job.id])).rows[0].r;return (await db.query('select ids_apply_installation_admin($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as r',[opts.id??job.id,opts.key??randomUUID(),opts.payload??basePayload,opts.expected??state,opts.patch??patch,opts.adjustments??adjustments,opts.sessions??[],null,opts.before??before,opts.after??after])).rows[0].r;}
await rejects(()=>admin({expected:{}}),'installation_state_changed');
await rejects(()=>admin({payload:{...basePayload,cancellationFeeCents:25001}}),'invalid_cancellation_amount');
await rejects(()=>admin({payload:{...basePayload,purchasedMaterialsCents:50001}}),'invalid_cancellation_amount');
await rejects(()=>admin({payload:{...basePayload,materialsPurchaseEvidence:''}}),'verified_materials_purchase_required');
await rejects(()=>admin({payload:{...basePayload,cancellationCause:'ids'}}),'no_customer_deductions_for_this_cancellation');
await rejects(()=>admin({before:bal(100000,0,50000,1),after:bal(35000,-65000,50000,1)}),'resolve_pending_refunds_before_cancellation');
const key=randomUUID();assert.equal((await admin({key})).replayed,false);assert.equal((await admin({key,expected:{}})).replayed,true);
await rejects(()=>admin({key,payload:{...basePayload,cancellationFeeCents:1}}),'admin_operation_conflict');
await rejects(()=>admin({payload:{action:'materials'},patch:{},adjustments:[],before:after,after}),'cancellation_settlement_locked');
const choicePayload={action:'cancellation_materials_choice',materialsChoice:'pickup',customerChoiceConfirmed:true};
await rejects(()=>admin({payload:choicePayload,patch:{cancellation_review:{...review,materialsChoice:'pickup'}},adjustments:[],before:after,after:bal(34000,-65000)}),'invalid_admin_balance');
await admin({payload:choicePayload,patch:{cancellation_review:{...review,materialsChoice:'pickup'}},adjustments:[],before:after,after});
assert.equal((await db.query('select cancellation_review from installations where id=$1',[job.id])).rows[0].cancellation_review.materialsChoice,'pickup');
await admin({payload:{...choicePayload,materialsChoice:'forfeit'},patch:{cancellation_review:{...review,materialsChoice:'forfeit'}},adjustments:[],before:after,after});
const work=await create(await payload());await db.query(`insert into installation_work_sessions(installation_id,technician,started_at,ended_at,duration_minutes,status) values($1,'Synthetic',now()-interval '1 hour',now(),60,'paused')`,[work.id]);
await rejects(()=>admin({id:work.id}),'use_work_or_safety_termination');
console.log('PASS admin cap/evidence/pending refund/immutability/replay/stale state/materials-choice/work-history guards');

const clip=await create(await payload());
const clippedReview={...review,feeCents:5000,purchasedMaterialsCents:45000};
await admin({id:clip.id,payload:{...basePayload,purchasedMaterialsCents:45000},patch:{status:'cancelled',cancellation_review:clippedReview},adjustments:[{kind:'credit',description:'Synthetic clipping',amount_cents:-50000}],after:bal(50000,-50000)});
assert.equal((await db.query('select cancellation_review from installations where id=$1',[clip.id])).rows[0].cancellation_review.feeCents,5000);
console.log('PASS cancellation fee clipped to collected funds after materials');
await admin({id:prior.id,payload:{action:'cancel'},patch:{status:'cancelled'},adjustments:[],before:bal(0,0,0),after:bal(0,0,0)});
assert.equal((await db.query('select cancellation_review from installations where id=$1',[prior.id])).rows[0].cancellation_review,null);
console.log('PASS legacy administrative cancellation remains unaffected');

const fullReview={cause:'full_refund_required',feeCents:0,purchasedMaterialsCents:0,materialsChoice:'not_applicable',settlementFinal:true};
const fullPayload={action:'cancellation_full_refund',cancellationReviewed:true,reason:'Synthetic confirmed statutory correction'};
const fullOpts={payload:fullPayload,patch:{cancellation_review:fullReview},adjustments:[{kind:'credit',description:'Synthetic statutory correction',amount_cents:-35000}],before:after,after:bal(0,-100000)};
await rejects(()=>admin({...fullOpts,payload:{...fullPayload,cancellationReviewed:false}}),'cancellation_full_refund_unavailable');
await rejects(()=>admin({...fullOpts,before:bal(35000,-65000,50000,1),after:bal(0,-100000,50000,1)}),'resolve_pending_refunds_before_cancellation');
const initialAudit=(await db.query("select to_jsonb(e) as r from installation_audit_events e where installation_id=$1 and event_type='cancel'",[job.id])).rows;
const fullKey=randomUUID();await admin({...fullOpts,key:fullKey});assert.equal((await admin({...fullOpts,key:fullKey,expected:{}})).replayed,true);
assert.deepEqual((await db.query("select to_jsonb(e) as r from installation_audit_events e where installation_id=$1 and event_type='cancel'",[job.id])).rows,initialAudit);
assert.deepEqual((await db.query('select cancellation_review from installations where id=$1',[job.id])).rows[0].cancellation_review,fullReview);
// Simulate the balance supplied by the trusted accounting layer after a completed refund.
// No payment operation is performed by this admin RPC or by the harness.
const refunded={...bal(0,-100000,0),receivedCents:50000,completedRefundsCents:50000};
await admin({...fullOpts,adjustments:[],before:refunded,after:refunded});
console.log('PASS statutory correction preserves original audit, zeros charges before/after returned funds, and replays');
const zero=await create(await payload()); const zeroReview={...review,feeCents:0,purchasedMaterialsCents:0,materialsChoice:'not_applicable'};
await admin({id:zero.id,payload:{...basePayload,cancellationFeeCents:0,purchasedMaterialsCents:0},patch:{status:'cancelled',cancellation_review:zeroReview},adjustments:[],before:bal(0,0,0),after:bal(0,0,0)});
assert.equal((await db.query('select pricing_snapshot from installations where id=$1',[zero.id])).rows[0].pricing_snapshot,null);
console.log('PASS unapproved zero-money cancellation preserves absent pricing snapshot');
const guardOpts={...fullOpts,adjustments:[],before:bal(0,0,0),after:bal(0,0,0)};
const noReview=await create(await payload());await db.query("update installations set status='cancelled' where id=$1",[noReview.id]);
await rejects(()=>admin({...guardOpts,id:noReview.id}),'cancellation_full_refund_unavailable');
await db.query('update installations set special_cash_failure_reschedule=true where id=$1',[zero.id]);
await rejects(()=>admin({...guardOpts,id:zero.id}),'cancellation_full_refund_unavailable');
await db.query("update installations set status='cancelled',cancellation_review=$2 where id=$1",[work.id,zeroReview]);
await rejects(()=>admin({...guardOpts,id:work.id}),'cancellation_full_refund_unavailable');
console.log('PASS full-refund correction requires saved review/confirmation and blocks cash-failure/work/pending paths');

await db.close();
