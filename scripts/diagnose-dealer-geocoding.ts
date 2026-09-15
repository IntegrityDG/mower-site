import { diagnoseDealerGeocoder } from "../lib/dealer-network/geocoding-diagnostic";

// Run with `vercel env run -e production -- node --import tsx scripts/diagnose-dealer-geocoding.ts`.
// No environment files are written and no private record or geographic point is output.
async function main() {
  const result = await diagnoseDealerGeocoder();
  console.info(JSON.stringify({ event: "dealer_geocoding_diagnostic", configuration: result.configured ? "PRESENT" : "MISSING",
    ...result.diagnostic }));
  if (result.diagnostic.reason !== "SUCCESS") process.exitCode = 1;
}
void main().catch(() => { console.error("DEALER_GEOCODING_DIAGNOSTIC_FAILED"); process.exitCode = 1; });
