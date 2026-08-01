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
assert.doesNotMatch(sql,/security definer|grant[^;]*to (?:public|anon|authenticated)|bank_account|routing_number|account_number|swift|delete\s+from/i);
assert.doesNotMatch(sql,/checkout_apply_card_event(?:_v2)?\s*\(/i);
assert.match(sql,/get diagnostics n=row_count/i);
console.log("ACH/wire migration static validation passed.");
