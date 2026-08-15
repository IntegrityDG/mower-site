import {
  MemberAccessError,
  consumeDealerRateLimit,
  requestClientKey,
  requireActiveUnlockedMember,
} from "@/lib/dealer-network/member-auth";
import { setMemberBlock } from "@/lib/dealer-network/messaging-server";
import { readBlockedMembers } from "@/lib/dealer-network/member-server";
import { privateIdentifierHash } from "@/lib/dealer-network/security";

export async function GET() {
  try {
    const session = await requireActiveUnlockedMember();
    return Response.json({
      blockedMembers: await readBlockedMembers(session.memberId),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof MemberAccessError ? error.message : "Blocked members are unavailable." },
      { status: error instanceof MemberAccessError ? error.status : 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requireActiveUnlockedMember();
    const allowed = await consumeDealerRateLimit(
      "member_block_change",
      privateIdentifierHash(`${session.memberId}:${requestClientKey(request)}`),
      30,
      60 * 60,
    );
    if (!allowed) throw new MemberAccessError(429, "Too many block changes.");
    const body = (await request.json().catch(() => null)) as {
      memberId?: unknown;
      blocked?: unknown;
    } | null;
    if (typeof body?.blocked !== "boolean") throw new Error("INVALID_BLOCK");
    await setMemberBlock(
      session.memberId,
      String(body.memberId ?? ""),
      body.blocked,
    );
    return Response.json({ blocked: body.blocked });
  } catch (error) {
    return Response.json(
      { error: error instanceof MemberAccessError ? error.message : "That member is unavailable." },
      { status: error instanceof MemberAccessError ? error.status : 400 },
    );
  }
}
