import { deleteGuest, updateGuest } from "@/lib/demo-party/server";
import { validateGuest } from "@/lib/demo-party/validation";

const noStore = { "Cache-Control": "private, no-store" };
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(request: Request, context: { params: Promise<{ token: string; guestId: string }> }) {
  const { token, guestId } = await context.params;
  if (!idPattern.test(guestId)) return Response.json({ error: "Invalid guest." }, { status: 400, headers: noStore });
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 2_000) return Response.json({ error: "Request is too large." }, { status: 413, headers: noStore });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { body = null; }
  const parsed = validateGuest(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400, headers: noStore });
  try { return Response.json({ guest: await updateGuest(token, guestId, parsed.value) }, { headers: noStore }); }
  catch (error) { const code=String((error as{message?:string})?.message??""); return Response.json({ error: /duplicate|unique/i.test(code) ? "That guest email is already registered for this Demo Party." : "Guest details could not be updated." }, { status: /duplicate|unique/i.test(code) ? 409 : 403, headers: noStore }); }
}

export async function DELETE(_request: Request, context: { params: Promise<{ token: string; guestId: string }> }) {
  const { token, guestId } = await context.params;
  if (!idPattern.test(guestId)) return Response.json({ error: "Invalid guest." }, { status: 400, headers: noStore });
  try { await deleteGuest(token, guestId); return new Response(null, { status: 204, headers: noStore }); }
  catch { return Response.json({ error: "Guest could not be removed." }, { status: 403, headers: noStore }); }
}
