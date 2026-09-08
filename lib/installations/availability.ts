import "server-only";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { centralDate } from "@/lib/demo-scheduling/time";
export async function installationSlots(start:string,end:string) {
  const {data,error}=await getSupabaseServiceClient().rpc("ids_list_installation_slots",{p_start:start,p_end:end});
  if(error)throw error;if(!Array.isArray(data))throw new Error("installation_read_incomplete");
  return data.map((row:{start_at:string;end_at:string})=>({startAt:new Date(row.start_at).toISOString(),endAt:new Date(row.end_at).toISOString(),date:centralDate(new Date(row.start_at)),
    timeLabel:new Intl.DateTimeFormat("en-US",{timeZone:"America/Chicago",hour:"numeric",minute:"2-digit"}).format(new Date(row.start_at))+" CT"}));
}
