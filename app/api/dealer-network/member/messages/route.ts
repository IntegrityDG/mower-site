import { dealerNetworkOrigin } from "@/lib/dealer-network/api";
import {
  MemberAccessError,
  consumeDealerRateLimit,
  requestClientKey,
  requireMessagingEnabledMember,
} from "@/lib/dealer-network/member-auth";
import { sendDealerMessage } from "@/lib/dealer-network/messaging-server";
import { privateIdentifierHash } from "@/lib/dealer-network/security";

export async function POST(request: Request) {
  try {
    const session = await requireMessagingEnabledMember();
    const allowed = await consumeDealerRateLimit(
      "message_send",
      privateIdentifierHash(`${session.memberId}:${requestClientKey(request)}`),
      60,
      60 * 60,
    );
    if (!allowed) throw new MemberAccessError(429, "Message limit reached. Try again later.");
    const result = await sendDealerMessage(
      session.memberId,
      session.memberName,
      dealerNetworkOrigin(request),
      await request.json().catch(() => null),
    );
    return Response.json(result);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof MemberAccessError
            ? error.message
            : error instanceof Error && error.message === "INVALID_MESSAGE"
              ? "Enter a message or add up to three valid photos."
              : "Message could not be sent. The recipient may be unavailable.",
      },
      { status: error instanceof MemberAccessError ? error.status : 400 },
    );
  }
}
