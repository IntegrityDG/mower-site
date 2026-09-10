import "server-only";

import { MemberAccessError } from "./member-auth";
import { idsSiteOrigin, isLocalSiteHostname } from "@/lib/site-origin";

export function dealerNetworkOrigin(request: Request) {
  const configured = process.env.IDS_SITE_URL?.trim();
  const requestUrl = new URL(request.url);
  if (
    !configured &&
    process.env.NODE_ENV !== "production" &&
    !isLocalSiteHostname(requestUrl.hostname)
  ) {
    throw new Error("A trusted Dealer Network origin is unavailable.");
  }
  return idsSiteOrigin(requestUrl.origin);
}

export function memberApiError(
  error: unknown,
  fallback = "The request could not be completed.",
) {
  if (error instanceof MemberAccessError)
    return Response.json({ error: error.message }, { status: error.status });
  return Response.json({ error: fallback }, { status: 500 });
}
