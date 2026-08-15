import { requireDealerNetworkAdmin } from "@/lib/dealer-network/admin-auth";
import {
  approveDealerApplication,
  requireValidAdminId,
  transitionDealerApplication,
} from "@/lib/dealer-network/admin-server";
import { dealerNetworkOrigin } from "@/lib/dealer-network/api";
import { readBoundedText } from "@/lib/dealer-network/validation";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireDealerNetworkAdmin();
    const id = requireValidAdminId((await params).id);
    const body = await request.json().catch(() => ({}));
    if (body.action === "approve")
      return Response.json(
        await approveDealerApplication(id, dealerNetworkOrigin(request)),
      );
    if (body.action === "deny" || body.action === "more_information") {
      const message = readBoundedText(body.message, 3000);
      if (!message || message.length > 3000)
        return Response.json(
          { error: "A message between 1 and 3,000 characters is required." },
          { status: 400 },
        );
      await transitionDealerApplication(id, body.action, message);
      return Response.json({ success: true });
    }
    return Response.json(
      { error: "Invalid application action." },
      { status: 400 },
    );
  } catch (error) {
    const unauthorized =
      error instanceof Error && error.name === "DealerNetworkAdminError";
    const conflict =
      error instanceof Error &&
      /phone_conflict|invalid_transition/i.test(error.message);
    return Response.json(
      {
        error: unauthorized
          ? "Unauthorized"
          : conflict
            ? "The application cannot make that transition. Check for an existing member phone number."
            : "Application update failed.",
      },
      { status: unauthorized ? 401 : conflict ? 409 : 500 },
    );
  }
}
