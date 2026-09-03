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
    const rateLimited =
      error instanceof Error && error.message === "RATE_LIMIT";
    const activationState =
      error instanceof Error &&
      /APPLICATION_NOT_APPROVED|MEMBER_NOT_PENDING_ACTIVATION|MEMBER_STATE_CHANGED|MEMBER_NOT_FOUND|INVALID_EMAIL/i.test(
        error.message,
      );
    return Response.json(
      {
        error: unauthorized
          ? "Unauthorized"
          : rateLimited
            ? "An activation email was sent recently. Please wait five minutes before trying again."
            : activationState
              ? "The activation notification is no longer eligible for retry."
              : "The notification could not be retried.",
      },
      { status: unauthorized ? 401 : rateLimited ? 429 : activationState ? 409 : 500 },
    );
  }
}
