import assert from "node:assert/strict";
import fs from "node:fs";

const sql=fs.readFileSync("supabase/migrations/20260801010000_add_ach_wire_payment_foundation.sql","utf8");
for(const method of ["ach_debit","wire_transfer"])assert.match(sql,new RegExp(method));
for(const state of ["awaiting_customer_action","awaiting_customer_funds","partially_funded"])assert.match(sql,new RegExp(state));
for(const fn of ["checkout_create_ach_draft","checkout_link_ach_session","checkout_apply_ach_event_v1","checkout_create_wire_draft","checkout_link_wire_session","checkout_apply_wire_event_v1","checkout_find_wire_attempt_by_customer"]){
  assert.match(sql,new RegExp(`create or replace function public\\.${fn}\\(`,"i"));
  assert.match(sql,new RegExp(`revoke all on function public\\.${fn}\\([\\s\\S]*?from public,anon,authenticated`,"i"));
  assert.match(sql,new RegExp(`grant execute on function public\\.${fn}\\([\\s\\S]*?to service_role`,"i"));
}
assert.match(sql,/security invoker/gi);
assert.match(sql,/force row level security/i);
assert.match(sql,/round\(subtotal\*275::numeric\/10000\)/i);
assert.match(sql,/foreach monetary_key in array array\['subtotalCents','discountCents','feeCents','shippingCents','taxCents','totalCents'\]/gi);
assert.match(sql,/jsonb_typeof\(p_snapshot->monetary_key\) is distinct from 'number'/gi);
assert.match(sql,/monetary_text !~ '\^\(0\|\[1-9\]\[0-9\]\*\)\$'/gi);
assert.match(sql,/monetary_text>'9223372036854775807'/gi);
assert.match(sql,/total::numeric<>subtotal::numeric-discount\+fee\+shipping\+tax/gi);
assert.match(sql,/values\(c\.id,ref,[\s\S]*?'usd',subtotal,discount,fee,shipping,tax,total,'ach_debit'/i);
assert.match(sql,/values\(c\.id,ref,[\s\S]*?'usd',subtotal,discount,fee,shipping,tax,total,'wire_transfer'/i);
assert.match(sql,/p_snapshot->>'paymentMethod' is distinct from 'ach_debit'/i);
assert.match(sql,/p_snapshot->>'paymentMethod' is distinct from 'wire_transfer'/i);
assert.equal((sql.match(/p_snapshot->>'currency' is distinct from 'usd'/gi)??[]).length,2);
const achEvent=sql.match(/create or replace function public\.checkout_apply_ach_event_v1[\s\S]*?end \$\$;/i)?.[0]??"";
const wireEvent=sql.match(/create or replace function public\.checkout_apply_wire_event_v1[\s\S]*?end \$\$;/i)?.[0]??"";
assert.match(achEvent,/if p_kind is null or p_kind not in/i);
assert.match(wireEvent,/if p_kind is null or p_kind not in/i);
assert.match(achEvent,/p_payment_intent_status is distinct from 'succeeded'/i);
assert.match(wireEvent,/p_payment_intent_status is distinct from 'succeeded' or p_funded<>a\.expected_amount_cents or p_remaining<>0/i);
assert.match(wireEvent,/if p_kind='overpayment'[\s\S]*?insert into checkout_private\.bank_payment_reconciliation_reviews/i);
const wireLookup=sql.match(/create or replace function public\.checkout_find_wire_attempt_by_customer[\s\S]*?end \$\$;/i)?.[0]??"";
assert.match(wireLookup,/attempt_status in \('awaiting_customer_funds','partially_funded'\)/gi);
assert.doesNotMatch(wireLookup,/'succeeded'|'failed'|'expired'/i);
assert.match(wireLookup,/if n<>1 then return null/gi);
assert.doesNotMatch(sql,/security definer|grant[^;]*to (?:public|anon|authenticated)|bank_account|routing_number|account_number|swift|delete\s+from/i);
assert.doesNotMatch(sql,/checkout_apply_card_event(?:_v2)?\s*\(/i);
assert.match(sql,/get diagnostics n=row_count/i);
console.log("ACH/wire migration static validation passed.");
