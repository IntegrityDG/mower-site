import { NextResponse } from "next/server";
import {
  authenticateMember,
  MEMBER_SESSION_COOKIE,
  MEMBER_SESSION_SECONDS,
  MemberAccessError,
  requestClientKey,
} from "@/lib/dealer-network/member-auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  try {
    const session = await authenticateMember({
      phone: body.phone,
      pin: body.pin,
      clientKey: requestClientKey(request),
    });
    const response = NextResponse.json({ success: true });
    response.cookies.set(MEMBER_SESSION_COOKIE, session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: MEMBER_SESSION_SECONDS,
    });
    return response;
  } catch (error) {
    if (error instanceof MemberAccessError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    return NextResponse.json(
      { error: "Member login is temporarily unavailable." },
      { status: 503 },
    );
  }
}
