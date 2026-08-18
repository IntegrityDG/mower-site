import {
  MemberAccessError,
  requireActiveUnlockedMember,
} from "@/lib/dealer-network/member-auth";

import {
  markMemberBroadcastRead,
} from "@/lib/dealer-network/broadcast-server";


export async function PATCH(
  _request: Request,
  {
    params,
  }: {
    params:
      Promise<{
        id: string;
      }>;
  },
) {
  try {
    const session =
      await requireActiveUnlockedMember();

    await markMemberBroadcastRead(
      session.memberId,
      (await params).id,
    );

    return Response.json({
      read: true,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof
          MemberAccessError
            ? error.message
            : "That IDS announcement is unavailable.",
      },
      {
        status:
          error instanceof
          MemberAccessError
            ? error.status
            : 404,
      },
    );
  }
}
