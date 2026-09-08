// REAL PostgreSQL exercises. No connections or tests at import time.
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { installationBalance, ledgerSnapshot, financialPaymentStatus, type InstallationPayment, type InstallationAdjustment, type InstallationCashCorrection, type InstallationCashRefund } from "../../lib/installations/accounting";
import { type PsqlConnection, literal, jsonLiteral } from "./psql";
type Ledger = { pricing: { laborCents: number; materialsAllowanceCents: number }; payments: InstallationPayment[]; adjustments: InstallationAdjustment[]; corrections: InstallationCashCorrection[]; cashRefunds: InstallationCashRefund[] };
type Recorded = { paymentId: string; correctionId?: string; refundId?: string; recordedAt: string; replayed: boolean; balanceAtRecording: ReturnType<typeof installationBalance> };
type Args = Record<string, unknown>;
export const fixtureId = (n: number) => "a1000000-0000-4000-8000-" + String(n).padStart(12, "0");
const depositId = (n: number) => "a4000000-0000-4000-8000-" + String(n).padStart(12, "0");
const key = (n: number) => { assert.ok(n >= 1 && n <= 999); return "b1000000-0000-4000-8000-" + String(n).padStart(12, "0"); };
const extraId = (n: number) => "c1000000-0000-4000-8000-" + String(n).padStart(12, "0");
const actor = "IDS shared administrator", receivedAt = "2026-09-01T17:30:00.000Z";
async function ledger(c: PsqlConnection, n: number): Promise<Ledger> {
  return c.json<Ledger>(`select json_build_object('pricing',i.pricing_snapshot,
    'payments',coalesce((select json_agg(p order by id) from public.installation_payments p where p.installation_id=i.id),'[]'::json),
    'adjustments',coalesce((select json_agg(a order by id) from public.installation_adjustments a where a.installation_id=i.id),'[]'::json),
    'corrections',coalesce((select json_agg(r order by id) from public.installation_cash_corrections r where r.installation_id=i.id),'[]'::json),
    'cashRefunds',coalesce((select json_agg(r order by id) from public.installation_cash_refunds r where r.installation_id=i.id),'[]'::json))
    from public.installations i where id=${literal(fixtureId(n))}`);
}
const balance = (l: Ledger) => installationBalance(l.pricing, l.adjustments, l.payments, l.corrections, l.cashRefunds);
async function receiptArgs(c: PsqlConnection, n: number, amount: number, operation: number, confirm = false): Promise<Args> {
  const l = await ledger(c, n), before = balance(l);
  const after = installationBalance(l.pricing, l.adjustments, [...l.payments, {
    id: key(operation), method: "cash", purpose: "cash", status: "paid", amount_cents: amount, refunded_cents: 0, paid_at: receivedAt,
  }], l.corrections, l.cashRefunds);
  return { p_installation_id: fixtureId(n), p_operation_key: key(operation), p_amount_cents: amount, p_received_at: receivedAt,
    p_reference: "SYNTHETIC", p_notes: "Synthetic database test", p_confirm_overpayment: confirm, p_actor: actor,
    p_expected_ledger: ledgerSnapshot(l.pricing,l.adjustments,l.payments,l.corrections,l.cashRefunds), p_balance_before: before, p_balance_after: after, p_payment_status: financialPaymentStatus(after) };
}
async function correctionArgs(c: PsqlConnection, n: number, original: string, amount: number, operation: number): Promise<Args> {
  const l = await ledger(c, n), before = balance(l);
  const after = installationBalance(l.pricing,l.adjustments,l.payments,[...l.corrections,{id:key(operation),original_payment_id:original,amount_cents:amount}],l.cashRefunds);
  return { p_installation_id: fixtureId(n), p_operation_key:key(operation),p_original_payment_id:original,p_amount_cents:amount,
    p_reason:"Synthetic recording mistake; no cash returned",p_actor:actor,p_expected_ledger:ledgerSnapshot(l.pricing,l.adjustments,l.payments,l.corrections,l.cashRefunds),
    p_balance_before:before,p_balance_after:after,p_payment_status:financialPaymentStatus(after) };
}
async function refundArgs(c: PsqlConnection, n: number, original: string, amount: number, operation: number): Promise<Args> {
  const l = await ledger(c,n), before = balance(l);
  const after = installationBalance(l.pricing,l.adjustments,l.payments,l.corrections,[...l.cashRefunds,{id:key(operation),original_payment_id:original,amount_cents:amount}]);
  return {p_installation_id:fixtureId(n),p_operation_key:key(operation),p_original_payment_id:original,p_amount_cents:amount,
    p_reason:"Synthetic actual cash return",p_returned_at:receivedAt,p_reference:"SYNTHETIC RETURN",p_confirm_money_returned:true,p_actor:actor,
    p_expected_ledger:ledgerSnapshot(l.pricing,l.adjustments,l.payments,l.corrections,l.cashRefunds),p_balance_before:before,p_balance_after:after,p_payment_status:financialPaymentStatus(after)};
}
export function rpcSql(name: string, args: Args) {
  assert.ok(["ids_record_installation_cash","ids_correct_installation_cash","ids_confirm_installation_cash","ids_record_installation_cash_refund"].includes(name));
  return `select public.${name}(` + Object.entries(args).map(([k,v]) => {
    assert.match(k,/^p_[a-z_]+$/);
    return `${k} => ` + (["p_expected_ledger","p_balance_before","p_balance_after","p_payload"].includes(k) ? jsonLiteral(v) : v === null ? "null" : typeof v === "object" ? jsonLiteral(v) : typeof v === "boolean" ? String(v) : typeof v === "number" ? String(v) : literal(v));
  }).join(",") + ")";
}
async function expectError(c: PsqlConnection, sql: string, code: string, message?: string) {
  await c.query("savepoint expected_failure");
  const result = await c.raw(sql);
  await c.query("rollback to savepoint expected_failure");
  assert.equal(result.code, code, `Expected ${code}; got ${result.code}`);
  if (message) assert.ok(result.message.includes(message), `Expected ${message}; got ${result.message}`);
}
async function operationCounts(c: PsqlConnection, operation: number) {
  return c.json<{receipts:number;corrections:number;audits:number}>(`select json_build_object(
    'receipts',(select count(*) from public.installation_payments where idempotency_key=${literal("cash:"+key(operation))}),
    'corrections',(select count(*) from public.installation_cash_corrections where idempotency_key=${literal("cash-correction:"+key(operation))}),
    'audits',(select count(*) from public.installation_audit_events where details->>'operationKey'=${literal(key(operation))}))`);
}
async function waitUntilBlocked(a: PsqlConnection, aPid: number, bPid: number) {
  const deadline = Date.now()+5000;
  do { if (await a.query(`select ${aPid}=any(pg_blocking_pids(${bPid}))`) === "t") return; await delay(20); } while (Date.now()<deadline);
  throw new Error("Expected real second-session blocking was not observed");
}
export async function runDatabaseTests(connect: () => PsqlConnection, record: (value: unknown) => void, verifySession: (c: PsqlConnection) => Promise<void>) {
  const a=connect(), b=connect();
  await verifySession(a); await verifySession(b);
  const aPid=Number(await a.query("select pg_backend_pid()")), bPid=Number(await b.query("select pg_backend_pid()"));
  assert.notEqual(aPid,bPid);
  for (const c of [a,b]) { await c.query("set statement_timeout='15s'"); await c.query("set lock_timeout='10s'"); await c.query("set role service_role"); }
  const passed: string[]=[];
  const call = async (c: PsqlConnection, name: string, args: Args) => {
    const value = await c.json<Recorded>(rpcSql(name,args));
    record({ function:name,operationKey:args.p_operation_key,installationId:args.p_installation_id,...value }); return value;
  };
  const receipt = async (n:number,amount:number,op:number,confirm=false) => call(a,"ids_record_installation_cash",await receiptArgs(a,n,amount,op,confirm));
  const correction = async(n:number,id:string,amount:number,op:number)=>call(a,"ids_correct_installation_cash",await correctionArgs(a,n,id,amount,op));
  // Real ACL/RLS checks include effective inherited permissions.
  await a.query("reset role");
  const functions = await a.json<string[]>("select json_agg(p.oid::regprocedure::text order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('ids_record_installation_cash','ids_correct_installation_cash','ids_confirm_installation_cash','ids_validate_cash_balance','ids_validate_cash_delta','ids_installation_ledger','ids_guard_cash_correction','ids_lock_installation_ledger','ids_protect_cash_receipt','ids_check_shared_schedule','ids_guard_cash_refund','ids_record_installation_cash_refund')");
  assert.equal(functions.length,12);
  for (const fn of functions) {
    assert.equal(await a.query(`select has_function_privilege('service_role',${literal(fn)},'execute')`),"t");
    for (const role of ["anon","authenticated"]) assert.equal(await a.query(`select has_function_privilege(${literal(role)},${literal(fn)},'execute')`),"f");
  }
  assert.equal(await a.query("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where n.nspname='public' and p.proname like 'ids_%' and acl.grantee=0 and acl.privilege_type='EXECUTE'"),"0");
  for (const privilege of ["USAGE","SELECT"]) assert.equal(await a.query(`select has_sequence_privilege('service_role','public.installation_audit_events_id_seq',${literal(privilege)})`),"t");
  assert.equal(await a.query("select has_sequence_privilege('service_role','public.installation_audit_events_id_seq','UPDATE')"),"f");
  for(const role of ["anon","authenticated"]) {
    assert.equal(await a.query(`select pg_has_role(${literal(role)},'service_role','MEMBER')`),"f");
    for (const privilege of ["USAGE","SELECT","UPDATE"]) assert.equal(await a.query(`select has_sequence_privilege(${literal(role)},'public.installation_audit_events_id_seq',${literal(privilege)})`),"f");
    for(const table of ["installations","installation_payments","installation_cash_corrections","installation_cash_refunds","installation_audit_events"])
      for(const privilege of ["SELECT","INSERT","UPDATE","DELETE"]) assert.equal(await a.query(`select has_table_privilege(${literal(role)},'public.${table}',${literal(privilege)})`),"f");
    await a.query("begin"); await a.query(`set local role ${role}`);
    await expectError(a,`select public.ids_confirm_installation_cash(${literal(fixtureId(1))},${literal(key(1))},'receipt','{}')`,"42501");
    await expectError(a,"insert into public.installation_cash_corrections default values","42501"); await a.query("rollback");
  }
  assert.equal(await a.query("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('installation_pricing_settings','installations','installation_payments','installation_adjustments','installation_work_sessions','installation_audit_events','installation_cash_corrections','installation_cash_refunds') and c.relrowsecurity"),"8");
  assert.equal(await a.query("select has_table_privilege('service_role','public.installation_cash_corrections','UPDATE') or has_table_privilege('service_role','public.installation_cash_corrections','DELETE')"),"f");
  await a.query("set role service_role"); passed.push("effective function/table/sequence ACLs, role inheritance and RLS");

  // A-E use the real TypeScript calculator against persisted fixture ledgers.
  assert.deepEqual([balance(await ledger(a,1)).netPaidCents,balance(await ledger(a,1)).balanceDueCents],[25000,75000]);
  const full=await receipt(1,75000,1); assert.equal(full.balanceAtRecording.balanceDueCents,0);
  const partial=await receipt(2,5000,2); assert.equal(partial.balanceAtRecording.balanceDueCents,70000);
  await a.query(`update public.installation_payments set status='partially_refunded',refunded_cents=5000 where id=${literal(depositId(3))}`);
  assert.equal(balance(await ledger(a,3)).balanceDueCents,80000);
  await a.query(`update public.installation_payments set amount_cents=100000 where id=${literal(depositId(4))}`);
  await a.query(`insert into public.installation_adjustments(id,installation_id,kind,description,amount_cents,created_by) values(${literal(extraId(1))},${literal(fixtureId(4))},'credit','Synthetic materials credit',-6000,${literal(actor)})`);
  assert.equal(balance(await ledger(a,4)).customerCreditCents,6000);
  await a.query(`update public.installation_payments set status='partially_refunded',refunded_cents=6000 where id=${literal(depositId(4))}`);
  assert.equal(balance(await ledger(a,4)).customerCreditCents,0);
  await a.query(`insert into public.installation_payments(id,installation_id,purpose,method,status,amount_cents,refunded_cents,idempotency_key,paid_at,original_payment_id) values
    (${literal(extraId(2))},${literal(fixtureId(4))},'refund','stripe','paid',6000,0,'synthetic-refund-mirror',${literal(receivedAt)},${literal(depositId(4))}),
    (${literal(extraId(3))},${literal(fixtureId(4))},'refund','stripe','pending',1000,0,'synthetic-pending-refund',null,${literal(depositId(4))}),
    (${literal(extraId(4))},${literal(fixtureId(4))},'balance','stripe','failed',20000,0,'synthetic-failed',null,null),
    (${literal(extraId(5))},${literal(fixtureId(4))},'balance','stripe','pending',20000,0,'synthetic-pending',null,null)`);
  const e=balance(await ledger(a,4));assert.equal(e.netPaidCents,94000);assert.equal(e.pendingRefundsCents,1000);assert.equal(e.completedRefundsCents,6000);
  for (const n of [1,2,3,4]) { const l=await ledger(a,n); assert.deepEqual(await a.json(`select public.ids_installation_ledger(${literal(fixtureId(n))})`),ledgerSnapshot(l.pricing,l.adjustments,l.payments,l.corrections,l.cashRefunds)); }
  passed.push("approved A-E accounting examples and refund mirrors");

  // Correction example and original immutability; no cash payout semantics.
  const original=await a.json(`select row_to_json(p) from public.installation_payments p where id=${literal(full.paymentId)}`);
  const corrected=await correction(1,full.paymentId,67500,3);
  assert.equal(corrected.balanceAtRecording.netPaidCents,32500);assert.equal(corrected.balanceAtRecording.approvedChargesCents,100000);
  assert.equal(corrected.balanceAtRecording.completedRefundsCents,0);
  assert.deepEqual(await a.json(`select row_to_json(p) from public.installation_payments p where id=${literal(full.paymentId)}`),original);
  const savedPayload = await a.json(`select cash_operation_payload from public.installation_payments where id=${literal(full.paymentId)}`);
  const confirmationArgs={p_installation_id:fixtureId(1),p_operation_key:key(1),p_kind:"receipt",p_payload:savedPayload};
  const replay=await call(a,"ids_confirm_installation_cash",confirmationArgs);
  assert.equal(replay.balanceAtRecording.balanceDueCents,0);assert.equal(balance(await ledger(a,1)).balanceDueCents,67500);
  await a.query("begin");
  await expectError(a,`update public.installation_payments set amount_cents=1 where id=${literal(full.paymentId)}`,"P0001","cash_receipt_is_immutable");
  await expectError(a,`delete from public.installation_payments where id=${literal(full.paymentId)}`,"P0001");
  await expectError(a,`update public.installation_cash_corrections set reason='changed' where id=${literal(corrected.correctionId)}`,"42501");
  await expectError(a,rpcSql("ids_confirm_installation_cash",{...confirmationArgs,p_installation_id:fixtureId(2)}),"P0001","cash_operation_conflict");
  await a.query(`update public.installations set pricing_snapshot=null where id=${literal(fixtureId(1))}`);
  assert.equal((await a.json<Recorded>(rpcSql("ids_confirm_installation_cash",confirmationArgs))).paymentId,full.paymentId);
  await a.query("rollback"); passed.push("$750/$75 correction, original preservation, saved snapshot and independent confirmation");
  // Both balance objects: every field, missing/null/non-number/fractional/bounds.
  const valid=await receiptArgs(a,5,5000,10);
  const moneyFields=Object.keys(valid.p_balance_before as object).filter(k=>k!=="paymentState");
  await a.query("begin");
  for(const side of ["p_balance_before","p_balance_after"]) {
    await expectError(a,rpcSql("ids_record_installation_cash",{...valid,[side]:null}).replace("'null'::jsonb","null"),"P0001","invalid_cash_balance_result");
    for(const malformed of [null,[],true,0,"invalid"]) await expectError(a,rpcSql("ids_record_installation_cash",{...valid,[side]:malformed}),"P0001","invalid_cash_balance_result");
    for(const field of moneyFields) for(const malformed of [undefined,null,"0",0.5,9007199254740992,{},[]]) {
      const value={...(valid[side] as Args),[field]:malformed};if(malformed===undefined)delete value[field];
      await expectError(a,rpcSql("ids_record_installation_cash",{...valid,[side]:value}),"P0001","invalid_cash_balance_result");
    }
    for(const field of moneyFields.filter(f=>!["adjustmentCents","balanceCents"].includes(f)))
      await expectError(a,rpcSql("ids_record_installation_cash",{...valid,[side]:{...(valid[side] as Args),[field]:-1}}),"P0001","invalid_cash_balance_result");
  }
  for(const field of ["netPaidCents","balanceCents","balanceDueCents","customerCreditCents","receivedCents","receiptCorrectionsCents","completedRefundsCents"])
    await expectError(a,rpcSql("ids_record_installation_cash",{...valid,p_balance_before:{...(valid.p_balance_before as Args),[field]:123456}}),"P0001","invalid_cash_balance_result");
  await expectError(a,rpcSql("ids_record_installation_cash",{...valid,p_payment_status:"paid"}),"P0001");
  const excess=await receiptArgs(a,5,80000,11);
  await expectError(a,rpcSql("ids_record_installation_cash",excess),"P0001","cash_overpayment_confirmation_required");
  await expectError(a,rpcSql("ids_record_installation_cash",{...excess,p_balance_before:{...(excess.p_balance_before as Args),balanceDueCents:999999}}),"P0001","invalid_cash_balance_result");
  for (const bad of [{p_amount_cents:0},{p_amount_cents:-1},{p_amount_cents:null},{p_actor:null},{p_operation_key:null},{p_received_at:null},{p_received_at:"infinity"},{p_received_at:"2099-01-01"},{p_received_at:"2026-09-01T17:30:00.000001Z"},{p_confirm_overpayment:null},{p_reference:"x".repeat(201)},{p_notes:"x".repeat(2001)}])
    await expectError(a,rpcSql("ids_record_installation_cash",{...valid,...bad}),"P0001");
  await a.query("rollback");
  assert.deepEqual(await operationCounts(a,10),{receipts:0,corrections:0,audits:0});
  assert.equal((await receipt(5,80000,11,true)).balanceAtRecording.customerCreditCents,5000);
  passed.push("both balance contracts, null/type/bounds/arithmetic, counterexample and overpayment consent");

  // Atomic failures AFTER the first insert and at audit completion, for both RPCs.
  for(const kind of ["receipt","correction"] as const) for(const stage of ["financial","audit"] as const) {
    const n=kind==="receipt"?(stage==="financial"?6:17):(stage==="financial"?7:18), op=kind==="receipt"?(stage==="financial"?20:21):(stage==="financial"?22:23);
    let originalId=full.paymentId;
    if(kind==="correction") { const l=await ledger(a,n), existing=l.payments.find(p=>p.method==="cash"); originalId=existing?.id ?? (await receipt(n,75000,stage==="financial"?19:18)).paymentId; }
    const args=kind==="receipt"?await receiptArgs(a,n,75000,op):await correctionArgs(a,n,originalId,5000,op);
    const before=await a.json<{updated_at:string}>(`select row_to_json(i) from public.installations i where id=${literal(fixtureId(n))}`);
    const work=await a.json(`select coalesce(json_agg(w),'[]'::json) from public.installation_work_sessions w where installation_id=${literal(fixtureId(n))}`);
    await a.query("reset role");await a.query("begin");
    // Reject a guaranteed status transition or this operation's audit only.
    const constraint=stage==="financial"
      ? `alter table public.installations add constraint cash_review_forced_failure check (id<>${literal(fixtureId(n))}::uuid or payment_status<>${literal(args.p_payment_status)})`
      : `alter table public.installation_audit_events add constraint cash_review_forced_failure check (installation_id<>${literal(fixtureId(n))}::uuid or details->>'operationKey'<>${literal(key(op))})`;
    await a.query(constraint);await a.query("set local role service_role");
    await expectError(a,rpcSql(kind==="receipt"?"ids_record_installation_cash":"ids_correct_installation_cash",args),"23514");
    assert.deepEqual(await operationCounts(a,op),{receipts:0,corrections:0,audits:0});
    assert.deepEqual(await a.json(`select row_to_json(i) from public.installations i where id=${literal(fixtureId(n))}`),before);
    assert.deepEqual(await a.json(`select coalesce(json_agg(w),'[]'::json) from public.installation_work_sessions w where installation_id=${literal(fixtureId(n))}`),work);
    await a.query("rollback");await a.query("set role service_role");
    assert.deepEqual(await operationCounts(b,op),{receipts:0,corrections:0,audits:0});
    // Same key can succeed once the deliberate failure is removed.
    await call(a,kind==="receipt"?"ids_record_installation_cash":"ids_correct_installation_cash",args);
    const counts=await operationCounts(b,op);assert.equal(counts.audits,1);assert.equal(kind==="receipt"?counts.receipts:counts.corrections,1);
  }
  passed.push("receipt/correction failure after insertion and before audit; safe same-key retry");

  // Real simultaneous same-key RPC calls: B waits until A commits.
  const simultaneous=await receiptArgs(a,8,5000,30);
  await a.query("begin");await b.query("begin");
  const first=await call(a,"ids_record_installation_cash",simultaneous);
  const pending=b.json<Recorded>(rpcSql("ids_record_installation_cash",simultaneous));
  await waitUntilBlocked(a,aPid,bPid);await a.query("commit");
  const second=await pending;await b.query("commit");record({function:"ids_record_installation_cash",operationKey:key(30),...second});
  assert.equal(second.paymentId,first.paymentId);assert.equal(second.recordedAt,first.recordedAt);assert.equal(second.replayed,true);
  assert.deepEqual(await operationCounts(a,30),{receipts:1,corrections:0,audits:1});
  const conflictArgs=await receiptArgs(a,8,5000,31);
  await a.query("begin");await b.query("begin");await call(a,"ids_record_installation_cash",conflictArgs);
  const conflict=b.raw(rpcSql("ids_record_installation_cash",{...conflictArgs,p_notes:"Different details"}));
  await waitUntilBlocked(a,aPid,bPid);await a.query("commit");
  const conflictResult=await conflict;assert.equal(conflictResult.code,"P0001");assert.match(conflictResult.message,/cash_operation_conflict/);await b.query("rollback");
  assert.deepEqual(await operationCounts(a,31),{receipts:1,corrections:0,audits:1});
  const left=await receiptArgs(a,9,50000,32),right=await receiptArgs(b,9,50000,33);
  await a.query("begin");await b.query("begin");await call(a,"ids_record_installation_cash",left);
  const competing=b.raw(rpcSql("ids_record_installation_cash",right));
  await waitUntilBlocked(a,aPid,bPid);await a.query("commit");
  assert.match((await competing).message,/installation_ledger_changed/);await b.query("rollback");
  await b.query("begin");await expectError(b,rpcSql("ids_record_installation_cash",await receiptArgs(b,9,50000,33)),"P0001","cash_overpayment_confirmation_required");await b.query("rollback");
  await call(b,"ids_record_installation_cash",await receiptArgs(b,9,50000,33,true));
  passed.push("two-connection identical/conflicting keys, competing receipts, fresh overpayment review");
  // Another child writer changes the ledger while cash waits on the parent.
  const stale=await receiptArgs(b,10,5000,40);
  await a.query("begin");await b.query("begin");
  await a.query(`insert into public.installation_adjustments(id,installation_id,kind,description,amount_cents,created_by) values(${literal(extraId(10))},${literal(fixtureId(10))},'other','Synthetic concurrent charge',1000,${literal(actor)})`);
  const changed=b.raw(rpcSql("ids_record_installation_cash",stale));
  await waitUntilBlocked(a,aPid,bPid);await a.query("commit");assert.match((await changed).message,/installation_ledger_changed/);await b.query("rollback");
  await call(b,"ids_record_installation_cash",await receiptArgs(b,10,5000,40));
  passed.push("child-writer ledger lock and stale-snapshot rejection");

  // Corrections: same-key concurrent replay and different-key cap competition.
  const capReceipt=await receipt(11,75000,50);
  const sameCorrection=await correctionArgs(a,11,capReceipt.paymentId,10000,51);
  await a.query("begin");await b.query("begin");
  const c1=await call(a,"ids_correct_installation_cash",sameCorrection);
  const c2Pending=b.json<Recorded>(rpcSql("ids_correct_installation_cash",sameCorrection));
  await waitUntilBlocked(a,aPid,bPid);await a.query("commit");const c2=await c2Pending;await b.query("commit");
  record({function:"ids_correct_installation_cash",operationKey:key(51),...c2});
  assert.equal(c1.correctionId,c2.correctionId);assert.equal(c2.replayed,true);
  assert.deepEqual(await operationCounts(a,51),{receipts:0,corrections:1,audits:1});
  const ca=await correctionArgs(a,11,capReceipt.paymentId,40000,52),cb=await correctionArgs(b,11,capReceipt.paymentId,40000,53);
  await a.query("begin");await b.query("begin");await call(a,"ids_correct_installation_cash",ca);
  const cbPending=b.raw(rpcSql("ids_correct_installation_cash",cb));
  await waitUntilBlocked(a,aPid,bPid);await a.query("commit");assert.match((await cbPending).message,/installation_ledger_changed/);await b.query("rollback");
  // Fresh snapshot, deliberately over-cap delta: SQL must enforce the cap.
  const capLedger=await ledger(b,11);const remaining=await correctionArgs(b,11,capReceipt.paymentId,25000,54);
  await b.query("begin");
  await expectError(b,rpcSql("ids_correct_installation_cash",{...cb,p_expected_ledger:ledgerSnapshot(capLedger.pricing,capLedger.adjustments,capLedger.payments,capLedger.corrections,capLedger.cashRefunds)}),"P0001","cash_correction_exceeds_eligible_amount");
  await expectError(b,rpcSql("ids_correct_installation_cash",{...sameCorrection,p_reason:"Conflicting correction reason"}),"P0001","cash_operation_conflict");
  await b.query("rollback");await call(b,"ids_correct_installation_cash",remaining);
  assert.equal(balance(await ledger(a,11)).receiptCorrectionsCents,75000);
  await a.query(`insert into public.installation_payments(id,installation_id,purpose,method,status,amount_cents,refunded_cents,idempotency_key,paid_at) values(${literal(extraId(20))},${literal(fixtureId(12))},'cash','cash','partially_refunded',75000,5000,'synthetic-legacy-refunded-cash',${literal(receivedAt)})`);
  const capped=await correctionArgs(a,12,extraId(20),70000,55);
  await a.query("begin");await expectError(a,rpcSql("ids_correct_installation_cash",{...capped,p_amount_cents:70001}),"P0001","cash_correction_exceeds_eligible_amount");await a.query("rollback");
  await call(a,"ids_correct_installation_cash",capped);
  passed.push("simultaneous corrections, partial/full caps including prior refunds, conflicting retries");

  // Actual cash return: two sessions, correction/refund cap competition, rollback
  // at both later writes, immutable original, and confirmation without a ledger.
  const refundReceipt=await receipt(19,75000,80);
  const originalRefundReceipt=await a.json(`select row_to_json(p) from public.installation_payments p where id=${literal(refundReceipt.paymentId)}`);
  const refundRequest=await refundArgs(a,19,refundReceipt.paymentId,5000,81);
  await a.query("begin");await b.query("begin");
  const refund1=await call(a,"ids_record_installation_cash_refund",refundRequest);
  const refund2Pending=b.json<Recorded>(rpcSql("ids_record_installation_cash_refund",refundRequest));
  await waitUntilBlocked(a,aPid,bPid);await a.query("commit");const refund2=await refund2Pending;await b.query("commit");
  assert.equal(refund1.refundId,refund2.refundId);assert.equal(refund2.replayed,true);
  assert.equal(balance(await ledger(a,19)).completedRefundsCents,5000);
  assert.equal(await a.query(`select count(*) from public.installation_cash_refunds where idempotency_key=${literal("cash-refund:"+key(81))}`),"1");
  await a.query("begin");
  await expectError(a,rpcSql("ids_record_installation_cash_refund",{...refundRequest,p_reason:"Different details"}),"P0001","cash_operation_conflict");
  const smallRefund=await refundArgs(a,19,refundReceipt.paymentId,100,82);
  for(const forged of [{p_confirm_money_returned:false},{p_confirm_money_returned:null},{p_actor:"Browser actor"},{p_returned_at:"infinity"},{p_returned_at:"2099-01-01"},{p_amount_cents:0},{p_reason:null},{p_reference:"x".repeat(201)},{p_balance_after:null},{p_expected_ledger:null}])
    await expectError(a,rpcSql("ids_record_installation_cash_refund",{...smallRefund,...forged}),"P0001");
  await expectError(a,`update public.installation_cash_refunds set amount_cents=1 where id=${literal(refund1.refundId)}`,"42501");
  await expectError(a,`delete from public.installation_cash_refunds where id=${literal(refund1.refundId)}`,"42501");
  await a.query(`update public.installations set pricing_snapshot=null where id=${literal(fixtureId(19))}`);
  const refundPayload=await a.json(`select operation_payload from public.installation_cash_refunds where id=${literal(refund1.refundId)}`);
  assert.equal((await a.json<Recorded>(rpcSql("ids_confirm_installation_cash",{p_installation_id:fixtureId(19),p_operation_key:key(81),p_kind:"refund",p_payload:refundPayload}))).refundId,refund1.refundId);
  await a.query("rollback");
  const refundRace=await refundArgs(a,19,refundReceipt.paymentId,40000,83), correctionRace=await correctionArgs(b,19,refundReceipt.paymentId,40000,84);
  await a.query("begin");await b.query("begin");await call(a,"ids_record_installation_cash_refund",refundRace);
  const correctionRacePending=b.raw(rpcSql("ids_correct_installation_cash",correctionRace));
  await waitUntilBlocked(a,aPid,bPid);await a.query("commit");assert.match((await correctionRacePending).message,/installation_ledger_changed/);await b.query("rollback");
  const finalCorrection=await correctionArgs(b,19,refundReceipt.paymentId,30000,84);
  await b.query("begin");await expectError(b,rpcSql("ids_correct_installation_cash",{...finalCorrection,p_amount_cents:30001}),"P0001","cash_correction_exceeds_eligible_amount");await b.query("rollback");
  await call(b,"ids_correct_installation_cash",finalCorrection);
  await a.query("begin");
  const exhausted=await ledger(a,19);
  await expectError(a,rpcSql("ids_record_installation_cash_refund",{...smallRefund,p_expected_ledger:ledgerSnapshot(exhausted.pricing,exhausted.adjustments,exhausted.payments,exhausted.corrections,exhausted.cashRefunds)}),"P0001","cash_refund_exceeds_eligible_amount");
  await a.query("rollback");
  assert.deepEqual(await a.json(`select row_to_json(p) from public.installation_payments p where id=${literal(refundReceipt.paymentId)}`),originalRefundReceipt);
  const rollbackReceipt=await receipt(20,75000,85);
  for(const [index,stage] of ["financial","audit"].entries()) {
    const args=await refundArgs(a,20,rollbackReceipt.paymentId,1000,86+index);
    const state=await a.json(`select row_to_json(i) from public.installations i where id=${literal(fixtureId(20))}`);
    await a.query("reset role");await a.query("begin");
    await a.query(stage==="financial" ? `alter table public.installations add constraint cash_refund_forced_failure check (id<>${literal(fixtureId(20))}::uuid or updated_at='2000-01-01'::timestamptz) not valid` : `alter table public.installation_audit_events add constraint cash_refund_forced_failure check (details->>'operationKey'<>${literal(key(86+index))})`);
    await a.query("set local role service_role");await expectError(a,rpcSql("ids_record_installation_cash_refund",args),"23514");
    assert.equal(await a.query(`select count(*) from public.installation_cash_refunds where idempotency_key=${literal("cash-refund:"+key(86+index))}`),"0");
    assert.deepEqual(await a.json(`select row_to_json(i) from public.installations i where id=${literal(fixtureId(20))}`),state);
    await a.query("rollback");await a.query("set role service_role");await call(a,"ids_record_installation_cash_refund",args);
  }
  passed.push("actual cash returns: effective ACLs, immutable evidence, caps, same-key concurrency, correction race, forged inputs, both rollback stages and retry");
  const cases=[{status:"suspended",safety_status:"suspended"},{status:"terminated",safety_status:"terminated",payment_status:"forfeited"},{status:"cancelled",special_cash_failure_reschedule:true,reschedule_opportunity_used:true},{status:"completed"}];
  for(const [index,state] of cases.entries()) {
    const n=13+index;
    await a.query(`update public.installations set ${Object.entries(state).map(([k,v])=>`${k}=${typeof v==="boolean"?v:literal(v)}`).join(",")} where id=${literal(fixtureId(n))}`);
    const before=await a.json<Record<string,unknown>>(`select row_to_json(i) from public.installations i where id=${literal(fixtureId(n))}`);
    const r=await receipt(n,5000,60+index);await correction(n,r.paymentId,1000,70+index);
    await call(a,"ids_record_installation_cash_refund",await refundArgs(a,n,r.paymentId,1000,90+index));
    const after=await a.json<Record<string,unknown>>(`select row_to_json(i) from public.installations i where id=${literal(fixtureId(n))}`);
    for(const field of Object.keys(before).filter(f=>!["payment_status","updated_at"].includes(f))) assert.deepEqual(after[field],before[field],field);
    if(before.payment_status==="forfeited")assert.equal(after.payment_status,"forfeited");
  }
  passed.push("safety/lifecycle/forfeiture/reschedule preservation for receipt, correction and actual cash return");
  return { passed:true, checks:passed, realConnections:[aPid,bPid], postgrestTested:false, cashPayoutTested:false };
}
