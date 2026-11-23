import { MemberAccessError, consumeDealerRateLimit, requireActiveUnlockedMember } from "@/lib/dealer-network/member-auth";
import { privateIdentifierHash } from "@/lib/dealer-network/security";
import { prepareBoardUploads } from "@/lib/dealer-network/board-media-server";

export async function POST(request: Request, { params }: { params: Promise<{discussionId: string}> }) {
  const headers = { "cache-control": "private, no-store" };
  try {
    const member = await requireActiveUnlockedMember();
    const allowed = await consumeDealerRateLimit("board_upload_prepare", privateIdentifierHash(member.memberId), 30, 3600);
    if (!allowed) throw new MemberAccessError(429, "Photo upload limit reached.");
    return Response.json(await prepareBoardUploads(member.memberId, (await params).discussionId, await request.json().catch(() => null)), { headers });
  } catch (error) {
    const unavailable = error instanceof Error && ["DISCUSSION_UNAVAILABLE", "INVALID_PARENT"].includes(error.message);
    return Response.json({ error: error instanceof MemberAccessError ? error.message : "Photo upload could not be prepared." }, { status: error instanceof MemberAccessError ? error.status : unavailable ? 404 : 400, headers });
  }
}
