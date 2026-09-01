import { setBonusElection } from "@/lib/demo-party/server";
import { BONUS_CREDIT_ELECTIONS, type BonusCreditElection } from "@/lib/demo-party/types";

const noStore = { "Cache-Control": "private, no-store" };

export async function PUT(request: Request, context: { params: Promise<{ token: string }> }) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 1_000) return Response.json({ error: "Request is too large." }, { status: 413, headers: noStore });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { body = null; }
  const election = body && typeof body === "object" ? (body as { election?: unknown }).election : null;
  if (!BONUS_CREDIT_ELECTIONS.includes(election as BonusCreditElection)) return Response.json({ error: "Choose accessories or machine discount." }, { status: 400, headers: noStore });
  try {
    const { token } = await context.params;
    await setBonusElection(token, election as BonusCreditElection);
    return Response.json({ election }, { headers: noStore });
  } catch { return Response.json({ error: "That election could not be saved." }, { status: 403, headers: noStore }); }
}
