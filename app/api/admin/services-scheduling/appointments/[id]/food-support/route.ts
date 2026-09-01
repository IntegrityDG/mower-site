import { adminSetDemoPartyFood } from "@/lib/demo-party/server";
import { isReviewAdmin } from "@/lib/reviews/admin-auth";
import { isSchedulingId } from "@/lib/scheduling/validation";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isReviewAdmin())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!isSchedulingId(id)) return Response.json({ error: "Invalid appointment." }, { status: 400 });
  const body = await request.json().catch(() => null);
  const status = typeof body?.status === "string" ? body.status : "";
  const notes = typeof body?.notes === "string" ? body.notes.trim() || null : null;
  const budgetCents = body?.budgetCents === null ? null : Number(body?.budgetCents);
  if (!["not_planned","planned","arranged","completed","cancelled"].includes(status) || (notes?.length ?? 0) > 1000 || (budgetCents !== null && (!Number.isSafeInteger(budgetCents) || budgetCents < 0 || budgetCents > 15_000))) return Response.json({ error: "Choose a food-support status; budget must be $150 or less and notes under 1,000 characters." }, { status: 400 });
  try { await adminSetDemoPartyFood(id, status, notes, budgetCents); return Response.json({ saved: true }); }
  catch { return Response.json({ error: "Food support could not be saved." }, { status: 409 }); }
}
