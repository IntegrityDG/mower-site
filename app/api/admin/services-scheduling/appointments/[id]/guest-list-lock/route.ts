import { adminSetGuestListLock } from "@/lib/demo-party/server";
import { isReviewAdmin } from "@/lib/reviews/admin-auth";
import { isSchedulingId } from "@/lib/scheduling/validation";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isReviewAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!isSchedulingId(id)) return Response.json({ error: "Invalid appointment." }, { status: 400 });
  const body = await request.json().catch(() => null);
  const locked = body?.locked;
  const reason = typeof body?.reason === "string" ? body.reason.trim() : null;
  if (typeof locked !== "boolean" || (locked && (!reason || reason.length > 500))) return Response.json({ error: "A lock reason is required." }, { status: 400 });
  try { await adminSetGuestListLock(id, locked, reason); return Response.json({ locked }); }
  catch { return Response.json({ error: "Guest-list lock could not be changed." }, { status: 409 }); }
}
