import { requireDealerNetworkAdmin } from "@/lib/dealer-network/admin-auth";
import {
  requireValidAdminId,
  updateSuggestionStatus,
} from "@/lib/dealer-network/admin-server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireDealerNetworkAdmin();
    await updateSuggestionStatus(
      requireValidAdminId((await params).id),
      await request.json().catch(() => null),
    );
    return Response.json({ success: true });
  } catch (error) {
    const unauthorized =
      error instanceof Error && error.name === "DealerNetworkAdminError";
    return Response.json(
      {
        error: unauthorized
          ? "Unauthorized"
          : "Suggestion could not be updated.",
      },
      { status: unauthorized ? 401 : 400 },
    );
  }
}
