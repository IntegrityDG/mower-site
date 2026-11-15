import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {installationHarness} from "./helpers/installation-harness";
import {installationId} from "./helpers/installation-fixtures";
import {loadInstallationModule as load} from "./helpers/installation-module";
import {INSTALLATION_TERMS_VERSION} from "../lib/installations/cancellation";
import * as validation from "../lib/installations/validation";
import * as adminPolicy from "../lib/installations/admin-policy";
import * as policy from "../lib/installations/policy";
import * as accounting from "../lib/installations/accounting";

const cancel=()=>({action:"cancel",operationKey:randomUUID(),reason:"Synthetic review evidence",cancellationCause:"customer",cancellationReviewed:true,cancellationFeeCents:10000});
test("actual operations replay cancellation and later full-refund using stable keys without new writes",async()=>{
  const h=installationHarness({installation:{terms_version:INSTALLATION_TERMS_VERSION}});const originalPayments=structuredClone(h.state.installation_payments);const input=cancel();
  await h.operations.executeInstallationAdmin(installationId,input);
  assert.equal((await h.operations.executeInstallationAdmin(installationId,input)).replayed,true);
  await assert.rejects(h.operations.executeInstallationAdmin(installationId,{...input,cancellationFeeCents:5000}),/admin_operation_conflict/);
  const full={action:"cancellation_full_refund",operationKey:randomUUID(),reason:"Confirmed legal requirement",cancellationReviewed:true};
  await h.operations.executeInstallationAdmin(installationId,full);assert.equal((await h.operations.executeInstallationAdmin(installationId,full)).replayed,true);
  await assert.rejects(h.operations.executeInstallationAdmin(installationId,{...full,reason:"Changed evidence"}),/admin_operation_conflict/);
  const writes=h.calls.filter(c=>c.table==="ids_apply_installation_admin");assert.equal(writes.length,2);
  assert.equal(writes[1].payload.p_expected.installation.cancellation_review.cause,"customer");assert.equal(writes[1].payload.p_payload.reason,full.reason);assert.equal(writes[1].payload.p_patch.cancellation_review.cause,"full_refund_required");
  assert.equal(writes[1].payload.p_balance_before.approvedChargesCents,10000);assert.equal(writes[1].payload.p_balance_after.approvedChargesCents,0);
  assert.equal(h.state.installations[0].status,"cancelled");assert.deepEqual(h.state.installation_payments,originalPayments);assert.equal(h.external.length,0);assert.equal(h.state.installation_admin_operations[0].payload.cancellationCause,"customer");
});
test("cancellation operation authentication precedes all ledger reads and writes",async()=>{
  const h=installationHarness({authorized:false,installation:{terms_version:INSTALLATION_TERMS_VERSION}});
  for(const input of [cancel(),{action:"cancellation_full_refund",operationKey:randomUUID(),reason:"Verified",cancellationReviewed:true}])await assert.rejects(h.operations.executeInstallationAdmin(installationId,input),/Unauthorized/);
  assert.equal(h.calls.length,0);assert.equal(h.external.length,0);
});

const intake=()=>({termsVersion:INSTALLATION_TERMS_VERSION,name:"Synthetic Person",email:"synthetic@example.com",phone:"5555551234",address:"123 Synthetic Street",equipment:"Synthetic mower",preferredLocation:null,internetAvailability:"yes" as const,startAt:"2026-12-01T14:00:00.000Z",idempotencyKey:randomUUID(),groundingAcknowledged:true,responsibilitiesAcknowledged:true,termsAcknowledged:true,undergroundAcknowledged:false,undergroundRequested:false,estimatedUndergroundFeet:0,cashRequested:false});
function creationBoundary(schemaResult: {data:unknown;error:unknown}, authorized=true){
  const calls:unknown[][]=[];
  const db={from(table:string){calls.push(["from",table]);return {select(fields:string){calls.push(["select",fields]);return {async limit(count:number){calls.push(["limit",count]);return schemaResult;}};}};},async rpc(name:string,payload:unknown){calls.push(["rpc",name,payload]);return {data:{ok:true,id:installationId,public_token:installationId},error:null};}};
  const terms=load<{requireInstallationCancellationSchema:()=>Promise<void>}>("lib/installations/terms-server.ts",{"@/lib/supabase":{getSupabaseServiceClient:()=>db}});
  const modules={"./terms-server":terms,"@/lib/supabase":{getSupabaseServiceClient:()=>db},"@/lib/reviews/admin-auth":{isReviewAdmin:async()=>authorized},"@/lib/service/availability":{requireServiceAvailability:async()=>{}},"./admin-policy":adminPolicy,"./validation":validation,"./operations":{},"./accounting":accounting,"./policy":policy,"./controls":{requireInstallationIntake:()=>{}}};
  return {calls,terms,server:load<{createInstallation:(input:unknown)=>Promise<unknown>}>("lib/installations/server.ts",modules),setup:load<{createSetupOnlyJob:(input:unknown)=>Promise<unknown>}>("lib/installations/setup-server.ts",modules)};
}
function setupInput(){const i=intake();return {termsVersion:i.termsVersion,name:i.name,email:i.email,phone:i.phone,address:i.address,equipment:i.equipment,internetAvailability:i.internetAvailability,startAt:i.startAt,responsibilitiesAcknowledged:true,termsAcknowledged:true,operationKey:randomUUID(),reason:"Synthetic customer acknowledgement"};}
test("actual schema helper probes only column existence and zero private rows",async()=>{
  const b=creationBoundary({data:[],error:null});await b.terms.requireInstallationCancellationSchema();assert.deepEqual(b.calls,[["from","installations"],["select","cancellation_review"],["limit",0]]);
});
for(const schema of [{data:null,error:{message:"missing column"}},{data:null,error:null},{data:{},error:null}])test(`schema readiness fails closed before either creation RPC: ${JSON.stringify(schema)}`,async()=>{
  const b=creationBoundary(schema);await assert.rejects(b.server.createInstallation(intake()),/installation_cancellation_schema_unavailable/);await assert.rejects(b.setup.createSetupOnlyJob(setupInput()),/installation_cancellation_schema_unavailable/);assert.equal(b.calls.some(c=>c[0]==="rpc"),false);assert.ok(b.calls.filter(c=>c[0]==="select").every(c=>c[1]==="cancellation_review"));
});
test("both actual creation functions propagate explicit terms only after schema check",async()=>{
  const b=creationBoundary({data:[],error:null});await b.server.createInstallation(intake());await b.setup.createSetupOnlyJob(setupInput());
  const writes=b.calls.filter(c=>c[0]==="rpc");assert.equal(writes.length,2);
  for(const write of writes){assert.equal((write[2] as {p_payload:{termsVersion:string}}).p_payload.termsVersion,INSTALLATION_TERMS_VERSION);assert.deepEqual(b.calls[b.calls.indexOf(write)-1],["limit",0]);}
});
test("Setup-only creation authenticates before schema probe or persistence",async()=>{
  const b=creationBoundary({data:[],error:null},false);await assert.rejects(b.setup.createSetupOnlyJob(setupInput()),/Unauthorized/);assert.equal(b.calls.length,0);
});
test("versionless prior intake is preserved without inventing current acknowledgement",()=>{
  const input=intake();const {termsVersion:omitted,...legacy}=input;assert.equal(omitted,INSTALLATION_TERMS_VERSION);const parsed=validation.validateInstallationIntake(legacy);assert.equal(parsed.ok,true);if(parsed.ok)assert.equal("termsVersion" in parsed.value,false);
});
