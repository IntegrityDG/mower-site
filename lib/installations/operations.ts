import "server-only";
import { isReviewAdmin } from "@/lib/reviews/admin-auth";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { approvedPricing, operationKey, prepareAdminOperation, validateAdminInput, type AdminState } from "./admin-policy";
import type { PricingSnapshot } from "./policy";

export function pricingFromRow(data: Record<string, number>): PricingSnapshot {
  return {laborCents:data.labor_cents,materialsAllowanceCents:data.materials_allowance_cents,depositCents:data.deposit_cents,
    includedLaborMinutes:data.included_labor_minutes,additionalLaborHourlyCents:data.additional_labor_hourly_cents,laborIncrementMinutes:data.labor_increment_minutes,
    undergroundPerSegmentCents:data.underground_per_segment_cents,undergroundSegmentFeet:data.underground_segment_feet,includedOneWayTravelMinutes:data.included_one_way_travel_minutes,travelHourlyCents:data.travel_hourly_cents};
}
export async function executeInstallationAdmin(id: string, raw: unknown) {
  if(!(await isReviewAdmin()))throw new Error("Unauthorized");
  const validate=()=>{try {operationKey(id);return validateAdminInput(raw);}catch(error){throw Object.assign(error as Error,{safeToEdit:true});}};
  const body=validate(),db=getSupabaseServiceClient();
  const {data:existing,error:existingError}=await db.from("installation_admin_operations").select("installation_id,payload,result").eq("operation_key",body.operationKey).maybeSingle();
  if(existingError)throw existingError;
  if(existing){
    const {isDeepStrictEqual}=await import("node:util");
    if(existing.installation_id!==id||!isDeepStrictEqual(existing.payload,body))throw new Error("admin_operation_conflict");
    return {...existing.result,replayed:true};
  }
  const [{data:state,error:stateError},{data:defaults,error:defaultsError}]=await Promise.all([
    db.rpc("ids_installation_admin_state",{p_id:id}),db.from("installation_pricing_settings").select("*").eq("id",true).single(),
  ]);
  if(stateError||defaultsError)throw stateError??defaultsError;if(!state||!defaults)throw new Error("installation_read_incomplete");
  const plan=()=>{try{return prepareAdminOperation(state as AdminState,body,pricingFromRow(defaults));}catch(error){throw Object.assign(error as Error,{safeToEdit:true});}};
  const op=plan();
  const {data,error}=await db.rpc("ids_apply_installation_admin",{p_id:id,p_key:body.operationKey,p_payload:op.body,p_expected:state,p_patch:op.patch,
    p_adjustments:op.adjustments,p_sessions:op.sessions,p_stop_session:op.stopSession,p_balance_before:op.balanceBefore,p_balance_after:op.balanceAfter});
  if(error)throw error;if(!data?.ok)throw new Error("admin_operation_response_incomplete");return data;
}
export async function saveInstallationDefaults(raw: unknown) {
  if(!(await isReviewAdmin()))throw new Error("Unauthorized");
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new Error("invalid_pricing");
  const body=raw as Record<string,unknown>;
  if(Object.keys(body).some(k=>!["operationKey","pricing","reason"].includes(k)))throw new Error("invalid_pricing");
  const key=operationKey(body.operationKey),pricing=approvedPricing(body.pricing);
  if(typeof body.reason!=="string"||!body.reason.trim()||body.reason.length>2000)throw new Error("recorded_reason_required");
  const db=getSupabaseServiceClient(),{data:current,error:readError}=await db.from("installation_pricing_settings").select("*").eq("id",true).single();
  if(readError)throw readError;
  const {data,error}=await db.rpc("ids_save_installation_pricing",{p_key:key,p_pricing:pricing,p_expected:current,p_reason:body.reason.trim()});
  if(error)throw error;if(!data?.ok)throw new Error("pricing_response_incomplete");return data;
}
export const saveInstallationTravel=(id:string,body:Record<string,unknown>)=>executeInstallationAdmin(id,{...body,action:"travel"});
export const startAuthorizedWork=(id:string,body:Record<string,unknown>)=>executeInstallationAdmin(id,{...body,action:"session_start"});
export const correctWorkSession=(id:string,body:Record<string,unknown>)=>executeInstallationAdmin(id,{...body,action:"session_correct"});
export const recordPlacementRefusal=(id:string,body:Record<string,unknown>)=>executeInstallationAdmin(id,{...body,action:"placement_refusal"});
