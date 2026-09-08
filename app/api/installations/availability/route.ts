import { installationControls } from "@/lib/installations/controls";
import { installationSlots } from "@/lib/installations/availability";
import { validateDateRange } from "@/lib/demo-scheduling/validation";
import { isReviewAdmin } from "@/lib/reviews/admin-auth";
export async function GET(request:Request) {
  if(!installationControls().intakeEnabled&&!(await isReviewAdmin()))return Response.json({error:"New installation requests are not yet open."},{status:503});
  const params=new URL(request.url).searchParams,range=validateDateRange(params.get("start"),params.get("end"));
  if(!range)return Response.json({error:"Choose a valid date range of 42 days or fewer."},{status:400});
  try{return Response.json({timezone:"America/Chicago",appointmentType:"install",durationMinutes:240,slots:await installationSlots(range.start,range.end)},{headers:{"Cache-Control":"no-store"}});}
  catch{return Response.json({error:"Installation availability is unavailable or has not been initialized."},{status:503});}
}
