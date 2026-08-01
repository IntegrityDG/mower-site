import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const sql=fs.readFileSync("supabase/migrations/20260801194805_add_ach_wire_payment_foundation.sql","utf8");
const wireLookup=sql.match(/create or replace function public\.checkout_find_wire_attempt_by_customer[\s\S]*?end \$\$;/i)?.[0]??"";
const achDraft=sql.match(/create or replace function public\.checkout_create_ach_draft[\s\S]*?end \$\$;/i)?.[0]??"";
const wireDraft=sql.match(/create or replace function public\.checkout_create_wire_draft[\s\S]*?end \$\$;/i)?.[0]??"";
const achEvent=sql.match(/create or replace function public\.checkout_apply_ach_event_v1[\s\S]*?end \$\$;/i)?.[0]??"";
const wireEvent=sql.match(/create or replace function public\.checkout_apply_wire_event_v1[\s\S]*?end \$\$;/i)?.[0]??"";

function resolveActiveWireAttempt(statuses:string[]) {
  const active=statuses.filter((status)=>status==="awaiting_customer_funds"||status==="partially_funded");
  return active.length===1?active[0]:null;
}

function validateSnapshot(values:Record<string,unknown>,expectedMethod:"ach_debit"|"wire_transfer"="ach_debit") {
  const keys=["subtotalCents","discountCents","feeCents","shippingCents","taxCents","totalCents"] as const;
  if(keys.some((key)=>typeof values[key]!=="number"||!Number.isSafeInteger(values[key])||(values[key] as number)<0))return false;
  const subtotal=values.subtotalCents as number, discount=values.discountCents as number, fee=values.feeCents as number, shipping=values.shippingCents as number, tax=values.taxCents as number, total=values.totalCents as number;
  return values.paymentMethod===expectedMethod&&values.currency==="usd"&&discount===Math.round(subtotal*275/10000)&&fee===0&&Number.isSafeInteger(subtotal-discount+fee+shipping+tax)&&total===subtotal-discount+fee+shipping+tax;
}

const pricedSnapshot={paymentMethod:"ach_debit",currency:"usd",subtotalCents:269900,discountCents:7422,feeCents:0,shippingCents:2500,taxCents:21000,totalCents:285978};

test("wire customer lookup selects exactly one active attempt and never historical success",()=>{
  assert.equal(resolveActiveWireAttempt(["awaiting_customer_funds"]),"awaiting_customer_funds");
  assert.equal(resolveActiveWireAttempt(["succeeded"]),null);
  assert.equal(resolveActiveWireAttempt(["succeeded","partially_funded"]),"partially_funded");
  assert.equal(resolveActiveWireAttempt(["awaiting_customer_funds","partially_funded"]),null);
  assert.equal(resolveActiveWireAttempt(["succeeded","failed","expired"]),null);
  assert.match(wireLookup,/attempt_status in \('awaiting_customer_funds','partially_funded'\)/gi);
  assert.doesNotMatch(wireLookup,/'succeeded'|'failed'|'expired'/i);
  assert.match(wireLookup,/if n<>1 then return null/gi);
});

test("bank snapshot pricing accepts authoritative shipping and tax",()=>{
  assert.equal(validateSnapshot({...pricedSnapshot,shippingCents:0,taxCents:0,totalCents:262478}),true);
  assert.equal(validateSnapshot({...pricedSnapshot,taxCents:0,totalCents:264978}),true);
  assert.equal(validateSnapshot({...pricedSnapshot,shippingCents:0,totalCents:283478}),true);
  assert.equal(validateSnapshot(pricedSnapshot),true);
});

test("bank snapshot pricing rejects malformed, negative, overflow, and mismatched values",()=>{
  const valid=pricedSnapshot;
  for(const invalid of [
    {...valid,subtotalCents:"269900"},
    {...valid,subtotalCents:"2.699e5"},
    {...valid,subtotalCents:"not-a-number"},
    {...valid,taxCents:1.5},
    {...valid,shippingCents:-1},
    {...valid,totalCents:Number.MAX_SAFE_INTEGER+1},
    {...valid,totalCents:1},
    {...valid,discountCents:8000},
    {...valid,discountCents:8063,totalCents:285337},
    {...valid,feeCents:1,totalCents:285979},
    {...valid,taxCents:undefined},
  ])assert.equal(validateSnapshot(invalid),false);
});

test("draft identity fields are required and null-safe",()=>{
  for(const invalid of [
    {...pricedSnapshot,paymentMethod:undefined},
    {...pricedSnapshot,paymentMethod:null},
    {...pricedSnapshot,currency:undefined},
    {...pricedSnapshot,currency:null},
  ])assert.equal(validateSnapshot(invalid),false);
  assert.match(achDraft,/p_snapshot->>'paymentMethod' is distinct from 'ach_debit'/i);
  assert.match(wireDraft,/p_snapshot->>'paymentMethod' is distinct from 'wire_transfer'/i);
  assert.match(achDraft,/p_snapshot->>'currency' is distinct from 'usd'/i);
  assert.match(wireDraft,/p_snapshot->>'currency' is distinct from 'usd'/i);
});

test("wire paid requires exact funding and overpayment stays on reconciliation path",()=>{
  const paid=(status:string|null,funded:number,remaining:number)=>status==="succeeded"&&funded===262478&&remaining===0;
  assert.equal(paid("succeeded",262478,0),true);
  assert.equal(paid("succeeded",262477,1),false);
  assert.equal(paid("succeeded",262479,0),false);
  assert.equal(paid(null,262478,0),false);
  assert.match(wireEvent,/p_payment_intent_status is distinct from 'succeeded' or p_funded<>a\.expected_amount_cents or p_remaining<>0/i);
  assert.match(wireEvent,/if p_kind='overpayment'[\s\S]*?insert into checkout_private\.bank_payment_reconciliation_reviews/i);
});

test("event kinds and authoritative success are null-safe",()=>{
  assert.match(achEvent,/if p_kind is null or p_kind not in/i);
  assert.match(wireEvent,/if p_kind is null or p_kind not in/i);
  assert.match(achEvent,/p_payment_intent_status is distinct from 'succeeded'/i);
  assert.match(wireEvent,/p_payment_intent_status is distinct from 'succeeded'/i);
});
