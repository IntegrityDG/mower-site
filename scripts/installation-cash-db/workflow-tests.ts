import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {prepareAdminOperation,cumulativeWorkMinutes,type AdminState} from "../../lib/installations/admin-policy";
import {DEFAULT_PRICING} from "../../lib/installations/policy";
import {installationBalance,financialPaymentStatus} from "../../lib/installations/accounting";
import {PsqlConnection,literal,jsonLiteral} from "./psql";

const rpc=(name:string,args:Record<string,unknown>)=>`select public.${name}(${Object.entries(args).map(([k,v])=>`${k}=>${v===null?"null":typeof v==="object"?jsonLiteral(v):typeof v==="number"||typeof v==="boolean"?String(v):literal(v)}`).join(",")})`;
export const adminState=(c:PsqlConnection,id:string)=>c.json<AdminState>(`select public.ids_installation_admin_state(${literal(id)})`);
export async function adminArgs(c:PsqlConnection,id:string,body:Record<string,unknown>){
  const state=await adminState(c,id),op=prepareAdminOperation(state,body,DEFAULT_PRICING);
  return {p_id:id,p_key:op.body.operationKey,p_payload:op.body,p_expected:state,p_patch:op.patch,p_adjustments:op.adjustments,p_sessions:op.sessions,p_stop_session:op.stopSession,p_balance_before:op.balanceBefore,p_balance_after:op.balanceAfter};
}
export const adminSql=(args:Record<string,unknown>)=>rpc("ids_apply_installation_admin",args);
export async function runWorkflowTests(connect:()=>PsqlConnection,verify:(c:PsqlConnection)=>Promise<void>){
  const a=connect(),b=connect();await verify(a);await verify(b);
  for(const c of [a,b]){await c.query("set statement_timeout='15s'");await c.query("set lock_timeout='3s'");await c.query("set role service_role");}
  const checks:string[]=[];
  const apid=Number(await a.query('select pg_backend_pid()')),bpid=Number(await b.query('select pg_backend_pid()'));
  const blockedByA=async()=>{const deadline=Date.now()+2500;while(Date.now()<deadline){if(await a.query(`select ${apid}=any(pg_blocking_pids(${bpid}))`)==='t')return;await new Promise(r=>setTimeout(r,20));}throw new Error('Expected concurrent writer never blocked');};
  const act=async(id:string,action:string,extra:Record<string,unknown>={})=>a.json(adminSql(await adminArgs(a,id,{action,operationKey:randomUUID(),reason:"SYNTHETIC approved review",...extra})));
  const slots=await a.json<{start_at:string;end_at:string}[]>("select json_agg(s) from public.ids_list_installation_slots(((now() at time zone 'America/Chicago')::date+25),((now() at time zone 'America/Chicago')::date+41)) s");
  assert.ok(slots.length>=15);let at=0;
  const intake=(start:string)=>({name:"SYNTHETIC WORKFLOW",email:"installation-test@example.invalid",phone:"000-000-0000",address:"SYNTHETIC installation address",equipment:null,preferredLocation:null,internetAvailability:"yes",undergroundRequested:false,estimatedUndergroundFeet:0,startAt:new Date(start).toISOString(),groundingAcknowledged:true,responsibilitiesAcknowledged:true,termsAcknowledged:true,undergroundAcknowledged:false,cashRequested:true,idempotencyKey:randomUUID()});
  const create=async()=>{const payload=intake(slots[at++].start_at),result=await a.json<{id:string;public_token:string}>(rpc("ids_create_installation",{p_payload:payload}));return{...result,payload};};
  const failure=async(c:PsqlConnection,sql:string,pattern:RegExp)=>{await c.query("savepoint expected_failure");const r=await c.raw(sql);await c.query("rollback to savepoint expected_failure");assert.notEqual(r.code,"00000");assert.match(r.message,pattern);};
  const cash=async(id:string,amount:number)=>{const s=await adminState(a,id),before=installationBalance(s.installation.pricing_snapshot,s.adjustments,s.payments,s.corrections,s.cashRefunds),key=randomUUID(),time=new Date().toISOString();
    const after=installationBalance(s.installation.pricing_snapshot,s.adjustments,[...s.payments,{id:key,method:"cash",purpose:"cash",status:"paid",amount_cents:amount,refunded_cents:0,paid_at:time}],s.corrections,s.cashRefunds);
    return a.json<{paymentId:string}>(rpc("ids_record_installation_cash",{p_installation_id:id,p_operation_key:key,p_amount_cents:amount,p_received_at:time,p_reference:"SYNTHETIC",p_notes:null,p_confirm_overpayment:amount>before.balanceDueCents,p_actor:"IDS shared administrator",p_expected_ledger:s.ledger,p_balance_before:before,p_balance_after:after,p_payment_status:financialPaymentStatus(after)}));};
  const first=await create();assert.deepEqual(await a.json(rpc("ids_create_installation",{p_payload:first.payload})),{id:first.id,public_token:first.public_token});
  await a.query("begin");await failure(a,rpc("ids_create_installation",{p_payload:{...first.payload,name:"Different"}}),/idempotency_conflict/);
  await failure(a,rpc("ids_create_installation",{p_payload:{...intake(slots[at].start_at),termsAcknowledged:"true"}}),/invalid_intake/);
  for(const start of ["2020-01-01T15:00:00Z",new Date(Date.parse(slots[at].start_at)+60000).toISOString(),new Date(Date.now()+200*86400000).toISOString()])await failure(a,rpc("ids_create_installation",{p_payload:intake(start)}),/slot_unavailable/);
  await a.query("rollback");checks.push("real intake, matching/conflicting retries, forged acknowledgements, past/grid/horizon rejection");
  // A blackout added after request submission must prevent approval.
  await a.query("begin");await a.query(`insert into public.demo_availability_exceptions(starts_at,ends_at) values(${literal(first.payload.startAt)},${literal(new Date(Date.parse(first.payload.startAt)+3600000).toISOString())})`);
  await failure(a,adminSql(await adminArgs(a,first.id,{action:"approve",operationKey:randomUUID(),reason:"SYNTHETIC"})),/slot_unavailable/);await a.query("rollback");
  await act(first.id,"approve");assert.equal((await adminState(a,first.id)).installation.deposit_due_cents,25000);
  await act(first.id,"cash",{status:"approved"});await assert.rejects(adminArgs(a,first.id,{action:"session_start",operationKey:randomUUID()}),/required_payment_not_confirmed/);
  await cash(first.id,100000);await act(first.id,"session_start");await act(first.id,"session_stop",{status:"paused"});
  let work=await adminState(a,first.id);const session=work.sessions[0];const original=structuredClone(session);
  assert.equal(await a.query(`select duration_seconds=extract(epoch from (ended_at-started_at))::double precision from public.installation_work_sessions where id=${literal(session.id)}`),'t');
  await act(first.id,"session_correct",{sessionId:session.id,durationMinutes:90});
  work=await adminState(a,first.id);assert.deepEqual(work.sessions.find(s=>s.id===session.id),original);assert.equal(cumulativeWorkMinutes(work.sessions),90);
  await act(first.id,"session_start");work=await adminState(a,first.id);assert.equal(cumulativeWorkMinutes(work.sessions),90);assert.equal(work.sessions.filter(s=>s.status==="running").length,1);
  await act(first.id,"safety",{status:"suspended",evidence:"Synthetic hazard photo reference"});work=await adminState(a,first.id);assert.equal(work.installation.safety_status,"suspended");assert.equal(work.sessions.filter(s=>s.status==="running").length,0);
  await assert.rejects(adminArgs(a,first.id,{action:"session_start",operationKey:randomUUID()}),/work_cannot_begin/);
  await cash(first.id,100);assert.equal((await adminState(a,first.id)).installation.safety_status,"suspended");
  await act(first.id,"safety",{status:"remediation_pending"});await act(first.id,"safety",{status:"remediation_approved",evidence:"Synthetic resolved hazard evidence"});await act(first.id,"session_start");
  assert.equal((await adminState(a,first.id)).installation.safety_reschedule_used,true);await act(first.id,"session_stop",{status:"paused"});
  checks.push("approval revalidation, cash approval is not receipt, funded work, pause/resume at 90 minutes, immutable time correction, safety/remediation");
  // Pricing/travel approval and materials use the shared ledger, with no duplicate
  // charge when another operation reconciles the same approved total again.
  const priced=await create();await act(priced.id,"travel",{oneWayMinutes:150});await act(priced.id,"approve");
  work=await adminState(a,priced.id);assert.equal(work.adjustments.reduce((n,a)=>n+a.amount_cents,0),7000);
  await act(priced.id,"travel",{oneWayMinutes:150});assert.equal((await adminState(a,priced.id)).adjustments.length,1);
  await act(priced.id,"pricing",{pricing:{...DEFAULT_PRICING,laborCents:90000}});assert.equal((await adminState(a,priced.id)).installation.pricing_snapshot.laborCents,90000);
  await act(priced.id,"materials",{actualCents:14000});await act(priced.id,"materials",{actualCents:14000});assert.equal((await adminState(a,priced.id)).adjustments.filter(a=>a.reconciliation_kind==="materials").length,1);
  const correctedSession=(await adminState(a,first.id)).sessions.find(s=>s.corrected_from_id===session.id)!;
  await act(first.id,"session_correct",{sessionId:correctedSession.id,durationMinutes:255});await act(first.id,"labor");await act(first.id,"labor");
  work=await adminState(a,first.id);assert.ok(work.adjustments.find(a=>a.reconciliation_kind==="labor")!.amount_cents>=3125);
  checks.push("saved pricing approvals, 150-minute each-way travel costs $70 once, actual materials, cumulative quarter-hour labor reconciliation");
  const failedCash=await create();await act(failedCash.id,"approve");await cash(failedCash.id,25000);await act(failedCash.id,"cash",{status:"approved"});await act(failedCash.id,"cash_failure");
  assert.equal((await adminState(a,failedCash.id)).installation.status,"cancelled");
  await act(failedCash.id,"cash_reschedule",{startAt:new Date(slots[at++].start_at).toISOString()});
  await assert.rejects(adminArgs(a,failedCash.id,{action:"cash_reschedule",startAt:slots[at].start_at,operationKey:randomUUID(),reason:"SYNTHETIC"}),/cash_reschedule_unavailable/);
  await a.query(`update public.installations set balance_due_at=clock_timestamp()-interval '1 hour' where id=${literal(failedCash.id)}`);
  await act(failedCash.id,"forfeit_deposit");work=await adminState(a,failedCash.id);assert.equal(work.installation.deposit_forfeited_cents,25000);assert.equal(work.installation.payment_status,"forfeited");
  await cash(failedCash.id,100);work=await adminState(a,failedCash.id);assert.equal(work.installation.status,"terminated");assert.equal(work.installation.payment_status,"forfeited");
  checks.push("one cash-failure reschedule, normal deadline, entire deposit forfeiture, late receipt cannot reopen work");
  // Atomic failure after adjustment insertion, same operation retry, stale state.
  const operation={action:"materials",operationKey:randomUUID(),reason:"SYNTHETIC forced rollback",actualCents:13000};
  const args=await adminArgs(a,priced.id,operation),before=await adminState(a,priced.id);
  await a.query("reset role");await a.query("begin");await a.query(`alter table public.installation_audit_events add constraint workflow_review_failure check(details->>'operationKey'<>${literal(operation.operationKey)})`);await a.query("set local role service_role");
  await failure(a,adminSql(args),/workflow_review_failure/);assert.deepEqual(await adminState(a,priced.id),before);await a.query("rollback");await a.query("set role service_role");
  await a.json(adminSql(args));assert.equal((await a.json<{replayed:boolean}>(adminSql(args))).replayed,true);
  const stale=await adminArgs(b,priced.id,{action:"cash",operationKey:randomUUID(),reason:"SYNTHETIC",status:"approved"});
  await a.query("begin");await b.query("begin");await a.query(`insert into public.installation_adjustments(installation_id,kind,description,amount_cents,created_by) values(${literal(priced.id)},'other','SYNTHETIC concurrent charge',1,'IDS shared administrator')`);
  const blocked=b.raw(adminSql(stale));await blockedByA();await a.query("commit");assert.match((await blocked).message,/installation_state_changed/);await b.query("rollback");
  checks.push("atomic admin rollback, same-key replay, concurrent ledger change rejected without partial work");
  // Calendar occupancy under two actual connections, in both writer orders.
  const demo=(start:string)=>`insert into public.demo_requests(customer_name,customer_email,customer_phone,property_address,requested_start_at,requested_end_at,source,idempotency_key,appointment_type,duration_minutes) values('SYNTHETIC DEMO','demo@example.invalid','000-000-0000','SYNTHETIC PROPERTY',${literal(start)},${literal(new Date(Date.parse(start)+4*3600000).toISOString())},'ids_in_action',${literal(randomUUID())},'demo',240)`;
  for(const demoFirst of [true,false]){
    const slot=slots[at++],request=rpc("ids_create_installation",{p_payload:intake(slot.start_at)});
    await a.query("begin");await b.query("begin");await a.query(demoFirst?demo(slot.start_at):request);
    const competing=b.raw(demoFirst?request:demo(slot.start_at));await blockedByA();await a.query("commit");assert.match((await competing).message,/slot_unavailable|slot_conflict/);await b.query("rollback");
  }
  const daySlot=slots.find((s,index)=>index>=at&&new Date(s.start_at).getUTCHours()===14)!;assert.ok(daySlot);
  await a.query("begin");await a.query(demo(daySlot.start_at));
  const adjacent=new Date(Date.parse(daySlot.start_at)+4*3600000).toISOString();
  assert.equal(await a.query(`select public.ids_installation_slot_available(${literal(adjacent)},${literal(new Date(Date.parse(adjacent)+4*3600000).toISOString())})`),"t");
  await failure(a,demo(adjacent),/demo_requests_demo_buffer_no_overlap/);await a.query("rollback");
  checks.push("two-session demo-first and installation-first conflicts, installation adjacency allowed, unchanged demo/demo hour buffer");
  // Spring gap and repeated fall hour are tested against an explicit clock;
  // operational callers always use the database clock default.
  await a.query("begin");await a.query("update public.demo_availability_rules set enabled=true,start_time='01:00',end_time='18:00' where weekday=0");
  assert.equal(await a.query("select public.ids_installation_slot_available('2026-11-01T06:00Z','2026-11-01T10:00Z',null,'2026-10-01T00:00Z')"),"t");
  assert.equal(await a.query("select public.ids_installation_slot_available('2026-11-01T07:00Z','2026-11-01T11:00Z',null,'2026-10-01T00:00Z')"),"f");
  await a.query("update public.demo_availability_rules set start_time='02:00' where weekday=0");
  assert.equal(await a.query("select public.ids_installation_slot_available('2027-03-14T08:00Z','2027-03-14T12:00Z',null,'2027-03-01T00:00Z')"),"f");
  await a.query("rollback");checks.push("Chicago DST spring gap and explicit earlier repeated fall-hour policy");
  return {passed:true,checks,connections:[Number(await a.query("select pg_backend_pid()")),Number(await b.query("select pg_backend_pid()"))]};
}
