import { getAvailableSlots } from "@/lib/demo-scheduling/server";
import { DEMO_DURATION_MINUTES } from "@/lib/demo-scheduling/types";
import { validateDateRange } from "@/lib/demo-scheduling/validation";
export async function GET(request:Request){const p=new URL(request.url).searchParams,range=validateDateRange(p.get("start"),p.get("end"));if(!range)return Response.json({error:"Choose a valid date range of 42 days or fewer."},{status:400});try{return Response.json({timezone:"America/Chicago",durationMinutes:DEMO_DURATION_MINUTES,slots:await getAvailableSlots(range.start,range.end)});}catch{return Response.json({error:"Demo availability is temporarily unavailable."},{status:503});}}
