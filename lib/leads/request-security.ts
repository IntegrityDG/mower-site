import "server-only";

import {
  consumeDealerRateLimit,
  requestClientKey,
} from "@/lib/dealer-network/member-auth";

export const MAX_LEAD_REQUEST_BYTES = 32_000;

export async function readLimitedJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    throw new LeadRequestError(415, "Content-Type must be application/json.");
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(declared) || declared < 0 || declared > MAX_LEAD_REQUEST_BYTES)
    throw new LeadRequestError(413, "Request is too large.");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_LEAD_REQUEST_BYTES)
    throw new LeadRequestError(413, "Request is too large.");
  try {
    return JSON.parse(raw);
  } catch {
    throw new LeadRequestError(400, "Invalid request.");
  }
}

export async function requireLeadRateLimit(request: Request, scope: string) {
  const allowed = await consumeDealerRateLimit(scope, requestClientKey(request), 5, 60 * 60);
  if (!allowed) throw new LeadRequestError(429, "Too many recent requests. Please try again later.");
}

export class LeadRequestError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "LeadRequestError";
  }
}
