import {
  MemberAccessError,
  requireActiveUnlockedMember,
} from "@/lib/dealer-network/member-auth";
import {
  markConversationRead,
  readConversation,
} from "@/lib/dealer-network/messaging-server";
import { validateUuid } from "@/lib/dealer-network/validation";

function failure(error: unknown) {
  return Response.json(
    {
      error:
        error instanceof MemberAccessError
          ? error.message
          : "That conversation is unavailable.",
    },
    { status: error instanceof MemberAccessError ? error.status : 404 },
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireActiveUnlockedMember();
    const { id } = await params;
    const beforeValue = new URL(request.url).searchParams.get("before");
    const [beforeDate, beforeId, extra] = beforeValue?.split("|") ?? [];
    const before =
      !extra &&
      beforeDate &&
      beforeId &&
      !Number.isNaN(Date.parse(beforeDate)) &&
      validateUuid(beforeId)
        ? { createdAt: new Date(beforeDate).toISOString(), id: beforeId }
        : null;
    return Response.json({
      detail: await readConversation(
        session.memberId,
        id,
        session.messagingEnabled,
        before,
      ),
    });
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireActiveUnlockedMember();
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as {
      lastVisibleMessageId?: unknown;
    } | null;
    const lastVisibleMessageId =
      body?.lastVisibleMessageId === null
        ? null
        : String(body?.lastVisibleMessageId ?? "");
    await markConversationRead(session.memberId, id, lastVisibleMessageId);
    return Response.json({ read: true });
  } catch (error) {
    return failure(error);
  }
}
