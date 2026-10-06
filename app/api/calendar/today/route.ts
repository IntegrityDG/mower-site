import { fetch as privateFetch } from "undici";
import { context } from "@opentelemetry/api";
import { suppressTracing } from "@opentelemetry/core";
import { calendarBridge } from "@/lib/calendar/bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export function GET(request: Request) {
  // OpenTelemetry HTTP instrumentation must not record the credential-bearing
  // upstream URL. Keep suppression scoped to this request, not the rest of IDS.
  return context.with(suppressTracing(context.active()), () =>
    calendarBridge(request, process.env, privateFetch as unknown as typeof fetch));
}

function readOnly() {
  return Response.json({ error: "Method not allowed" }, {
    status: 405,
    headers: { Allow: "GET", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow, noarchive" },
  });
}

export const HEAD = readOnly;
export const POST = readOnly;
export const PUT = readOnly;
export const PATCH = readOnly;
export const DELETE = readOnly;
export const OPTIONS = readOnly;
