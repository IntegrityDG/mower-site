import "server-only";

import { getSupabaseServiceClient } from "@/lib/supabase";
import { geocodeUsLocation, GeocodingProviderError, validGeocodePoint,
  type GeocodeFailureReason, type GeocodePoint, type GeocodeDiagnostic } from "./geocoding-adapter";
import { inspectMemberGeocodeAddress, storedGeocodeAddress, type MemberGeocodeAddress } from "./geocoding-address";

export { geocodeUsLocation } from "./geocoding-adapter";
export { memberAddressQuery } from "./geocoding-address";

export type MemberGeocodeResult =
  | { success: true; status: "succeeded"; point: GeocodePoint }
  | { success: false; status: "failed" | "stale"; reason: GeocodeFailureReason };

/** Exception messages can contain private Google URLs or database row details. */
function logMemberGeocode(memberId: string, reason: GeocodeFailureReason | "SUCCESS",
  diagnostic?: GeocodeDiagnostic, databaseCode?: unknown) {
  const safeCode = typeof databaseCode === "string" && /^(?:[A-Z0-9]{5}|PGRST\d{3})$/.test(databaseCode) ? databaseCode : undefined;
  const event = JSON.stringify({ event: "dealer_member_geocode", memberId, reason,
    ...(diagnostic ? { providerStatus: diagnostic.providerStatus, httpStatus: diagnostic.httpStatus,
      resultCount: diagnostic.resultCount, validPoint: diagnostic.validPoint,
      configurationIssue: diagnostic.configurationIssue } : {}), ...(safeCode ? { databaseCode: safeCode } : {}) });
  if (reason === "SUCCESS") console.info(event);
  else console.warn(event);
}

export async function markMemberGeocodeStale(memberId: string) {
  try {
    const { error } = await getSupabaseServiceClient().rpc("dealer_network_set_location", {
      p_member_id: memberId, p_status: "stale", p_latitude: null, p_longitude: null,
      p_provider: "google-geocoding-v3", p_error: null,
    });
    if (error) throw error;
  } catch {
    logMemberGeocode(memberId, "DATABASE_SAVE_FAILED");
    throw new Error("DEALER_LOCATION_STALE_SAVE_FAILED");
  }
}

export async function refreshMemberGeocode(member: MemberGeocodeAddress & { id: string },
  geocoder = geocodeUsLocation): Promise<MemberGeocodeResult> {
  const address = inspectMemberGeocodeAddress(member);
  let point: GeocodePoint | null = null;
  let reason: GeocodeFailureReason | null = address.quality === "COMPLETE" ? null :
    address.quality === "INCOMPLETE" ? "INCOMPLETE_ADDRESS" : "MALFORMED_ADDRESS";
  let diagnostic: GeocodeDiagnostic | undefined;
  if (address.query) {
    try {
      point = await geocoder(address.query);
      if (point === null) reason = "NO_RESULTS";
      else if (!validGeocodePoint(point)) { point = null; reason = "BAD_PROVIDER_RESPONSE"; }
    } catch (error) {
      diagnostic = error instanceof GeocodingProviderError ? error.diagnostic : undefined;
      reason = error instanceof GeocodingProviderError ?
        (diagnostic?.reason === "ZERO_RESULTS" ? "NO_RESULTS" : diagnostic?.reason ?? error.reason) as GeocodeFailureReason : "UNAVAILABLE";
      point = null;
    }
  }
  try {
    const { data: saved, error } = await getSupabaseServiceClient().rpc("dealer_network_save_geocode", {
      p_member_id: member.id, p_expected_address: storedGeocodeAddress(member),
      p_status: point ? "succeeded" : "failed", p_latitude: point?.latitude ?? null,
      p_longitude: point?.longitude ?? null, p_provider: "google-geocoding-v3", p_error: reason,
    });
    if (error) {
      logMemberGeocode(member.id, "DATABASE_SAVE_FAILED", diagnostic, error.code);
      return { success: false, status: "failed", reason: "DATABASE_SAVE_FAILED" };
    }
    if (saved !== true) {
      logMemberGeocode(member.id, "ADDRESS_CHANGED", diagnostic);
      return { success: false, status: "stale", reason: "ADDRESS_CHANGED" };
    }
  } catch {
    logMemberGeocode(member.id, "DATABASE_SAVE_FAILED", diagnostic);
    return { success: false, status: "failed", reason: "DATABASE_SAVE_FAILED" };
  }
  logMemberGeocode(member.id, point ? "SUCCESS" : reason!, diagnostic);
  return point ? { success: true, status: "succeeded", point } : { success: false, status: "failed", reason: reason! };
}

export async function refreshStoredMemberGeocode(memberId: string): Promise<MemberGeocodeResult> {
  try {
    const { data, error } = await getSupabaseServiceClient().from("dealer_network_members")
      .select("id,address_line_1,address_line_2,city,state,zip_code,country")
      .eq("id", memberId).is("deleted_at", null).single();
    if (error || !data) {
      logMemberGeocode(memberId, "DATABASE_READ_FAILED", undefined, error?.code);
      return { success: false, status: "failed", reason: "DATABASE_READ_FAILED" };
    }
    return refreshMemberGeocode({ id: data.id, addressLine1: data.address_line_1,
      addressLine2: data.address_line_2, city: data.city, state: data.state, zipCode: data.zip_code, country: data.country });
  } catch {
    logMemberGeocode(memberId, "DATABASE_READ_FAILED");
    return { success: false, status: "failed", reason: "DATABASE_READ_FAILED" };
  }
}
