import {
  MemberAccessError,
  consumeDealerRateLimit,
  requestClientKey,
  requireActiveUnlockedMember,
} from "@/lib/dealer-network/member-auth";
import { readFriends, setFriend } from "@/lib/dealer-network/member-server";
import { privateIdentifierHash } from "@/lib/dealer-network/security";

function failure(error: unknown) {
  return Response.json(
    {
      error:
        error instanceof MemberAccessError
          ? error.message
          : "That member is unavailable.",
    },
    { status: error instanceof MemberAccessError ? error.status : 400 },
  );
}

async function requireFriendChangeAllowance(request: Request, memberId: string) {
  const allowed = await consumeDealerRateLimit(
    "friend_change",
    privateIdentifierHash(`${memberId}:${requestClientKey(request)}`),
    60,
    60 * 60,
  );
  if (!allowed) throw new MemberAccessError(429, "Too many friend changes.");
}

export async function GET() {
  try {
    const session = await requireActiveUnlockedMember();
    return Response.json({ friends: await readFriends(session.memberId) });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireActiveUnlockedMember();
    await requireFriendChangeAllowance(request, session.memberId);
    const body = (await request.json().catch(() => null)) as {
      memberId?: unknown;
    } | null;
    await setFriend(session.memberId, String(body?.memberId ?? ""), true);
    return Response.json({ saved: true });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await requireActiveUnlockedMember();
    await requireFriendChangeAllowance(request, session.memberId);
    const body = (await request.json().catch(() => null)) as {
      memberId?: unknown;
    } | null;
    await setFriend(session.memberId, String(body?.memberId ?? ""), false);
    return Response.json({ saved: false });
  } catch (error) {
    return failure(error);
  }
}
