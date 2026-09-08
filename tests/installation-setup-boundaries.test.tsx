import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {renderToStaticMarkup} from "react-dom/server";
import {loadInstallationModule as load} from "./helpers/installation-module";
import {installationHarness} from "./helpers/installation-harness";
import {installationId,payment} from "./helpers/installation-fixtures";
import * as validation from "../lib/installations/validation";
import * as policy from "../lib/installations/admin-policy";
import * as errors from "../lib/installations/errors";
import {DEFAULT_PRICING} from "../lib/installations/policy";
import InstallationServiceSummary from "../components/installations/InstallationServiceSummary";
import SetupOnlyJobForm from "../components/installations/SetupOnlyJobForm";
import {servicesSchedulingPage} from "./helpers/installation-service-page";

const input=()=>({operationKey:randomUUID(),reason:"Synthetic existing mower owner request",name:"Synthetic Owner",email:"owner@example.invalid",phone:"555-010-0123",address:"123 Synthetic Street",equipment:"Yarbo Core",internetAvailability:"yes",startAt:"2026-10-01T14:00:00.000Z",responsibilitiesAcknowledged:true,termsAcknowledged:true});
test("Setup-only service authenticates first, validates strictly, and persists a canonical retry payload",async()=>{
  for(const authorized of [false,true]){
    const calls:unknown[]=[];const service=load<typeof import("../lib/installations/setup-server")>("lib/installations/setup-server.ts",{
      "@/lib/reviews/admin-auth":{isReviewAdmin:async()=>authorized},"./admin-policy":policy,"./validation":validation,
      "@/lib/supabase":{getSupabaseServiceClient:()=>({rpc:async(name:string,args:unknown)=>{calls.push({name,args});return{data:{ok:true,id:installationId,public_token:installationId},error:null};}})},
    });
    if(!authorized){await assert.rejects(service.createSetupOnlyJob(input()),/Unauthorized/);assert.equal(calls.length,0);continue;}
    const payload=input();await service.createSetupOnlyJob(payload);await service.createSetupOnlyJob(payload);
    assert.deepEqual(calls[0],calls[1]);const call=calls[0] as {name:string;args:{p_payload:Record<string,unknown>;p_reason:string}};
    assert.equal(call.name,"ids_create_setup_only");assert.equal(call.args.p_payload.setupSelected,true);assert.equal(call.args.p_payload.groundingAcknowledged,false);
    for(const forged of [{remote_support_eligible:true},{setupLaborCents:1},{groundingAcknowledged:true},{equipment:""},{termsAcknowledged:"true"},{reason:""}])await assert.rejects(service.createSetupOnlyJob({...payload,...forged}));
    assert.equal(calls.length,2);
  }
});
test("Setup-only HTTP endpoint requires auth before parsing or service access",async()=>{
  const route=load<typeof import("../app/api/admin/installations/setup-only/route")>("app/api/admin/installations/setup-only/route.ts",{
    "@/lib/reviews/admin-auth":{isReviewAdmin:async()=>false},"@/lib/installations/errors":errors,
    "@/lib/installations/setup-server":{createSetupOnlyJob:()=>{throw Error("must not call");}},
  });
  assert.equal((await route.POST(new Request("http://localhost/api/admin/installations/setup-only",{method:"POST",body:"malformed"}))).status,401);
});
test("Setup public selection cannot bypass closed Installation intake",async()=>{
  const h=installationHarness();await assert.rejects(h.server.createInstallation({...input(),setupSelected:true} as never),/installation_intake_disabled/);
  assert.equal(h.calls.length,0);
});
test("actual Checkout operation uses the approved combined ledger and one deposit",async()=>{
  for(const [purpose,expected] of [["deposit",25000],["balance",128500]] as const){
    const h=installationHarness({env:{INSTALLATION_ONLINE_PAYMENTS_ENABLED:"true"},installation:{setup_selected:true,pricing_snapshot:DEFAULT_PRICING,cash_status:"not_requested"},payments:purpose==="deposit"?[]:[{...payment(),installation_id:installationId}]});
    h.state.installation_adjustments.push({id:randomUUID(),installation_id:installationId,amount_cents:50000,reconciliation_kind:"setup_base"},{id:randomUUID(),installation_id:installationId,amount_cents:3500,reconciliation_kind:"travel"});
    await h.stripe.createInstallationCheckout(installationId,purpose);
    assert.equal(h.calls.find(c=>c.table==="stripe")!.payload.line_items[0].price_data.unit_amount,expected);
    assert.equal(h.calls.filter(c=>c.table==="stripe").length,1);
  }
});
test("customer portal projection retains service charges but excludes internal notes, identity and request payload",async()=>{
  const h=installationHarness({installation:{setup_selected:true,remote_support_eligibility_reason:"PRIVATE-EVIDENCE",admin_notes:"PRIVATE-NOTE",request_payload:{password:"PRIVATE-PAYLOAD"}}});
  h.state.installation_adjustments.push({id:randomUUID(),installation_id:installationId,amount_cents:50000,reconciliation_kind:"setup_base",description:"PRIVATE-CHARGE-REASON",created_by:"PRIVATE-ACTOR"});
  const result=await h.server.installationByToken(installationId);assert.equal(result.installation.setup_selected,true);assert.equal(result.adjustments[0].amount_cents,50000);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE-/);
});
test("components show separate labor and net approved travel without a public Setup primary card",async()=>{
  const html=renderToStaticMarkup(<InstallationServiceSummary job={{setup_selected:true,pricing_snapshot:DEFAULT_PRICING,approved_travel_charge_cents:3500,travel_policy:"combined_visit"}} sessions={[]} adjustments={[{amount_cents:50000,reconciliation_kind:"setup_base"}]}/>);
  for(const text of ["Setup selected: Yes","$500.00","$35.00","four cumulative Setup hours","Installation labor recorded","Setup labor recorded","no materials allowance"])assert.ok(html.includes(text),text);
  const Page=servicesSchedulingPage(false),services=renderToStaticMarkup(await Page({searchParams:Promise.resolve({})}));assert.doesNotMatch(services,/>Setup<\/h[23]>/);
  const form=renderToStaticMarkup(<SetupOnlyJobForm slots={[]} onSaved={async()=>{}} disabled={false}/>);assert.ok(form.includes("Create Setup-only"));assert.ok(form.includes("disabled"));
});
