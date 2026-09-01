import { addGuest } from "@/lib/demo-party/server";
import { validateGuest } from "@/lib/demo-party/validation";

const noStore = { "Cache-Control": "private, no-store" };

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 4_000) return Response.json({ error: "Request is too large." }, { status: 413, headers: noStore });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { body = null; }
  const parsed = validateGuest(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400, headers: noStore });
  try {
    const { token } = await context.params;
    return Response.json({ guest: await addGuest(token, parsed.value) }, { status: 201, headers: noStore });
  } catch (error) {
    const code = String((error as { message?: string })?.message ?? "");
    if (/guest_list_locked/i.test(code)) return Response.json({ error: "The guest list is locked. Contact IDS for help." }, { status: 409, headers: noStore });
    if (/duplicate|unique/i.test(code)) return Response.json({ error: "That guest email is already registered for this Demo Party." }, { status: 409, headers: noStore });
    return Response.json({ error: "Guest details could not be saved." }, { status: 403, headers: noStore });
  }
}
