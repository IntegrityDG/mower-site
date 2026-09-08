/* eslint-disable @typescript-eslint/no-explicit-any */
import { installationBalance, cents, type InstallationPayment, type InstallationAdjustment, type InstallationCashCorrection, type InstallationCashRefund } from "./accounting";
import { hasInstallation, hasSetup, jobPricing, serviceInitialAmount, serviceTravelQuote, setupPrice, setupOvertime, supportDiscount, type ServiceComponent } from "./setup";
import { additionalLabor, balanceDueAt, cancellationDepositRefund, initialAmount, locationRefusalLaborRefund, undergroundLabor, DEFAULT_PRICING, type PricingSnapshot } from "./policy";

export const ADMIN_ACTOR = "IDS shared administrator";
export type WorkSession = { service_type?: ServiceComponent; id: string; status: string; duration_minutes: number | null; duration_seconds?: number | null; corrected_from_id: string | null; started_at: string; ended_at: string | null; notes: string | null };
export type AdminState = { installation: Record<string, any>; ledger: unknown; sessions: WorkSession[];
  payments: InstallationPayment[]; adjustments: (InstallationAdjustment & { reconciliation_kind?: string | null })[]; corrections: InstallationCashCorrection[]; cashRefunds: InstallationCashRefund[] };
export function activeWorkSessions(sessions: WorkSession[]) {
  const superseded = new Set(sessions.flatMap(s => s.corrected_from_id ? [s.corrected_from_id] : []));
  return sessions.filter(s => !superseded.has(s.id));
}
export function workSessionMinutes(session:WorkSession){const seconds=session.duration_seconds??(session.duration_minutes??0)*60;if(!Number.isFinite(seconds)||seconds<0)throw new Error('invalid_work_duration');return seconds/60;}
export const cumulativeWorkMinutes = (sessions: WorkSession[], component?: ServiceComponent) => activeWorkSessions(sessions).filter(s=>!component||(s.service_type??"installation")===component).reduce((n,s) => n + Math.round(workSessionMinutes(s)*60*1e6),0)/60e6;
export const displayWorkMinutes=(minutes:number)=>minutes.toLocaleString('en-US',{maximumFractionDigits:2});
export function operationKey(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Error("stable_operation_key_required");
  return value.toLowerCase();
}
function integer(value: unknown, name: string, signed = false) { const n=cents(value,name,signed); if(Math.abs(n)>2147483647) throw new Error(`invalid_${name}`); return n; }
export function approvedPricing(value: unknown): PricingSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_pricing");
  const p = value as PricingSnapshot;
  if (Object.keys(DEFAULT_PRICING).some(k=>k!=="setupLaborCents"&&!(k in p)) || Object.keys(p).some(k => !(k in DEFAULT_PRICING))) throw new Error("invalid_pricing");
  for(const [key,n] of Object.entries(p)) integer(n,key);
  if(p.includedLaborMinutes!==240 || p.laborIncrementMinutes!==15 || p.undergroundSegmentFeet!==10 || p.includedOneWayTravelMinutes!==120
    || p.depositCents>initialAmount(p)+(p.setupLaborCents??0)) throw new Error("locked_installation_terms");
  return {...p};
}
export function requiredFundsBeforeDeadline(state: AdminState, remoteSupportEligible = false) {
  const i=state.installation, deadline=Date.parse(i.balance_due_at);
  if(!Number.isFinite(deadline)) return false;
  const received=state.payments.filter(p=>p.purpose!=="refund"&&["paid","partially_refunded","refunded"].includes(p.status)&&p.paid_at&&Date.parse(p.paid_at)<deadline);
  const receivedIds=new Set(received.map(p=>p.id));
  const net=received.reduce((n,p)=>n+p.amount_cents-p.refunded_cents,0)
    -state.corrections.filter(c=>receivedIds.has(c.original_payment_id)).reduce((n,c)=>n+c.amount_cents,0)
    -state.cashRefunds.filter(r=>receivedIds.has(r.original_payment_id)).reduce((n,r)=>n+r.amount_cents,0);
  return net>=serviceInitialAmount(i,i.pricing_snapshot,remoteSupportEligible)+i.approved_travel_charge_cents;
}
const fields: Record<string,string[]>={
  approve:[],cash:["status"],cash_failure:[],cash_reschedule:["startAt"],forfeit_deposit:[],travel:["oneWayMinutes","approvedChargeCents"],pricing:["pricing"],
  setup:["selected"],setup_materials:["actualCents"],
  safety:["status","evidence"],session_start:["serviceType"],session_stop:["status"],session_correct:["sessionId","durationMinutes"],
  adjustment:["kind","description","amountCents"],materials:["actualCents"],labor:[],underground:["feet","materialsCents"],placement_refusal:[],
  cancel:[],decline:[],reschedule:["startAt"],arrangement:[],complete:[],
};
export function validateAdminInput(raw: unknown): Record<string,unknown> & {action:string;operationKey:string;reason:string} {
  if(!raw||typeof raw!=="object"||Array.isArray(raw)) throw new Error("invalid_admin_operation");
  const body=raw as Record<string,unknown>, action=String(body.action);
  if(!fields[action]||Object.keys(body).some(k=>!["action","operationKey","reason",...fields[action]].includes(k))) throw new Error("invalid_admin_operation");
  const key=operationKey(body.operationKey);
  if(body.reason!==undefined&&(typeof body.reason!=="string"||body.reason.length>2000)) throw new Error("invalid_reason");
  const reason=(body.reason as string|undefined)?.trim()??"";
  if(!["approve","session_start","session_stop","complete","labor"].includes(action)&&!reason) throw new Error("recorded_reason_required");
  return {...body,action,operationKey:key,reason};
}
export function prepareAdminOperation(state: AdminState, input: unknown, defaults: PricingSnapshot, now = new Date(), remoteSupportEligible = false) {
  const body=validateAdminInput(input), i=state.installation, action=body.action, reason=body.reason;
  const saved=approvedPricing(i.pricing_snapshot??i.draft_pricing??defaults);
  const pricing=jobPricing(i,hasSetup(i)?{...saved,setupLaborCents:saved.setupLaborCents??defaults.setupLaborCents??50000}:saved);
  const balanceBefore=installationBalance(pricing,state.adjustments,state.payments,state.corrections,state.cashRefunds);
  const patch: Record<string,unknown>={}, adjustments: Record<string,unknown>[]=[], sessions: Record<string,unknown>[]=[];
  const running=state.sessions.find(s=>s.status==="running"), minutes=cumulativeWorkMinutes(state.sessions,"installation"), setupMinutes=cumulativeWorkMinutes(state.sessions,"setup"), totalMinutes=cumulativeWorkMinutes(state.sessions);
  let stopSession: string|null=null;
  const closed=["cancelled","declined","terminated","completed"].includes(i.status);
  const requireApproved=()=>{if(!i.pricing_snapshot)throw new Error("missing_approved_pricing");};
  const requireOpen=()=>{if(closed)throw new Error("installation_closed");};
  const add=(kind:string,amount:number,description:string,reconciliation_kind:string|null=null)=>{
    integer(amount,"adjustment",true);if(amount)adjustments.push({kind,amount_cents:amount,description:description.slice(0,500),reconciliation_kind});
  };
  const reconcile=(kind:string,target:number,description:string)=>{
    const previous=state.adjustments.filter(a=>a.reconciliation_kind===kind).reduce((n,a)=>n+a.amount_cents,0);
    const adjustmentKind=kind==="materials"||kind==="setup_materials"?"material":kind==="labor"||kind==="setup_labor"?"additional_labor":kind==="underground"?"underground_labor":kind.endsWith("discount")?"credit":kind==="setup_base"?"other":"travel_time";
    add(adjustmentKind,target-previous,description,kind);
  };
  const setupReconciliation=(job:typeof i,p:PricingSnapshot,withLabor=false)=>{
    const base=hasSetup(job)?setupPrice(p):0;
    reconcile("setup_base",base,"Approved Setup labor: "+(reason||"saved pricing"));
    const overtime=withLabor?setupOvertime(setupMinutes):state.adjustments.filter(a=>a.reconciliation_kind==="setup_labor").reduce((n,a)=>n+a.amount_cents,0);
    if(withLabor)reconcile("setup_labor",overtime,"Setup overtime for "+setupMinutes+" cumulative minutes");
    reconcile("setup_discount",-supportDiscount(base+overtime,remoteSupportEligible===true),"Remote Support discount on eligible Setup labor; applied once");
  };
  const approveTravel=(job:typeof i,oneWayMinutes:number,override?:number,approved:PricingSnapshot=pricing)=>{
    const q=serviceTravelQuote(job,oneWayMinutes,approved,override,remoteSupportEligible);
    Object.assign(patch,{estimated_one_way_drive_minutes:q.estimatedOneWayMinutes,included_one_way_drive_minutes:q.includedOneWayMinutes,excess_one_way_drive_minutes:q.excessOneWayMinutes,
      billable_travel_hours_per_direction:q.billableHoursPerDirection,total_billable_travel_hours:q.totalBillableHours,calculated_travel_charge_cents:q.calculatedChargeCents,
      approved_travel_charge_cents:q.approvedChargeCents,travel_manually_overridden:q.manuallyOverridden,travel_override_reason:q.manuallyOverridden?reason:null,travel_policy:q.policy,travel_discount_cents:q.discountCents});
    if(i.pricing_snapshot){
      reconcile("travel",q.grossChargeCents,`Approved travel: ${reason}`);
      reconcile("travel_discount",-q.discountCents,"Remote Support discount on one travel charge");
      if(Date.parse(i.requested_start_at)-Date.parse(i.approved_at)<=72*3600000)patch.deposit_due_cents=serviceInitialAmount(job,approved,remoteSupportEligible)+q.approvedChargeCents;
    }
  };
  const newSlot=()=>{
    if(typeof body.startAt!=="string"||!Number.isFinite(Date.parse(body.startAt)))throw new Error("invalid_appointment");
    patch.requested_start_at=new Date(body.startAt).toISOString();patch.requested_end_at=new Date(Date.parse(body.startAt)+4*3600000).toISOString();
    return body.startAt;
  };
  if(action==="approve") {
    if(i.status!=="requested"||i.safety_status!=="clear")throw new Error("invalid_transition");
    if(i.internet_availability!=="yes"&&!reason)throw new Error("connectivity_review_reason_required");
    Object.assign(patch,{pricing_snapshot:pricing,approved_at:now.toISOString(),status:"deposit_due",balance_due_at:balanceDueAt(i.requested_start_at).toISOString(),
      deposit_due_cents:Date.parse(i.requested_start_at)-now.getTime()<=72*3600000?serviceInitialAmount(i,pricing,remoteSupportEligible)+i.approved_travel_charge_cents:pricing.depositCents});
    if(hasSetup(i))setupReconciliation(i,pricing);
    reconcile("travel",i.approved_travel_charge_cents+(i.travel_discount_cents??0),"Approved travel charge");
    reconcile("travel_discount",-(i.travel_discount_cents??0),"Remote Support discount on one travel charge");
  } else if(action==="pricing") {
    if(running)throw new Error("pause_work_before_pricing_change");
    const next=jobPricing(i,approvedPricing(body.pricing));patch.draft_pricing=next;
    if(i.pricing_snapshot){patch.pricing_snapshot=next;patch.deposit_due_cents=Date.parse(i.requested_start_at)-Date.parse(i.approved_at)<=72*3600000?serviceInitialAmount(i,next,remoteSupportEligible)+i.approved_travel_charge_cents:next.depositCents;if(hasSetup(i))setupReconciliation(i,next); }
  } else if(action==="travel") {
    approveTravel(i,integer(body.oneWayMinutes,"travel_minutes"),body.approvedChargeCents===undefined?undefined:integer(body.approvedChargeCents,"travel"));
  } else if(action==="setup") {
    requireOpen();if(!hasInstallation(i)||running||typeof body.selected!=="boolean")throw new Error("invalid_setup_change_pause_work_first");
    patch.setup_selected=body.selected;
    const next={...pricing,setupLaborCents:pricing.setupLaborCents??defaults.setupLaborCents??50000};
    patch.draft_pricing=next;
    if(i.pricing_snapshot){
      patch.pricing_snapshot=next;setupReconciliation({...i,setup_selected:body.selected},next);
      if(Date.parse(i.requested_start_at)-Date.parse(i.approved_at)<=72*3600000)
        patch.deposit_due_cents=serviceInitialAmount({...i,setup_selected:body.selected},next,remoteSupportEligible)+i.approved_travel_charge_cents;
    }
    // Adding Setup approves the combined-trip calculation with an append-only
    // travel delta in the same audited operation. Removal retains approved travel.
    if(body.selected&&!hasSetup(i)&&i.estimated_one_way_drive_minutes!==null&&i.estimated_one_way_drive_minutes!==undefined)
      approveTravel({...i,setup_selected:true},i.estimated_one_way_drive_minutes,undefined,next);
  } else if(action==="cash") {
    requireOpen();if(!["approved","denied","revoked"].includes(String(body.status))||i.special_cash_failure_reschedule)throw new Error("invalid_cash_arrangement");
    patch.cash_status=body.status;
  } else if(action==="cash_failure") {
    requireApproved();requireOpen();if(i.cash_status!=="approved"||running||totalMinutes>0||i.special_cash_failure_reschedule)throw new Error("cash_failure_not_available");
    Object.assign(patch,{status:"cancelled",cash_status:"revoked",special_cash_failure_reschedule:true,reschedule_opportunity_used:false});
  } else if(action==="cash_reschedule") {
    requireApproved();if(i.status!=="cancelled"||!i.special_cash_failure_reschedule||i.reschedule_opportunity_used)throw new Error("cash_reschedule_unavailable");
    const start=newSlot();if(Date.parse(start)-now.getTime()<=72*3600000)throw new Error("reschedule_requires_more_than_72_hours");
    Object.assign(patch,{status:"balance_due",reschedule_opportunity_used:true,cash_status:"revoked",balance_due_at:balanceDueAt(start).toISOString(),payment_arrangement_reason:null});
  } else if(action==="forfeit_deposit") {
    requireApproved();if(!i.special_cash_failure_reschedule||!i.reschedule_opportunity_used||!i.balance_due_at||now.getTime()<Date.parse(i.balance_due_at)||requiredFundsBeforeDeadline(state,remoteSupportEligible))throw new Error("deposit_forfeiture_not_due");
    if(i.deposit_forfeited_cents>0)throw new Error("deposit_already_forfeited");
    add("credit",pricing.depositCents-pricing.laborCents-(hasSetup(i)?setupPrice(pricing)-supportDiscount(setupPrice(pricing),remoteSupportEligible===true):0),`Cash-failure deposit forfeiture; unused labor credited, materials separately reconciled: ${reason}`,"cash_failure_forfeit");
    Object.assign(patch,{status:"terminated",deposit_forfeited_cents:pricing.depositCents});
  } else if(action==="session_start") {
    requireApproved();requireOpen();if(running||!["approved","deposit_due","scheduled","balance_due","ready","suspended"].includes(i.status)
      ||!["clear","remediation_approved"].includes(i.safety_status)||(i.special_cash_failure_reschedule&&!i.reschedule_opportunity_used))throw new Error("work_cannot_begin");
    if(balanceBefore.balanceDueCents>0)throw new Error("required_payment_not_confirmed");
    const inside72=Date.parse(i.requested_start_at)-Date.parse(i.approved_at)<=72*3600000;
    if(!requiredFundsBeforeDeadline(state,remoteSupportEligible)&&(i.special_cash_failure_reschedule||(!inside72&&i.cash_status!=="approved"&&!i.payment_arrangement_reason)))throw new Error("payment_deadline_missed_requires_ids_review");
    if(i.safety_status==="remediation_approved") {if(i.safety_reschedule_used)throw new Error("remediation_opportunity_used");patch.safety_reschedule_used=true;patch.safety_status="clear";}
    const component=body.serviceType??"installation";
    if(!["installation","setup"].includes(String(component))||(component==="installation"&&!hasInstallation(i))||(component==="setup"&&!hasSetup(i)))throw new Error("service_component_not_selected");
    patch.status="in_progress";sessions.push({status:"running",service_type:component,notes:reason||null});
  } else if(action==="session_stop"||action==="complete") {
    requireApproved();requireOpen();if(!running&&action==="session_stop")throw new Error("no_running_session");
    if(action==="complete"&&i.safety_status!=="clear")throw new Error("resolve_safety_before_completion");
    if(action==="session_stop"&&!["paused","suspended","completed"].includes(String(body.status)))throw new Error("invalid_work_state");
    const completed=action==="complete"||body.status==="completed";
    if(completed&&i.safety_status!=="clear")throw new Error("resolve_safety_before_completion");
    stopSession=running?.id??null;patch.status=completed?"completed":"suspended";if(completed)patch.completed_at=now.toISOString();
  } else if(action==="session_correct") {
    const id=operationKey(body.sessionId), s=activeWorkSessions(state.sessions).find(s=>s.id===id);
    if(!s||s.status==="running")throw new Error("invalid_time_correction");
    sessions.push({status:"corrected",service_type:s.service_type??"installation",corrected_from_id:id,duration_minutes:integer(body.durationMinutes,"work_minutes"),notes:reason});
  } else if(action==="safety") {
    requireOpen();const status=String(body.status);
    if(!["suspended","remediation_pending","remediation_approved","weather_postponed","terminated","clear"].includes(status))throw new Error("invalid_safety_status");
    if(body.evidence!==undefined&&(typeof body.evidence!=="string"||body.evidence.length>2000))throw new Error("invalid_safety_evidence");
    if(status==="remediation_approved"&&(i.safety_reschedule_used||!["suspended","remediation_pending"].includes(i.safety_status)||!String(body.evidence??"").trim()))throw new Error("remediation_evidence_required_or_opportunity_used");
    if(status==="clear"&&["suspended","remediation_pending"].includes(i.safety_status))throw new Error("approve_remediation_before_resuming");
    Object.assign(patch,{safety_status:status,status:status==="terminated"?"terminated":"suspended",safety_notes:reason,remediation_evidence_notes:body.evidence??i.remediation_evidence_notes});stopSession=running?.id??null;
  } else if(action==="reschedule") {
    requireOpen();if(running||i.special_cash_failure_reschedule)throw new Error("reschedule_not_available");
    const start=newSlot();patch.balance_due_at=balanceDueAt(start).toISOString();
    if(i.safety_status==="weather_postponed"){patch.safety_status="clear";patch.status="suspended";}
  } else if(action==="arrangement") {
    requireApproved();requireOpen();if(i.special_cash_failure_reschedule)throw new Error("cash_reschedule_requires_normal_deadline");patch.payment_arrangement_reason=reason;
  } else if(action==="adjustment") {
    requireApproved();if(!["material","credit","other"].includes(String(body.kind))||typeof body.description!=="string"||!body.description.trim()||body.description.length>500)throw new Error("invalid_adjustment");
    add(String(body.kind),integer(body.amountCents,"adjustment",true),`${body.description}: ${reason}`);
  } else if(action==="materials") {
    requireApproved();if(!hasInstallation(i))throw new Error("setup_has_no_materials_allowance");reconcile("materials",integer(body.actualCents,"materials")-pricing.materialsAllowanceCents,`Actual eligible materials reconciled: ${reason}`);
  } else if(action==="setup_materials") {
    requireApproved();if(!hasSetup(i)&&!state.adjustments.some(a=>a.reconciliation_kind?.startsWith("setup_")))throw new Error("setup_not_purchased");reconcile("setup_materials",integer(body.actualCents,"setup_materials"),`Actual customer-authorized eligible Setup parts/materials: ${reason}`);
  } else if(action==="labor") {
    requireApproved();if(running)throw new Error("pause_work_before_labor_reconciliation");if(hasInstallation(i))reconcile("labor",Math.round(additionalLabor(minutes,pricing)),`Additional Installation labor for ${minutes} cumulative work minutes`);
    if(hasSetup(i)||setupMinutes>0)setupReconciliation(i,pricing,true);
  } else if(action==="underground") {
    requireApproved();if(!hasInstallation(i))throw new Error("installation_not_selected");if(typeof body.feet!=="number"||!Number.isFinite(body.feet)||body.feet<0||body.feet>10000)throw new Error("invalid_underground_feet");
    reconcile("underground",undergroundLabor(body.feet,pricing),`Underground labor for ${body.feet} feet: ${reason}`);
    // Materials are part of the one actual-materials reconciliation, never a
    // second allowance. Record their total there, including grounding materials.
    if(body.materialsCents!==undefined)throw new Error("use_total_materials_reconciliation");
  } else if(action==="placement_refusal") {
    requireApproved();requireOpen();if(!hasInstallation(i))throw new Error("installation_not_selected");if(running)throw new Error("pause_work_before_settlement");
    add("credit",-locationRefusalLaborRefund(pricing.laborCents,minutes),`Placement refusal labor credit at ${minutes} cumulative minutes: ${reason}`,"placement_refusal");patch.status="terminated";
  } else if(action==="cancel"||action==="decline") {
    requireOpen();if(running||totalMinutes>0)throw new Error("use_work_or_safety_termination");
    if(action==="decline"&&i.status!=="requested")throw new Error("invalid_transition");
    if(i.pricing_snapshot){const retained=pricing.depositCents-cancellationDepositRefund(pricing.depositCents,i.requested_start_at,now);add("credit",retained-pricing.laborCents-(hasSetup(i)?setupPrice(pricing)-supportDiscount(setupPrice(pricing),remoteSupportEligible===true):0),`Cancellation labor settlement; materials separately reconciled: ${reason}`,"cancellation");}
    patch.status=action==="decline"?"declined":"cancelled";
  }
  const afterPricing=jobPricing({...i,...patch},(patch.pricing_snapshot??i.pricing_snapshot??patch.draft_pricing??i.draft_pricing??defaults) as PricingSnapshot);
  const balanceAfter=installationBalance(afterPricing,[...state.adjustments,...adjustments.map((a,n)=>({id:`new:${n}`,amount_cents:a.amount_cents as number}))],state.payments,state.corrections,state.cashRefunds);
  return {body,patch,adjustments,sessions,stopSession,balanceBefore,balanceAfter};
}
