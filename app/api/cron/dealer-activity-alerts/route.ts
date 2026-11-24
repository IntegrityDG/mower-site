import { timingSafeEqual } from "node:crypto";
import { runDealerActivityAlerts } from "@/lib/dealer-network/activity-alert-worker";

export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const provided = Buffer.from(request.headers.get("authorization") ?? "");
  if (secret.length < 32 || provided.length !== expected.length || !timingSafeEqual(provided, expected))
    return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production")
    return Response.json({ error: "Not found" }, { status: 404, headers });
  try {
    return Response.json(await runDealerActivityAlerts(), { headers });
  } catch {
    return Response.json({ error: "Dealer activity processing failed." }, { status: 500, headers });
  }
}

// Do not inherit GET's deliver-on-schedule behavior for HTTP HEAD.
export function HEAD() {
  return new Response(null, { status: 405, headers });
}
