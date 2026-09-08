// Real PostgreSQL checks for the additive Setup migration. The caller must pin
// and verify a NEW disposable local database; this module never opens one itself.
import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {PsqlConnection,literal,jsonLiteral} from "./psql";
import {adminState,adminArgs,adminSql} from "./workflow-tests";
import {installationBalance,financialPaymentStatus,installationCheckoutAmount} from "../../lib/installations/accounting";
import {cumulativeWorkMinutes} from "../../lib/installations/admin-policy";
import {DEFAULT_PRICING} from "../../lib/installations/policy";
import {installationStripeProjection,type InstallationStripePayment} from "../../lib/installations/stripe-policy";
import {processorFixture} from "../../tests/helpers/installation-stripe-fixtures";

const rpc=(name:string,args:Record<string,unknown>)=>`select public.${name}(${Object.entries(args).map(([k,v])=>`${k}=>${v===null?"null":typeof v==="object"?jsonLiteral(v):typeof v==="number"||typeof v==="boolean"?String(v):literal(v)}`).join(",")})`;
const balance=(s:Awaited<ReturnType<typeof adminState>>)=>installationBalance(s.installation.pricing_snapshot,s.adjustments,s.payments,s.corrections,s.cashRefunds);
export async function runSetupDatabaseTests(connect:()=>PsqlConnection,verify:(c:PsqlConnection)=>Promise<void>){
  const c=connect();await verify(c);await c.query("set statement_timeout='15s'");await c.query("set role service_role");const checks:string[]=[];
  const slots=await c.json<{start_at:string}[]>("select json_agg(s) from public.ids_list_installation_slots((now() at time zone 'America/Chicago')::date+43,(now() at time zone 'America/Chicago')::date+65) s");assert.ok(slots.length>=12);let nextSlot=0;
  const request=(setup:boolean,only=false)=>({name:"SYNTHETIC SETUP REVIEW",email:"setup@example.invalid",phone:"000-000-0000",address:"SYNTHETIC PROPERTY",equipment:"Yarbo synthetic",internetAvailability:"yes",undergroundRequested:false,estimatedUndergroundFeet:0,startAt:new Date(slots[nextSlot++].start_at).toISOString(),groundingAcknowledged:!only,responsibilitiesAcknowledged:true,termsAcknowledged:true,undergroundAcknowledged:false,cashRequested:false,setupSelected:setup,idempotencyKey:randomUUID()});
  const create=async(setup:boolean,only=false)=>{const payload=request(setup,only),args=only?{p_payload:payload,p_reason:"SYNTHETIC existing mower owner"}:{p_payload:payload};const sql=rpc(only?"ids_create_setup_only":"ids_create_installation",args),result=await c.json<{id:string;public_token:string}>(sql);const replay=await c.json<{id:string}>(sql);assert.equal(replay.id,result.id);return{...result,payload};};
  const act=async(id:string,action:string,extra:Record<string,unknown>={},syntheticEligibility=false)=>c.json(adminSql(await adminArgs(c,id,{action,operationKey:randomUUID(),reason:"SYNTHETIC IDS authorization",...extra},syntheticEligibility)));
  const cash=async(id:string,amount:number)=>{const s=await adminState(c,id),before=balance(s),key=randomUUID(),time=new Date().toISOString(),after=installationBalance(s.installation.pricing_snapshot,s.adjustments,[...s.payments,{id:key,method:"cash",purpose:"cash",status:"paid",amount_cents:amount,refunded_cents:0,paid_at:time}],s.corrections,s.cashRefunds);
    return c.json<{paymentId:string}>(rpc("ids_record_installation_cash",{p_installation_id:id,p_operation_key:key,p_amount_cents:amount,p_received_at:time,p_reference:"SYNTHETIC SETUP",p_notes:null,p_confirm_overpayment:false,p_actor:"IDS shared administrator",p_expected_ledger:s.ledger,p_balance_before:before,p_balance_after:after,p_payment_status:financialPaymentStatus(after)}));};
  const fail=async(sql:string,pattern:RegExp)=>{await c.query("begin");const r=await c.raw(sql);await c.query("rollback");assert.notEqual(r.code,"00000");assert.match(r.message,pattern);};
  const jobs:string[]=[];
  for(const [setup,travel,total] of [[false,120,100000],[true,120,150000],[true,150,153500],[true,210,157000]] as const){
    const job=await create(setup);jobs.push(job.id);await act(job.id,"travel",{oneWayMinutes:travel});await act(job.id,"approve");let s=await adminState(c,job.id);
    assert.equal(balance(s).approvedChargesCents,total);assert.equal(s.installation.deposit_due_cents,25000);await cash(job.id,25000);s=await adminState(c,job.id);
    assert.equal(balance(s).balanceDueCents,total-25000);assert.equal(s.payments.length,1);assert.equal(Date.parse(s.installation.requested_end_at)-Date.parse(s.installation.requested_start_at),4*3600000);
    await act(job.id,"travel",{oneWayMinutes:travel});assert.equal(balance(await adminState(c,job.id)).approvedChargesCents,total);
    await fail(rpc("ids_create_installation",{p_payload:{...job.payload,idempotencyKey:randomUUID()}}),/slot_unavailable|slot_conflict/);
  }
  checks.push("A-D persisted: 1000/1500/1535/1570 charges, one 250 deposit, 750/1250/1285/1320 remaining, one four-hour reservation, repeated travel unchanged");
  const removeId=jobs[1],beforeRemove=await adminState(c,removeId);await act(removeId,"setup_materials",{actualCents:4900});await act(removeId,"setup",{selected:false});let s=await adminState(c,removeId);
  assert.deepEqual(s.payments,beforeRemove.payments);assert.equal(balance(s).balanceDueCents,79900);assert.equal(s.adjustments.filter(a=>a.reconciliation_kind==="setup_materials").reduce((n,a)=>n+a.amount_cents,0),4900);
  await act(removeId,"setup_materials",{actualCents:0});assert.equal(balance(await adminState(c,removeId)).balanceDueCents,75000);
  const audit=await c.json<{actor:string;created_at:string;details:{previous:{setup_selected:boolean};patch:{setup_selected:boolean};reason:string}}>(`select to_jsonb(a) from installation_audit_events a where installation_id=${literal(removeId)} and event_type='setup' order by id desc limit 1`);
  assert.equal(audit.actor,"IDS shared administrator");assert.ok(audit.created_at&&audit.details.reason);assert.equal(audit.details.previous.setup_selected,true);assert.equal(audit.details.patch.setup_selected,false);
  checks.push("E persisted: Setup removal credits 500, keeps original deposit, retains authorized parts, append-only history with previous/new/reason/actor/time");
  const laborId=jobs[2];await cash(laborId,balance(await adminState(c,laborId)).balanceDueCents);await act(laborId,"arrangement");
  const record=async(component:string,minutes:number)=>{await act(laborId,"session_start",{serviceType:component});await act(laborId,"session_stop",{status:"paused"});const stopped=(await adminState(c,laborId)).sessions.find(w=>w.service_type===component&&!w.corrected_from_id&&!((s.sessions??[]).some(old=>old.id===w.id)))!;assert.ok(stopped);await act(laborId,"session_correct",{sessionId:stopped.id,durationMinutes:minutes});s=await adminState(c,laborId);};
  s=await adminState(c,laborId);await record("installation",300);await record("setup",120);await record("setup",60);
  assert.equal(cumulativeWorkMinutes(s.sessions,"installation"),300);assert.equal(cumulativeWorkMinutes(s.sessions,"setup"),180);await act(laborId,"labor");await act(laborId,"labor");s=await adminState(c,laborId);
  const amount=(kind:string)=>s.adjustments.filter(a=>a.reconciliation_kind===kind).reduce((n,a)=>n+a.amount_cents,0);assert.equal(amount("labor"),12500);assert.equal(amount("setup_labor"),0);
  const setupSession=s.sessions.find(w=>w.service_type==="setup"&&w.corrected_from_id)!;
  await fail(`update installation_work_sessions set service_type='installation' where id=${literal(setupSession.id)}`,/immutable/);
  checks.push("F-G persisted: Installation 300 and Setup 180 minutes remain separate across real pause/resume/corrections; 125 Installation overtime, zero Setup overtime, repeated reconciliation unchanged; bucket immutable");
  const standalone=await create(true,true);await act(standalone.id,"approve");s=await adminState(c,standalone.id);assert.equal(s.installation.installation_selected,false);assert.equal(s.installation.grounding_acknowledged_at,null);assert.equal(s.installation.pricing_snapshot.materialsAllowanceCents,0);assert.equal(balance(s).approvedChargesCents,50000);
  await fail(rpc("ids_create_setup_only",{p_payload:{...standalone.payload,name:"Changed"},p_reason:"SYNTHETIC existing mower owner"}),/idempotency_conflict/);
  await fail(`insert into installation_work_sessions(installation_id,technician,service_type) values(${literal(standalone.id)},'SYNTHETIC','installation')`,/service_component_not_selected/);
  for(const role of ["anon","authenticated"]){await c.query("reset role");assert.equal(await c.query(`select has_function_privilege(${literal(role)},'public.ids_create_setup_only(jsonb,text)','execute')`),"f");await c.query("set role service_role");}
  checks.push("Setup-only persisted internal creation/replay/conflict, true service selection, no grounding fiction or Installation allowance, unselected work rejected, browser-role RPC access denied");
  // Eligibility exists only as an explicit synthetic calculator argument. The
  // proposed schema must not create subscriber records or manual status fields.
  assert.equal(await c.query("select count(*) from information_schema.columns where table_schema='public' and (table_name like '%subscription%' or column_name like 'remote_support_%')"),"0");
  const subscriber=await create(true);
  const manualEligibility=await adminArgs(c,subscriber.id,{action:"approve",operationKey:randomUUID(),reason:"SYNTHETIC forbidden manual eligibility"});
  await fail(adminSql({...manualEligibility,p_patch:{...manualEligibility.p_patch,remote_support_eligible:true}}),/invalid_admin_patch/);
  await act(subscriber.id,"travel",{oneWayMinutes:150},true);await act(subscriber.id,"approve",{},true);await act(subscriber.id,"setup_materials",{actualCents:5000},true);s=await adminState(c,subscriber.id);
  assert.equal(balance(s).approvedChargesCents,145125);await act(subscriber.id,"travel",{oneWayMinutes:150},true);await act(subscriber.id,"labor",{},true);assert.equal(balance(await adminState(c,subscriber.id)).approvedChargesCents,145125);
  await act(subscriber.id,"pricing",{pricing:{...DEFAULT_PRICING,setupLaborCents:60000}},true);assert.equal((await adminState(c,subscriber.id)).installation.pricing_snapshot.setupLaborCents,60000);
  const saved=await adminState(c,subscriber.id);await c.query("begin");await c.query("update installation_pricing_settings set setup_labor_cents=70000 where id");assert.equal((await adminState(c,subscriber.id)).installation.pricing_snapshot.setupLaborCents,60000);await c.query("rollback");
  assert.deepEqual(await adminState(c,subscriber.id),saved);
  checks.push("H persisted synthetic eligibility: no subscriber table/status fields, manual eligibility patch rejected; explicit test-only true gives 25% Setup labor and single travel discount only, materials/Installation excluded, no repeated discount; approved price independent of changed defaults");
  const processor=await create(true);await act(processor.id,"travel",{oneWayMinutes:150});await act(processor.id,"approve");s=await adminState(c,processor.id);const paymentId=randomUUID(),purpose="deposit",requestBody={mode:"payment",metadata:{ids_kind:"professional_installation",installation_id:processor.id,payment_id:paymentId,purpose},line_items:[{price_data:{unit_amount:25000,currency:"usd"}}]};
  const reserve={p_id:processor.id,p_payment_id:paymentId,p_purpose:purpose,p_amount:25000,p_request:requestBody,p_expected_ledger:s.ledger,p_balance:balance(s)};
  const p=await c.json<InstallationStripePayment>(rpc("ids_reserve_installation_checkout",reserve));const retryState=await adminState(c,processor.id);assert.equal((await c.json<InstallationStripePayment>(rpc("ids_reserve_installation_checkout",{...reserve,p_expected_ledger:retryState.ledger,p_balance:balance(retryState)}))).id,p.id);
  const fixture=processorFixture(25000,{...p,stripe_session_id:"cs_test_setup_"+p.id,stripe_payment_intent_id:"pi_setup_"+p.id,stripe_charge_id:"ch_setup_"+p.id});await c.json(rpc("ids_attach_installation_checkout",{p_id:processor.id,p_payment_id:p.id,p_session_id:fixture.session.id,p_expires:new Date(fixture.session.expires_at*1000).toISOString()}));
  const settle=async(refund=false)=>{const current=await adminState(c,processor.id),row=current.payments.find(x=>x.id===p.id) as InstallationStripePayment;if(refund)fixture.charge.amount_refunded=5000;const projection=installationStripeProjection(current,row,fixture.session,fixture.intent,fixture.charge,refund?[fixture.refund(5000,"succeeded","re_setup_"+p.id)]:[],Math.floor(Date.now()/1000)),eventId="evt_setup_"+randomUUID();const args={p_id:processor.id,p_payment_id:p.id,p_expected_ledger:current.ledger,p_balance_before:balance(current),p_balance_after:projection.balance,p_evidence:projection.evidence,p_refunds:projection.refundRows,p_event:{id:eventId,type:"controlled.local.setup",objectId:fixture.session.id,created:Math.floor(Date.now()/1000),receivedAt:new Date().toISOString(),hash:createHash("sha256").update(eventId).digest("hex")}};await c.json(rpc("ids_reconcile_installation_stripe",args));assert.equal((await c.json<{replayed:boolean}>(rpc("ids_reconcile_installation_stripe",args))).replayed,true);};
  await settle();s=await adminState(c,processor.id);assert.equal(balance(s).balanceDueCents,128500);assert.equal(installationCheckoutAmount(balance(s),"deposit",25000),0);assert.equal(installationCheckoutAmount(balance(s),"balance",25000),128500);await settle(true);await settle(true);assert.equal(balance(await adminState(c,processor.id)).balanceDueCents,133500);
  checks.push("Shared Stripe RPCs with controlled TEST evidence: one durable deposit reservation, successful payment, identical/repeated delivery, one partial refund, combined remaining-balance amounts; zero Stripe network calls");
  return{passed:true,checks,reviewJobs:[...jobs,standalone.id,subscriber.id,processor.id]};
}
