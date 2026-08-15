import {
  MemberAccessError,
  consumeDealerRateLimit,
  requestClientKey,
  requireMessagingEnabledMember,
} from "@/lib/dealer-network/member-auth";
import { prepareMessageUploads } from "@/lib/dealer-network/messaging-server";
import { privateIdentifierHash } from "@/lib/dealer-network/security";

export async function POST(request: Request) {
  try {
    const session = await requireMessagingEnabledMember();
    const allowed = await consumeDealerRateLimit(
      "message_upload_prepare",
      privateIdentifierHash(`${session.memberId}:${requestClientKey(request)}`),
      30,
      60 * 60,
    );
    if (!allowed) throw new MemberAccessError(429, "Photo upload limit reached.");
    return Response.json(
      await prepareMessageUploads(
        session.memberId,
        await request.json().catch(() => null),
      ),
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof MemberAccessError
            ? error.message
            : "Photo upload could not be prepared.",
      },
      { status: error instanceof MemberAccessError ? error.status : 400 },
    );
  }
}
