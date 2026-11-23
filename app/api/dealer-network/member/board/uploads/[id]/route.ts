import { MemberAccessError, requireActiveUnlockedMember } from "@/lib/dealer-network/member-auth";
import { cancelBoardUpload } from "@/lib/dealer-network/board-media-server";

export async function DELETE(_request: Request, { params }: { params: Promise<{id: string}> }) {
  const headers = { "cache-control": "private, no-store" };
  try {
    const member = await requireActiveUnlockedMember();
    await cancelBoardUpload(member.memberId, (await params).id);
    return new Response(null, { status: 204, headers });
  } catch (error) {
    return Response.json({ error: error instanceof MemberAccessError ? error.message : "Photo upload could not be cancelled." }, { status: error instanceof MemberAccessError ? error.status : 400, headers });
  }
}
