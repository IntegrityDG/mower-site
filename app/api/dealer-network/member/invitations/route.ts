import {
  MemberAccessError,
  requireActiveUnlockedMember,
} from "@/lib/dealer-network/member-auth";

import {
  createMemberInvitation,
  MemberInvitationError,
  readMemberInvitations,
} from "@/lib/dealer-network/member-invitation-server";


function errorResponse(
  error: unknown,
  fallback: string,
) {
  if (
    error instanceof
    MemberAccessError
  ) {
    return Response.json(
      {
        error: error.message,
      },
      {
        status: error.status,
      },
    );
  }


  if (
    error instanceof
    MemberInvitationError
  ) {
    return Response.json(
      {
        error: error.message,
      },
      {
        status: error.status,
      },
    );
  }


  return Response.json(
    {
      error: fallback,
    },
    {
      status: 500,
    },
  );
}


export async function GET() {
  try {
    const session =
      await requireActiveUnlockedMember();

    return Response.json(
      await readMemberInvitations(
        session.memberId,
      ),
    );
  } catch (error) {
    return errorResponse(
      error,
      "Invitation history is unavailable.",
    );
  }
}


export async function POST(
  request: Request,
) {
  try {
    const session =
      await requireActiveUnlockedMember();

    const result =
      await createMemberInvitation(
        session.memberId,
        await request.json(),
        new URL(
          request.url,
        ).origin,
      );

    return Response.json(
      result,
      {
        status: 201,
      },
    );
  } catch (error) {
    return errorResponse(
      error,
      "The invitation could not be sent.",
    );
  }
}
