import { fetch as privateFetch } from "undici";
import { context } from "@opentelemetry/api";
import { suppressTracing } from "@opentelemetry/core";
import { calendarRangeBridge } from "@/lib/calendar/bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export function GET(request: Request) {
  // OpenTelemetry HTTP instrumentation must not record the credential-bearing
  // upstream URL. Keep suppression scoped to this request, not the rest of IDS.
  return context.with(suppressTracing(context.active()), () =>
    calendarRangeBridge(request, process.env, privateFetch as unknown as typeof fetch));
}

function readOnly(request: Request) {
  // The method guard runs before reading configuration or touching the feed.
  return calendarRangeBridge(request);
}

export const HEAD = readOnly;
export const POST = readOnly;
export const PUT = readOnly;
export const PATCH = readOnly;
export const DELETE = readOnly;
export const OPTIONS = readOnly;
