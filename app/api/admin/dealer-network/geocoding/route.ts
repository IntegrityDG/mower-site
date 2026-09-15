import { requireDealerNetworkAdmin } from "@/lib/dealer-network/admin-auth";
import { consumeDealerRateLimit, requestClientKey } from "@/lib/dealer-network/member-auth";
import { privateIdentifierHash } from "@/lib/dealer-network/security";
import { diagnoseDealerGeocoder } from "@/lib/dealer-network/geocoding-diagnostic";
import { logGeocodeDiagnostic } from "@/lib/dealer-network/geocoding-adapter";
import { backfillDealerGeocodes } from "@/lib/dealer-network/geocoding-backfill";

export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    await requireDealerNetworkAdmin();
    const allowed = await consumeDealerRateLimit("admin_geocode_diagnostic",
      privateIdentifierHash(requestClientKey(request)), 5, 15 * 60);
    if (!allowed) return Response.json({ error: "Too many geocoding checks. Please wait." },
      { status: 429, headers: { "Cache-Control": "no-store" } });
    const result = await diagnoseDealerGeocoder();
    logGeocodeDiagnostic(result.diagnostic);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const unauthorized = error instanceof Error && error.name === "DealerNetworkAdminError";
    return Response.json({ error: unauthorized ? "Unauthorized" : "Geocoding diagnostic unavailable." },
      { status: unauthorized ? 401 : 503, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: Request) {
  try {
    await requireDealerNetworkAdmin();
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).some((key) => key !== "dryRun") ||
      (body.dryRun !== undefined && typeof body.dryRun !== "boolean"))
      return Response.json({ error: "Backfill accepts only a boolean dryRun option." }, { status: 400 });
    const dryRun = body.dryRun !== false;
    const allowed = await consumeDealerRateLimit("admin_geocode_backfill",
      privateIdentifierHash("dealer-geocode-backfill"), 1, 15 * 60);
    if (!allowed) return Response.json({ error: "A business-location batch was recently requested. Please wait." }, { status: 429 });
    const result = await backfillDealerGeocodes(dryRun);
    return Response.json(result, { status: result.blocked ? 503 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const unauthorized = error instanceof Error && error.name === "DealerNetworkAdminError";
    return Response.json({ error: unauthorized ? "Unauthorized" : "Business-location batch unavailable." },
      { status: unauthorized ? 401 : 503, headers: { "Cache-Control": "no-store" } });
  }
}
