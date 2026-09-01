import { readAdminDemoParty } from "@/lib/demo-party/server";
import { isReviewAdmin } from "@/lib/reviews/admin-auth";
import { isSchedulingId } from "@/lib/scheduling/validation";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isReviewAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!isSchedulingId(id)) return Response.json({ error: "Invalid appointment." }, { status: 400 });
  try { return Response.json(await readAdminDemoParty(id), { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return Response.json({ error: "Appointment operations could not be loaded." }, { status: 500 }); }
}
