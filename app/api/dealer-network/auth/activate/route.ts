import {
  completeActivation,
  MemberAccessError,
} from "@/lib/dealer-network/member-auth";
import { refreshMemberGeocode } from "@/lib/dealer-network/geocoding";
import { getSupabaseServiceClient } from "@/lib/supabase";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  try {
    const memberId = await completeActivation(body.token, body.pin);
    const { data } = await getSupabaseServiceClient()
      .from("dealer_network_members")
      .select("id,address_line_1,address_line_2,city,state,zip_code")
      .eq("id", memberId)
      .single();
    if (data)
      await refreshMemberGeocode({
        id: data.id,
        addressLine1: data.address_line_1,
        addressLine2: data.address_line_2,
        city: data.city,
        state: data.state,
        zipCode: data.zip_code,
      }).catch(() => undefined);
    return Response.json({
      message: "Your member account is active. You may sign in now.",
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof MemberAccessError
            ? error.message
            : "This activation link is invalid or expired.",
      },
      { status: 400 },
    );
  }
}
