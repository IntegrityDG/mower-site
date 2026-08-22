import "server-only";

import { getSupabaseServiceClient } from "@/lib/supabase";
import {
  geocodeUsLocation,
  GeocodingProviderError,
  type GeocodeFailureReason,
  type GeocodePoint,
} from "./geocoding-adapter";

export { geocodeUsLocation } from "./geocoding-adapter";

export type MemberGeocodeResult =
  | { success: true; status: "succeeded"; point: GeocodePoint }
  | { success: false; status: "failed"; reason: GeocodeFailureReason };

export function memberAddressQuery(member: {
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state: string;
  zipCode: string;
}) {
  return [
    member.addressLine1,
    member.addressLine2,
    member.city,
    member.state,
    member.zipCode,
    "United States",
  ]
    .filter(Boolean)
    .join(", ");
}

export async function markMemberGeocodeStale(memberId: string) {
  const { error } = await getSupabaseServiceClient().rpc(
    "dealer_network_set_location",
    {
      p_member_id: memberId,
      p_status: "stale",
      p_latitude: null,
      p_longitude: null,
      p_provider: "google-geocoding-v3",
      p_error: null,
    },
  );
  if (error) throw error;
}

export async function refreshMemberGeocode(
  member: {
    id: string;
    addressLine1: string;
    addressLine2?: string | null;
    city: string;
    state: string;
    zipCode: string;
  },
  geocoder = geocodeUsLocation,
): Promise<MemberGeocodeResult> {
  const client = getSupabaseServiceClient();
  let point: GeocodePoint | null;
  try {
    point = await geocoder(memberAddressQuery(member));
  } catch (error) {
    const reason =
      error instanceof GeocodingProviderError ? error.reason : "UNAVAILABLE";
    const { error: saveError } = await client.rpc(
      "dealer_network_set_location",
      {
        p_member_id: member.id,
        p_status: "failed",
        p_latitude: null,
        p_longitude: null,
        p_provider: "google-geocoding-v3",
        p_error: reason,
      },
    );
    if (saveError) throw saveError;
    return { success: false, status: "failed", reason };
  }
  const { error } = await client.rpc("dealer_network_set_location", {
    p_member_id: member.id,
    p_status: point ? "succeeded" : "failed",
    p_latitude: point?.latitude ?? null,
    p_longitude: point?.longitude ?? null,
    p_provider: "google-geocoding-v3",
    p_error: point ? null : "NO_RESULTS",
  });
  if (error) throw error;
  return point
    ? { success: true, status: "succeeded", point }
    : { success: false, status: "failed", reason: "NO_RESULTS" };
}

export async function refreshStoredMemberGeocode(
  memberId: string,
): Promise<MemberGeocodeResult> {
  const { data, error } = await getSupabaseServiceClient()
    .from("dealer_network_members")
    .select("id,address_line_1,address_line_2,city,state,zip_code")
    .eq("id", memberId)
    .single();
  if (error) throw error;
  return refreshMemberGeocode({
    id: String(data.id),
    addressLine1: String(data.address_line_1),
    addressLine2: data.address_line_2 as string | null,
    city: String(data.city),
    state: String(data.state),
    zipCode: String(data.zip_code),
  });
}
