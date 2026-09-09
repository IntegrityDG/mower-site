import { executeInstallationAdmin, pricingFromRow } from "./operations";
import { validateInstallationIntake } from "./validation";
import { installationBalance } from "./accounting";
import { requireInstallationIntake } from "./controls";
import "server-only";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { DEFAULT_PRICING, type PricingSnapshot } from "./policy";
import type { InstallationIntake } from "./validation";
import { requireServiceAvailability } from "@/lib/service/availability";
const c = () => getSupabaseServiceClient();
export async function pricingSettings(): Promise<PricingSnapshot> {
  const {data,error}=await c().from("installation_pricing_settings").select("*").eq("id",true).single();
  if(error)throw error;if(!data)throw new Error("installation_read_incomplete");return pricingFromRow(data);
}
export async function createInstallation(value: InstallationIntake) {
  requireInstallationIntake();const parsed=validateInstallationIntake(value);if(!parsed.ok)throw new Error("invalid_intake");
  await requireServiceAvailability("professional_installation");
  if(parsed.value.setupSelected)await requireServiceAvailability("professional_setup");
  const {data,error}=await c().rpc("ids_create_installation",{p_payload:parsed.value});
  if(error)throw error;if(!data?.id||!data.public_token)throw new Error("installation_response_incomplete");return data;
}
export async function adminInstallations() {
    const db = c();
    const results = await Promise.all([
        db.from("installations").select("*").order("requested_start_at"),
        db.from("installation_work_sessions").select("*").order("started_at"),
        db.from("installation_payments").select("*").order("created_at"),
        db.from("installation_adjustments").select("*").order("created_at"),
        db.from("installation_cash_corrections").select("*").order("created_at"),
        db.from("installation_cash_refunds").select("*").order("created_at"),
        db.from("installation_audit_events").select("*").order("created_at"),
        db.from("installation_pricing_history").select("*").order("created_at"),
    ]);
    for (const result of results) {
        if (result.error)
            throw result.error;
        if (!result.data)
            throw new Error("installation_read_incomplete");
    }
    // Preserve readable receipts and confirmation controls if one ledger cannot be calculated.
    const balances: Record<string, ReturnType<typeof installationBalance> | null> = {};
    for (const i of results[0].data!) {
        try { balances[i.id] = i.pricing_snapshot ? installationBalance(i.pricing_snapshot, results[3].data!.filter(a => a.installation_id === i.id), results[2].data!.filter(p => p.installation_id === i.id), results[4].data!.filter(c => c.installation_id === i.id), results[5].data!.filter(r => r.installation_id === i.id)) : null; }
        catch { balances[i.id] = null; }
    }
    return { balances, installations: results[0].data!, sessions: results[1].data!, payments: results[2].data!, adjustments: results[3].data!, corrections: results[4].data!, cashRefunds: results[5].data!, audits: results[6].data!, pricingHistory: results[7].data!, pricing: await pricingSettings() };
}
export const approveInstallation=(id:string,body:Record<string,unknown>)=>executeInstallationAdmin(id,{...body,action:"approve"});
export async function installationByToken(token: string) {
    const db = c(), { data: i, error } = await db.from("installations").select("*").eq("public_token", token).single().throwOnError();
    if (error)
        throw error;
    if (!i)
        throw new Error("installation_read_incomplete");
    const results = await Promise.all([
        db.from("installation_payments").select("*").eq("installation_id", i.id),
        db.from("installation_adjustments").select("*").eq("installation_id", i.id),
        db.from("installation_work_sessions").select("*").eq("installation_id", i.id).order("started_at"),
        db.from("installation_cash_corrections").select("id,installation_id,original_payment_id,amount_cents,created_at").eq("installation_id", i.id),
        db.from("installation_cash_refunds").select("id,installation_id,original_payment_id,amount_cents,returned_at,created_at").eq("installation_id", i.id),
    ]);
    for (const result of results) {
        if (result.error)
            throw result.error;
        if (!result.data)
            throw new Error("installation_read_incomplete");
    }
    if (i.pricing_snapshot)
        installationBalance(i.pricing_snapshot, results[1].data!, results[0].data!, results[3].data!, results[4].data!);
    const publicFields=["id","public_token","status","requested_start_at","requested_end_at","internet_availability","pricing_snapshot","deposit_due_cents","balance_due_at","cash_status","payment_status","installation_selected","setup_selected","approved_travel_charge_cents","travel_policy"];
    const publicInstallation=Object.fromEntries(publicFields.filter(k=>k in i).map(k=>[k,i[k]]));
    return { installation: publicInstallation, payments: results[0].data!.map(p=>({id:p.id,purpose:p.purpose,method:p.method,status:p.status,amount_cents:p.amount_cents,refunded_cents:p.refunded_cents,paid_at:p.paid_at,original_payment_id:p.original_payment_id??null})), adjustments: results[1].data!.map(a=>({id:a.id,amount_cents:a.amount_cents,reconciliation_kind:a.reconciliation_kind})), sessions: results[2].data!.map(s=>({id:s.id,status:s.status,duration_minutes:s.duration_minutes,duration_seconds:s.duration_seconds,started_at:s.started_at,ended_at:s.ended_at,corrected_from_id:s.corrected_from_id,service_type:s.service_type})), corrections: results[3].data!, cashRefunds: results[4].data! };
}
export {saveInstallationDefaults as savePricing} from "./operations";
export async function mutateInstallation(id:string,action:string,body:Record<string,unknown>){
  if(action==="cash_paid")throw new Error("Use the authorized cash receipt endpoint with a stable operation key.");
  return executeInstallationAdmin(id,{...body,action});
}
export {DEFAULT_PRICING};
