import {
  MemberAccessError,
  requireActiveUnlockedMember,
} from "@/lib/dealer-network/member-auth";

import {
  readMemberBroadcasts,
} from "@/lib/dealer-network/broadcast-server";


export async function GET() {
  try {
    const session =
      await requireActiveUnlockedMember();

    return Response.json(
      await readMemberBroadcasts(
        session.memberId,
      ),
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof
          MemberAccessError
            ? error.message
            : "IDS announcements are unavailable.",
      },
      {
        status:
          error instanceof
          MemberAccessError
            ? error.status
            : 500,
      },
    );
  }
}
