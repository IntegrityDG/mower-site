import { requireDealerNetworkAdmin } from "@/lib/dealer-network/admin-auth";
import { requireValidAdminId } from "@/lib/dealer-network/admin-server";
import { updateTroubleshootingPhotoPublication } from "@/lib/dealer-network/troubleshooting-server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireDealerNetworkAdmin();
    await updateTroubleshootingPhotoPublication(
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
          : "Photo publication could not be updated.",
      },
      { status: unauthorized ? 401 : 400 },
    );
  }
}
