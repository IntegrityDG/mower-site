import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const sql=fs.readFileSync("supabase/migrations/20260801010000_add_ach_wire_payment_foundation.sql","utf8");
const wireLookup=sql.match(/create or replace function public\.checkout_find_wire_attempt_by_customer[\s\S]*?end \$\$;/i)?.[0]??"";

function resolveActiveWireAttempt(statuses:string[]) {
  const active=statuses.filter((status)=>status==="awaiting_customer_funds"||status==="partially_funded");
  return active.length===1?active[0]:null;
}

function validateSnapshot(values:Record<string,unknown>) {
  const keys=["subtotalCents","discountCents","feeCents","shippingCents","taxCents","totalCents"] as const;
  if(keys.some((key)=>typeof values[key]!=="number"||!Number.isSafeInteger(values[key])||(values[key] as number)<0))return false;
  const subtotal=values.subtotalCents as number, discount=values.discountCents as number, fee=values.feeCents as number, shipping=values.shippingCents as number, tax=values.taxCents as number, total=values.totalCents as number;
  return discount===Math.round(subtotal*275/10000)&&fee===0&&Number.isSafeInteger(subtotal-discount+fee+shipping+tax)&&total===subtotal-discount+fee+shipping+tax;
}

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
  assert.equal(validateSnapshot({subtotalCents:269900,discountCents:7422,feeCents:0,shippingCents:0,taxCents:0,totalCents:262478}),true);
  assert.equal(validateSnapshot({subtotalCents:269900,discountCents:7422,feeCents:0,shippingCents:2500,taxCents:0,totalCents:264978}),true);
  assert.equal(validateSnapshot({subtotalCents:269900,discountCents:7422,feeCents:0,shippingCents:0,taxCents:21000,totalCents:283478}),true);
  assert.equal(validateSnapshot({subtotalCents:269900,discountCents:7422,feeCents:0,shippingCents:2500,taxCents:21000,totalCents:285978}),true);
});

test("bank snapshot pricing rejects malformed, negative, overflow, and mismatched values",()=>{
  const valid={subtotalCents:269900,discountCents:7422,feeCents:0,shippingCents:2500,taxCents:21000,totalCents:285978};
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
