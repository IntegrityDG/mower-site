/* eslint-disable @typescript-eslint/no-explicit-any */
// Real loopback app -> dedicated PostgREST -> verified task DB. No Stripe calls.
import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {installationBalance} from '../../lib/installations/accounting';
async function main(){
 const [suffix,mode]=process.argv.slice(2);assert.match(suffix,/^[a-z0-9_]{1,26}$/);assert.ok(['disabled','enabled'].includes(mode));
 const config=JSON.parse(fs.readFileSync(`node_modules/.cache/ids-installation-test/${suffix}-services.json`,'utf8'));
 const manifest=JSON.parse(fs.readFileSync(`docs/review/installation-readiness/db-${suffix}-run.json`,'utf8'));
 assert.equal(config.database,manifest.database);assert.equal(config.databaseOid,manifest.databaseOid);assert.equal(config.runId,manifest.runId);assert.ok(manifest.prepared);
 const processInfo=JSON.parse(fs.readFileSync(`node_modules/.cache/ids-installation-test/${suffix}-processes.json`,'utf8'));assert.equal(processInfo.mode,mode);assert.equal(processInfo.database,config.database);
 const base=`http://127.0.0.1:${config.appPort}`,rest=`http://127.0.0.1:${config.restPort}`;let cookie='';const checks:string[]=[];
 const request=async(route:string,body?:unknown,method=body?'POST':'GET',authorized=true)=>{const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(authorized&&cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});const value=await r.json();return {status:r.status,value,headers:r.headers};};
 const direct=async(route:string,key=config.serviceKey)=>{const r=await fetch(rest+route,{headers:{Authorization:`Bearer ${key}`}});return {status:r.status,value:await r.json()};};
 const persisted=await direct('/installations?select=id&limit=1');assert.equal(persisted.status,200,JSON.stringify(persisted.value));assert.ok(persisted.value.length);
 const denied=await direct('/installations?select=id&limit=1',config.anonKey);assert.ok(denied.status===401||denied.status===403,JSON.stringify(denied.value));
 assert.equal((await request('/api/admin/installations',undefined,'GET',false)).status,401);
 const login=await request('/api/admin/reviews/login',{password:config.adminPassword});assert.equal(login.status,200);cookie=login.headers.get('set-cookie')!.split(';')[0];assert.ok(cookie);
 const admin=await request('/api/admin/installations');assert.equal(admin.status,200,JSON.stringify(admin.value));assert.equal(admin.value.controls.cashRecordingEnabled,mode==='enabled');
 checks.push('real service-role PostgREST read; anonymous DB access denied; shared admin login and history');
 const id=admin.value.installations.find((i:any)=>i.pricing_snapshot)?.id;assert.ok(id);
 const receipt={operationKey:randomUUID(),amountDollars:'1.00',receivedAt:new Date(Date.now()-5000).toISOString(),reference:'SYNTHETIC HTTP',notes:'Local test only',confirmOverpayment:false};
 for(const tail of ['','/corrections','/refunds'])assert.equal((await request(`/api/admin/installations/${id}/cash${tail}`,receipt,'POST',false)).status,401);
 if(mode==='disabled'){
  assert.equal((await request('/api/installations',{})).status,503);
  assert.equal((await request(`/api/installations/${admin.value.installations[0].public_token}/checkout`,{purpose:'balance'})).status,503);
  for(const tail of ['','/corrections','/refunds'])assert.equal((await request(`/api/admin/installations/${id}/cash${tail}`,receipt)).status,503);
  checks.push('disabled intake, checkout, receipt, correction, cash-refund endpoints reject directly; history remains readable');
  const savedFile=`docs/review/installation-readiness/${suffix}-app-record.json`;
  if(fs.existsSync(savedFile)){
   const saved=JSON.parse(fs.readFileSync(savedFile,'utf8'));
   const receiptConfirmation=await request(`/api/admin/installations/${saved.installationId}/cash/confirm`,saved.receiptOperation);
   assert.equal(receiptConfirmation.status,200,JSON.stringify(receiptConfirmation.value));assert.equal(receiptConfirmation.value.paymentId,saved.originalPaymentId);
   assert.notDeepEqual(receiptConfirmation.value.currentBalance,receiptConfirmation.value.balanceAtRecording);
   const refundConfirmation=await request(`/api/admin/installations/${saved.installationId}/cash/refunds/confirm`,saved.refundOperation);
   assert.equal(refundConfirmation.status,200,JSON.stringify(refundConfirmation.value));assert.ok(refundConfirmation.value.refundId);
   checks.push('with writes off after activity: prior receipt and actual cash-return confirmation remain available; saved historical and current balances stay distinct');
  }
 }else{
  const from=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const to=new Date(Date.now()+41*86400000).toISOString().slice(0,10);
  const availability=await request(`/api/installations/availability?start=${from}&end=${to}`);assert.equal(availability.status,200,JSON.stringify(availability.value));
  const slots=availability.value.slots;assert.ok(slots.length>=3,JSON.stringify(availability.value));
  const intake={name:'SYNTHETIC HTTP APP REVIEW',email:'installation-http@example.invalid',phone:'000-000-0000',address:'Synthetic isolated installation property',equipment:null,preferredLocation:null,internetAvailability:'yes',undergroundRequested:false,estimatedUndergroundFeet:2.55,groundingAcknowledged:true,responsibilitiesAcknowledged:true,termsAcknowledged:true,undergroundAcknowledged:false,cashRequested:true,idempotencyKey:randomUUID(),startAt:slots.at(-1).startAt};
  const created=await request('/api/installations',intake);assert.equal(created.status,201,JSON.stringify(created.value));const record=created.value.installation??created.value;const installationId=record.id,token=record.token;assert.ok(installationId,JSON.stringify(record));
  assert.equal((await request('/api/installations',intake)).value.token,token);
  assert.equal((await request('/api/installations',{...intake,idempotencyKey:randomUUID()})).status,409);
  assert.equal((await request('/api/installations',{...intake,startAt:new Date(Date.parse(intake.startAt)+60000).toISOString(),idempotencyKey:randomUUID()})).status,409);
  assert.equal((await request('/api/installations',{...intake,termsAcknowledged:'true',idempotencyKey:randomUUID()})).status,400);
  const action=async(action:string,extra:Record<string,unknown>={},expected=200)=>{const result=await request(`/api/admin/installations/${installationId}`,{action,operationKey:randomUUID(),reason:'Synthetic approved local operation',...extra},'PATCH');assert.equal(result.status,expected,JSON.stringify(result.value));return result.value;};
  const state=async()=>{const r=await direct(`/installations?id=eq.${installationId}&select=*`);assert.equal(r.status,200);return r.value[0];};
  assert.equal((await state()).status,'requested');await action('approve');await action('cash',{status:'approved'});await action('session_start',{},400);
  const cashBody={...receipt,operationKey:randomUUID(),amountDollars:'750.00'};
  const cash=await request(`/api/admin/installations/${installationId}/cash`,cashBody);assert.equal(cash.status,200,JSON.stringify(cash.value));const original=cash.value.paymentId;assert.ok(original);
  assert.equal((await request(`/api/admin/installations/${installationId}/cash`,cashBody)).value.replayed,true);
  assert.equal((await request(`/api/admin/installations/${installationId}/cash`,{...cashBody,actor:'forged',balanceAfter:{}})).status,400);
  const correction=await request(`/api/admin/installations/${installationId}/cash/corrections`,{operationKey:randomUUID(),originalPaymentId:original,amountDollars:'675.00',reason:'Synthetic mistaken receipt: only $75 was received'});assert.equal(correction.status,200,JSON.stringify(correction.value));
  const refundBody={operationKey:randomUUID(),originalPaymentId:original,amountDollars:'25.00',reason:'Synthetic cash actually returned',reference:'LOCAL HANDOFF',returnedAt:new Date(Date.now()-1000).toISOString(),confirmMoneyReturned:true};
  const refund=await request(`/api/admin/installations/${installationId}/cash/refunds`,refundBody);assert.equal(refund.status,200,JSON.stringify(refund.value));assert.equal((await request(`/api/admin/installations/${installationId}/cash/refunds`,refundBody)).value.replayed,true);
  assert.equal((await request(`/api/admin/installations/${installationId}/cash/refunds`,{...refundBody,operationKey:randomUUID(),amountDollars:'50.01'})).status,409);
  let portal=await request(`/api/installations/${token}`);assert.equal(portal.status,200);let balance=installationBalance(portal.value.installation.pricing_snapshot,portal.value.adjustments,portal.value.payments,portal.value.corrections,portal.value.cashRefunds);assert.equal(balance.netPaidCents,5000);assert.equal(balance.balanceDueCents,95000);
  assert.equal(portal.value.payments.find((p:any)=>p.id===original).amount_cents,75000);assert.equal(portal.value.corrections.length,1);assert.equal(portal.value.cashRefunds.length,1);
  const topup=await request(`/api/admin/installations/${installationId}/cash`,{...receipt,operationKey:randomUUID(),amountDollars:'950.00'});assert.equal(topup.status,200,JSON.stringify(topup.value));await action('session_start');await action('session_stop',{status:'paused'});
  const stopped=(await direct(`/installation_work_sessions?installation_id=eq.${installationId}&select=*`)).value[0];await action('session_correct',{sessionId:stopped.id,durationMinutes:90});await action('session_start');await action('safety',{status:'suspended',evidence:'Synthetic hazard'});
  await action('session_start',{},400);const late=await request(`/api/admin/installations/${installationId}/cash`,{...receipt,operationKey:randomUUID(),amountDollars:'1.00',confirmOverpayment:true});assert.equal(late.status,200);assert.equal((await state()).safety_status,'suspended');
  await action('safety',{status:'remediation_pending'});await action('safety',{status:'remediation_approved',evidence:'Synthetic corrected hazard'});await action('session_start');await action('session_stop',{status:'paused'});
  portal=await request(`/api/installations/${token}`);assert.ok(portal.value.sessions.some((s:any)=>s.corrected_from_id===stopped.id&&s.duration_minutes===90));assert.deepEqual(portal.value.sessions.find((s:any)=>s.id===stopped.id),stopped);
  const finalAdmin=await request('/api/admin/installations');balance=installationBalance(portal.value.installation.pricing_snapshot,portal.value.adjustments,portal.value.payments,portal.value.corrections,portal.value.cashRefunds);assert.deepEqual(finalAdmin.value.balances[installationId],balance);
  checks.push('real intake and stable retry; occupied/forged slot and acknowledgement rejection; approval/cash arrangement does not permit unpaid work','real receipt $750, correction $675, actual return $25, cap and replay; original $750 unchanged, $50 net/$950 due','funded work; pause, immutable 90-minute correction, resume, hazard survives payment, evidence-based remediation; matching persisted customer/admin balances');
  fs.writeFileSync(`docs/review/installation-readiness/${suffix}-app-record.json`,JSON.stringify({installationId,token,originalPaymentId:original,refundOperation:refundBody,receiptOperation:cashBody},null,2)+'\n');
 }
 fs.writeFileSync(`docs/review/installation-readiness/${suffix}-app-${mode}.json`,JSON.stringify({passed:true,at:new Date().toISOString(),database:config.database,databaseOid:config.databaseOid,app:base,rest,checks,stripeCalls:false,syntheticOnly:true},null,2)+'\n');console.log(JSON.stringify({passed:true,mode,checks}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
