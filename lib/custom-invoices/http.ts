import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { isReviewAdmin } from "@/lib/reviews/admin-auth";
import { InvoiceValidationError } from "./domain";

export class InvoiceHttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function requireInvoiceAdmin() {
  if (!(await isReviewAdmin())) throw new InvoiceHttpError(401, "Unauthorized");
}

export function requireSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) throw new InvoiceHttpError(403, "Request origin is required.");
  let originHost = "";
  try { originHost = new URL(origin).host; } catch { throw new InvoiceHttpError(403, "Request origin is invalid."); }
  if (originHost !== host || (fetchSite && fetchSite !== "same-origin")) throw new InvoiceHttpError(403, "Cross-site request denied.");
}

export async function readInvoiceJson(request: NextRequest) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) throw new InvoiceHttpError(415, "Content-Type must be application/json.");
  const length = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(length) || length < 0 || length > 256_000) throw new InvoiceHttpError(413, "Request is too large.");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 256_000) throw new InvoiceHttpError(413, "Request is too large.");
  try { return JSON.parse(raw) as unknown; } catch { throw new InvoiceHttpError(400, "Invalid JSON request."); }
}

export function operationKey(value: unknown) {
  if (typeof value !== "string" || !/^[A-Za-z0-9:_-]{8,200}$/.test(value)) throw new InvoiceHttpError(400, "A valid operation key is required.");
  return value;
}

export function invoiceApiError(error: unknown) {
  if (error instanceof InvoiceHttpError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof InvoiceValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
  const message = error instanceof Error && /stale|changed in another session/i.test(error.message) ? error.message : error instanceof Error && /required|invalid|cannot|must|not found|balance/i.test(error.message) ? error.message : "Invoice operation failed.";
  return NextResponse.json({ error: message }, { status: /not found/i.test(message) ? 404 : /stale|changed/i.test(message) ? 409 : 400 });
}
