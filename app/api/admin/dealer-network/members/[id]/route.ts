import { requireDealerNetworkAdmin } from "@/lib/dealer-network/admin-auth";
import {
  adminUpdateMemberProfile,
  requireValidAdminId,
  retryMemberGeocode,
  setMemberAccountState,
} from "@/lib/dealer-network/admin-server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireDealerNetworkAdmin();
    const id = requireValidAdminId((await params).id);
    const body = await request.json().catch(() => ({}));
    if (body.action === "profile") {
      const result = await adminUpdateMemberProfile(id, body.profile);
      return result.ok
        ? Response.json({ success: true })
        : Response.json({ errors: result.errors }, { status: 400 });
    }
    if (body.action === "retry_geocode") {
      await retryMemberGeocode(id);
      return Response.json({ success: true });
    }
    await setMemberAccountState(id, body);
    return Response.json({ success: true });
  } catch (error) {
    const unauthorized =
      error instanceof Error && error.name === "DealerNetworkAdminError";
    return Response.json(
      { error: unauthorized ? "Unauthorized" : "Member could not be updated." },
      { status: unauthorized ? 401 : 400 },
    );
  }
}
