import "server-only";
import { ServiceError } from "./validation";
import { dealerNetworkOrigin } from "@/lib/dealer-network/api";

export async function serviceBody(request: Request) {
  requireSameOrigin(request);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new ServiceError("JSON is required.");
  // Work sheets can have multiple visits, but every request remains bounded.
  const limit = 256 * 1024;
  if (Number(request.headers.get("content-length")) > limit) throw new ServiceError("Save a smaller work sheet.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new ServiceError("A request body is required.");
  let size = 0; let body = ""; const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new ServiceError("Save a smaller work sheet.", 413); }
      body += decoder.decode(value, { stream: true });
    }
    return JSON.parse(body + decoder.decode());
  } catch (error) { if (error instanceof ServiceError) throw error; throw new ServiceError("Invalid request."); }
  finally { reader.releaseLock(); }
}
export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  // Next can normalize its internal request hostname behind a proxy. Use the
  // existing trusted public-origin provider, never a forwarded browser header.
  const own = dealerNetworkOrigin(request);
  if (origin !== own) throw new ServiceError("Request origin is not allowed.", 403);
}
export function serviceResponse(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer" } });
}
export function serviceApiError(error: unknown) {
  return serviceResponse({ error: error instanceof ServiceError ? error.message : "This Service request could not be completed." }, error instanceof ServiceError ? error.status : 503);
}
