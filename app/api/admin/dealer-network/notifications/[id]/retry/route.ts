import { requireDealerNetworkAdmin } from "@/lib/dealer-network/admin-auth";
import {
  requireValidAdminId,
  retryDealerNotification,
} from "@/lib/dealer-network/admin-server";
import { dealerNetworkOrigin } from "@/lib/dealer-network/api";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireDealerNetworkAdmin();
    return Response.json(
      await retryDealerNotification(
        requireValidAdminId((await params).id),
        dealerNetworkOrigin(request),
      ),
    );
  } catch (error) {
    const unauthorized =
      error instanceof Error && error.name === "DealerNetworkAdminError";
    return Response.json(
      {
        error: unauthorized
          ? "Unauthorized"
          : "The notification could not be retried.",
      },
      { status: unauthorized ? 401 : 500 },
    );
  }
}
