import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import * as nodeUtil from "node:util";
import * as adminPolicy from "../lib/installations/admin-policy";
import {installationBalance} from "../lib/installations/accounting";
import {installationId} from "./helpers/installation-fixtures";
import {installationHarness} from "./helpers/installation-harness";
import {loadInstallationModule as load} from "./helpers/installation-module";

type Provider=typeof import("../lib/installations/subscriber-eligibility");
type Operations=typeof import("../lib/installations/operations");
const body=(action:string,extra={})=>({action,operationKey:randomUUID(),reason:"Synthetic policy verification",...extra});
const job=()=>installationHarness({installation:{status:"requested",pricing_snapshot:null,setup_selected:true,internet_availability:"yes"},payments:[]});
const totals=(h:ReturnType<typeof job>)=>installationBalance(h.state.installations[0].pricing_snapshot,h.state.installation_adjustments,h.state.installation_payments);

test("the actual server-only eligibility provider always returns false until website subscriptions exist",async()=>{
  // The loader rejects any unexpected dependency; no subscription query or
  // external system is invented, and environment flags cannot grant eligibility.
  const provider=load<Provider>("lib/installations/subscriber-eligibility.ts",{}, {REMOTE_SUPPORT_ELIGIBLE:"true",REMOTE_SUPPORT_SUBSCRIBER:"true"});
  for(const id of [installationId,randomUUID(),""])assert.equal(await provider.getRemoteSupportEligibility(id),false);
});
test("authorization precedes the eligibility provider and database access",async()=>{
  const forbidden=()=>{throw Error("must not access provider/database");};
  const operations=load<Operations>("lib/installations/operations.ts",{
    "@/lib/reviews/admin-auth":{isReviewAdmin:async()=>false},"@/lib/supabase":{getSupabaseServiceClient:forbidden},
    "./admin-policy":adminPolicy,"./subscriber-eligibility":{getRemoteSupportEligibility:forbidden},
  });
  await assert.rejects(operations.executeInstallationAdmin(installationId,body("approve")),/Unauthorized/);
});
test("production operations ignore guessed subscriber flags on a job and charge the undiscounted combined amount",async()=>{
  const h=job();h.state.installations[0].remote_support_eligible=true;h.state.installations[0].remote_support_eligibility_reason="Untrusted old fixture flag";
  await h.operations.executeInstallationAdmin(installationId,body("travel",{oneWayMinutes:150}));
  await h.operations.executeInstallationAdmin(installationId,body("approve"));
  assert.equal(totals(h).approvedChargesCents,153500);assert.equal(h.state.installations[0].approved_travel_charge_cents,3500);
  assert.equal(h.state.installation_adjustments.some(a=>a.reconciliation_kind?.endsWith("discount")),false);
  const writes=h.calls.filter(c=>c.table==="ids_apply_installation_admin");
  assert.equal(writes.length,2);for(const write of writes){assert.ok(!("remote_support_eligible" in write.payload.p_patch));assert.ok(!("remote_support_eligibility_reason" in write.payload.p_patch));}
});
test("browser/admin payloads cannot inject subscriber eligibility or request a manual verification action",async()=>{
  const h=job();for(const extra of [{eligible:true},{remoteSupportEligible:true},{remote_support_eligible:true},{subscriber:true}])
    await assert.rejects(h.operations.executeInstallationAdmin(installationId,body("approve",extra)),/invalid_admin_operation/);
  await assert.rejects(h.operations.executeInstallationAdmin(installationId,body("subscriber_eligibility",{eligible:true})),/invalid_admin_operation/);
  assert.equal(h.calls.length,0);
});
test("controlled eligible=true provider reaches the calculator once per new operation; retry preserves its recorded result",async()=>{
  const h=job(),lookups:string[]=[];
  const operations=load<Operations>("lib/installations/operations.ts",{
    "@/lib/reviews/admin-auth":h.auth,"@/lib/supabase":{getSupabaseServiceClient:()=>h.db},"./admin-policy":adminPolicy,"node:util":nodeUtil,
    "./subscriber-eligibility":{getRemoteSupportEligibility:async(id:string)=>{lookups.push(id);return true;}},
  });
  await operations.executeInstallationAdmin(installationId,body("travel",{oneWayMinutes:150}));const approval=body("approve");
  await operations.executeInstallationAdmin(installationId,approval);const approved=totals(h);
  assert.equal(approved.approvedChargesCents,140125);assert.equal(h.state.installations[0].approved_travel_charge_cents,2625);
  await operations.executeInstallationAdmin(installationId,approval);assert.deepEqual(totals(h),approved);assert.deepEqual(lookups,[installationId,installationId]);
  await operations.executeInstallationAdmin(installationId,body("travel",{oneWayMinutes:150}));assert.deepEqual(totals(h),approved);
});
test("an unavailable future provider aborts pricing before a financial write",async()=>{
  const h=job(),before=structuredClone(h.state);
  const operations=load<Operations>("lib/installations/operations.ts",{
    "@/lib/reviews/admin-auth":h.auth,"@/lib/supabase":{getSupabaseServiceClient:()=>h.db},"./admin-policy":adminPolicy,
    "./subscriber-eligibility":{getRemoteSupportEligibility:async()=>{throw Error("subscription source unavailable");}},
  });
  await assert.rejects(operations.executeInstallationAdmin(installationId,body("approve")),/subscription source unavailable/);
  assert.deepEqual(h.state,before);assert.equal(h.calls.some(c=>c.table==="ids_apply_installation_admin"),false);
});
