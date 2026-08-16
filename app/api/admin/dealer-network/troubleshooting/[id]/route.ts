import { requireDealerNetworkAdmin } from "@/lib/dealer-network/admin-auth";
import { requireValidAdminId } from "@/lib/dealer-network/admin-server";
import { updateTroubleshootingStatus } from "@/lib/dealer-network/troubleshooting-server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireDealerNetworkAdmin();
    await updateTroubleshootingStatus(
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
          : "Troubleshooting entry could not be updated.",
      },
      { status: unauthorized ? 401 : 400 },
    );
  }
}
