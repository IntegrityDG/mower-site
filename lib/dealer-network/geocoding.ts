import "server-only";

import { getSupabaseServiceClient } from "@/lib/supabase";
import { geocodeUsLocation } from "./geocoding-adapter";

export { geocodeUsLocation } from "./geocoding-adapter";

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
) {
  const client = getSupabaseServiceClient();
  let point;
  try {
    point = await geocoder(memberAddressQuery(member));
  } catch (error) {
    const code =
      error instanceof Error && error.message === "GEOCODER_NOT_CONFIGURED"
        ? "NOT_CONFIGURED"
        : "UNAVAILABLE";
    const { error: saveError } = await client.rpc(
      "dealer_network_set_location",
      {
        p_member_id: member.id,
        p_status: "failed",
        p_latitude: null,
        p_longitude: null,
        p_provider: "google-geocoding-v3",
        p_error: code,
      },
    );
    if (saveError) throw saveError;
    return null;
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
  return point;
}
