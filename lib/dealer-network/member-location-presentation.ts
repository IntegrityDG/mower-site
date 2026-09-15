import type { MemberAccountSecuritySummary } from "./types";

export function businessLocationLabel(summary: Pick<MemberAccountSecuritySummary, "businessLocationReady" | "businessLocationState">,
  refreshing = false) {
  if (refreshing || summary.businessLocationState === "refreshing") return "Business location is being refreshed";
  if (summary.businessLocationReady) return "Business location ready";
  if (summary.businessLocationState === "unavailable") return "Location service temporarily unavailable";
  return "Business location needs attention";
}
