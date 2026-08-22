import {
  MemberAccessError,
  requireActiveUnlockedMember,
} from "@/lib/dealer-network/member-auth";
import { markMemberBoardTopicRead } from "@/lib/dealer-network/board-server";

export async function PATCH(
  _request: Request,
  context: { params: Promise<{ topicId: string }> },
) {
  try {
    const [session, { topicId }] = await Promise.all([
      requireActiveUnlockedMember(),
      context.params,
    ]);
    await markMemberBoardTopicRead(session.memberId, topicId);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof MemberAccessError
            ? error.message
            : "Topic could not be opened.",
      },
      { status: error instanceof MemberAccessError ? error.status : 404 },
    );
  }
}
