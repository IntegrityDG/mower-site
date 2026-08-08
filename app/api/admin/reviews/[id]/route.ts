import { NextRequest, NextResponse } from "next/server";
import { isReviewAdmin } from "@/lib/reviews/admin-auth";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { moderationUpdate } from "@/lib/reviews/moderation";
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isReviewAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params; const body = await request.json().catch(() => ({}));
  const now = new Date().toISOString(); const update: Record<string, unknown> = {};
  const client = getSupabaseServiceClient();
  const { data: existing } = await client.from("customer_reviews").select("status").eq("id", id).maybeSingle();
  const actionMap = { approved: "approve", rejected: "reject", hidden: "hide", restore: "restore" } as const;
  if (body.action in actionMap) {
    const transition = existing && moderationUpdate(existing.status, actionMap[body.action as keyof typeof actionMap], now);
    if (!transition) return NextResponse.json({ error: "Invalid status transition." }, { status: 409 });
    Object.assign(update, transition);
  } else if (body.action === "response") {
    if (existing?.status !== "approved") return NextResponse.json({ error: "Responses may only be published on approved reviews." }, { status: 409 });
    const response = typeof body.response === "string" ? body.response.trim().slice(0, 2000) : "";
    Object.assign(update, { ids_response: response || null, ids_response_at: response ? now : null });
  } else return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  Object.keys(update).forEach((key) => update[key] === undefined && delete update[key]);
  const { error } = await client.from("customer_reviews").update(update).eq("id", id);
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ success: true });
}
