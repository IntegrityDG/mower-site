import { context } from "@opentelemetry/api";
import { suppressTracing } from "@opentelemetry/core";
import { digestMethodNotAllowed } from "@/lib/calendar/digest";
import { serverDailyDigest } from "@/lib/calendar/digest-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function handle(request: Request) {
  // Keep credential-bearing upstream requests and calendar content out of HTTP
  // tracing. Suppression is scoped to this digest, leaving other IDS routes alone.
  return context.with(suppressTracing(context.active()), () => serverDailyDigest(request));
}

export const GET = handle;
export const POST = handle;
export const HEAD = digestMethodNotAllowed;
export const PUT = digestMethodNotAllowed;
export const PATCH = digestMethodNotAllowed;
export const DELETE = digestMethodNotAllowed;
export const OPTIONS = digestMethodNotAllowed;
