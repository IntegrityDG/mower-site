import { isCronAuthorized } from "@/lib/featured-businesses/cron-auth";
import { serviceControls } from "@/lib/service/controls";
import { runServiceMaintenance } from "@/lib/service/outbox";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  if (!isCronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!serviceControls().maintenance) return Response.json({ skipped: true });
  try { const result = await runServiceMaintenance(); return Response.json(result, { status: result.failures ? 503 : 200 }); }
  catch { return Response.json({ error: "Service maintenance requires retry." }, { status: 503 }); }
}
