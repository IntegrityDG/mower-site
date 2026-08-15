import {
  MemberAccessError,
  consumeDealerRateLimit,
  requestClientKey,
  requireActiveUnlockedMember,
  requireMessagingEnabledMember,
} from "@/lib/dealer-network/member-auth";
import {
  listConversations,
  startConversation,
} from "@/lib/dealer-network/messaging-server";
import { privateIdentifierHash } from "@/lib/dealer-network/security";

function failure(error: unknown) {
  return Response.json(
    {
      error:
        error instanceof MemberAccessError
          ? error.message
          : "That conversation is unavailable.",
    },
    { status: error instanceof MemberAccessError ? error.status : 400 },
  );
}

export async function GET() {
  try {
    const session = await requireActiveUnlockedMember();
    return Response.json(await listConversations(session.memberId));
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireMessagingEnabledMember();
    const allowed = await consumeDealerRateLimit(
      "conversation_start",
      privateIdentifierHash(`${session.memberId}:${requestClientKey(request)}`),
      30,
      60 * 60,
    );
    if (!allowed)
      throw new MemberAccessError(429, "Too many conversation requests.");
    const body = (await request.json().catch(() => null)) as {
      memberId?: unknown;
    } | null;
    return Response.json({
      conversationId: await startConversation(
        session.memberId,
        String(body?.memberId ?? ""),
      ),
    });
  } catch (error) {
    return failure(error);
  }
}
