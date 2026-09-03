import { requireDealerNetworkAdmin } from "@/lib/dealer-network/admin-auth";
import {
  approveDealerApplication,
  requireValidAdminId,
  resendDealerActivationEmail,
  transitionDealerApplication,
} from "@/lib/dealer-network/admin-server";
import { dealerNetworkOrigin } from "@/lib/dealer-network/api";
import { readBoundedText } from "@/lib/dealer-network/validation";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let requestedAction: unknown;
  try {
    await requireDealerNetworkAdmin();
    const id = requireValidAdminId((await params).id);
    const body = await request.json().catch(() => ({}));
    requestedAction = body.action;
    if (body.action === "approve")
      return Response.json(
        await approveDealerApplication(id, dealerNetworkOrigin(request)),
      );
    if (body.action === "resend_activation")
      return Response.json(
        await resendDealerActivationEmail(id, dealerNetworkOrigin(request)),
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
    const resendState =
      error instanceof Error &&
      /APPLICATION_NOT_APPROVED|MEMBER_NOT_PENDING_ACTIVATION|MEMBER_STATE_CHANGED|MEMBER_NOT_FOUND/i.test(
        error.message,
      );
    const notFound =
      error instanceof Error && error.message === "APPLICATION_NOT_FOUND";
    const invalidEmail =
      error instanceof Error && error.message === "INVALID_EMAIL";
    const rateLimited =
      error instanceof Error && error.message === "RATE_LIMIT";
    return Response.json(
      {
        error: unauthorized
          ? "Unauthorized"
          : notFound
            ? "Application not found."
            : rateLimited
              ? "An activation email was sent recently. Please wait five minutes before trying again."
              : invalidEmail
                ? "The member needs a valid email address before an activation email can be sent."
                : resendState
                  ? "Activation email resend is available only for an approved member who is still awaiting activation."
                  : conflict
                    ? "The application cannot make that transition. Check for an existing member phone number."
                    : requestedAction === "resend_activation"
                      ? "Activation email could not be sent. Please try again."
                      : "Application update failed.",
      },
      {
        status: unauthorized
          ? 401
          : notFound
            ? 404
            : rateLimited
              ? 429
              : resendState || invalidEmail || conflict
                ? 409
                : 500,
      },
    );
  }
}
