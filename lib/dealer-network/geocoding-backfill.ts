import "server-only";

import { getSupabaseServiceClient } from "@/lib/supabase";
import { diagnoseDealerGeocoder } from "./geocoding-diagnostic";
import { refreshStoredMemberGeocode } from "./geocoding";

/** At most five sequential member calls, paced; stop on configuration/infrastructure failures. */
export async function backfillDealerGeocodes(dryRun = true,
  pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))) {
  if (!dryRun) {
    const check = await diagnoseDealerGeocoder();
    if (check.diagnostic.reason !== "SUCCESS")
      return { dryRun, eligible: 0, attempted: 0, succeeded: 0, failed: 0, skipped: 0, blocked: check.diagnostic.reason };
  }
  const { data, error } = await getSupabaseServiceClient().rpc("dealer_network_geocode_candidates", { p_limit: 5 });
  if (error || !Array.isArray(data)) throw new Error("DEALER_GEOCODE_CANDIDATES_UNAVAILABLE");
  const ids = [...new Set(data.filter((id): id is string => typeof id === "string"))].slice(0, 5);
  const summary = { dryRun, eligible: ids.length, attempted: 0, succeeded: 0, failed: 0, skipped: 0, blocked: null as string | null };
  if (dryRun) return summary;
  for (const id of ids) {
    const { data: current, error: readError } = await getSupabaseServiceClient().rpc("dealer_network_admin_security", { p_member_id: id });
    if (readError) { summary.blocked = "DATABASE_READ_FAILED"; break; }
    if (current?.geocodeStatus === "succeeded") { summary.skipped++; continue; }
    if (summary.attempted) await pause(1100);
    const result = await refreshStoredMemberGeocode(id);
    summary.attempted++;
    if (result.success) summary.succeeded++;
    else {
      summary.failed++;
      if (!["NO_RESULTS", "INVALID_REQUEST", "INCOMPLETE_ADDRESS", "MALFORMED_ADDRESS", "ADDRESS_CHANGED"].includes(result.reason)) {
        summary.blocked = result.reason;
        break;
      }
    }
  }
  console.info(JSON.stringify({ event: "dealer_geocode_backfill", ...summary }));
  return summary;
}
