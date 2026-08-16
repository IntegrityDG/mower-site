import { requireDealerNetworkAdmin } from "@/lib/dealer-network/admin-auth";
import { requireValidAdminId } from "@/lib/dealer-network/admin-server";
import { updateTroubleshootingPublication } from "@/lib/dealer-network/troubleshooting-server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireDealerNetworkAdmin();
    await updateTroubleshootingPublication(
      requireValidAdminId((await params).id),
      await request.json().catch(() => null),
    );
    return Response.json({ success: true });
  } catch (error) {
    const unauthorized =
      error instanceof Error && error.name === "DealerNetworkAdminError";
    const requiresApproval =
      error instanceof Error && error.message === "PUBLICATION_REQUIRES_APPROVAL";
    return Response.json(
      {
        error: unauthorized
          ? "Unauthorized"
          : requiresApproval
            ? "Only an approved troubleshooting entry can be published."
            : "Public publication could not be updated.",
      },
      { status: unauthorized ? 401 : requiresApproval ? 409 : 400 },
    );
  }
}
