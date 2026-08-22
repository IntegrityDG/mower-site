import { requireDealerNetworkAdmin } from "@/lib/dealer-network/admin-auth";
import {
  adminUpdateMemberProfile,
  deleteDealerMember,
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
      const result = await retryMemberGeocode(id);
      if (result.success)
        return Response.json({
          success: true,
          status: result.status,
          message: "Business location geocoded successfully.",
        });
      const messages = {
        NOT_CONFIGURED: "Google geocoding is not configured.",
        NO_RESULTS: "The address returned no results.",
        REQUEST_DENIED: "Google rejected the geocoding request.",
        OVER_QUERY_LIMIT: "Google geocoding quota is currently unavailable.",
        INVALID_REQUEST: "Google could not process the address request.",
        UNAVAILABLE: "The geocoding service is temporarily unavailable.",
      } as const;
      const status =
        result.reason === "NO_RESULTS" || result.reason === "INVALID_REQUEST"
          ? 422
          : 503;
      return Response.json(
        {
          success: false,
          status: result.status,
          reason: result.reason,
          error: `Geocoding failed: ${messages[result.reason]}`,
        },
        { status },
      );
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
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireDealerNetworkAdmin();
    const id = requireValidAdminId((await params).id);
    const result = await deleteDealerMember(id);

    return Response.json({
      success: true,
      storageCleanupWarning: result.storageCleanupWarning,
    });
  } catch (error) {
    const unauthorized =
      error instanceof Error && error.name === "DealerNetworkAdminError";

    return Response.json(
      {
        error: unauthorized
          ? "Unauthorized"
          : "Member could not be permanently deleted.",
      },
      { status: unauthorized ? 401 : 400 },
    );
  }
}
