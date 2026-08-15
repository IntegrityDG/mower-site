import "server-only";

import { MemberAccessError } from "./member-auth";

export function dealerNetworkOrigin(request: Request) {
  const configured = process.env.IDS_SITE_URL?.trim();
  if (configured) {
    const url = new URL(configured);
    const local =
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]";
    if (url.protocol !== "https:" && !local)
      throw new Error("IDS_SITE_URL must use HTTPS.");
    return url.origin;
  }
  if (process.env.NODE_ENV === "production")
    return "https://integrityautomowers.com";
  const requestUrl = new URL(request.url);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(requestUrl.hostname))
    throw new Error("A trusted Dealer Network origin is unavailable.");
  return requestUrl.origin;
}

export function memberApiError(
  error: unknown,
  fallback = "The request could not be completed.",
) {
  if (error instanceof MemberAccessError)
    return Response.json({ error: error.message }, { status: error.status });
  return Response.json({ error: fallback }, { status: 500 });
}
