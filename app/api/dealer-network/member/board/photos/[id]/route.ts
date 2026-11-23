import { MemberAccessError, requireActiveUnlockedMember } from "@/lib/dealer-network/member-auth";
import { readBoardPhoto } from "@/lib/dealer-network/board-media-server";

export async function GET(_request: Request, { params }: { params: Promise<{id: string}> }) {
  try {
    const member = await requireActiveUnlockedMember();
    return await readBoardPhoto((await params).id, member.memberId);
  } catch (error) {
    return Response.json({ error: error instanceof MemberAccessError ? error.message : "Photo unavailable." }, { status: error instanceof MemberAccessError ? error.status : 404, headers: { "cache-control": "private, no-store" } });
  }
}
