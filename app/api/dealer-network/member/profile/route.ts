import { NextResponse } from "next/server";
import {
  MEMBER_SESSION_COOKIE,
  MemberAccessError,
  requireActiveUnlockedMember,
} from "@/lib/dealer-network/member-auth";
import {
  readMemberProfile,
  updateMemberProfile,
} from "@/lib/dealer-network/member-server";

export async function GET() {
  try {
    const session = await requireActiveUnlockedMember();
    return Response.json({
      profile: await readMemberProfile(session.memberId),
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof MemberAccessError
            ? error.message
            : "Profile unavailable.",
      },
      { status: error instanceof MemberAccessError ? error.status : 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireActiveUnlockedMember();
    const result = await updateMemberProfile(
      session.memberId,
      await request.json().catch(() => null),
    );
    if (!result.ok)
      return Response.json({ errors: result.errors }, { status: 400 });
    const response = NextResponse.json({
      profile: result.value,
      reauthenticate: result.reauthenticate,
    });
    if (result.reauthenticate)
      response.cookies.set(MEMBER_SESSION_COOKIE, "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 0,
      });
    return response;
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof MemberAccessError
            ? error.message
            : "Profile could not be saved.",
      },
      { status: error instanceof MemberAccessError ? error.status : 500 },
    );
  }
}
