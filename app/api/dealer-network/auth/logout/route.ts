import { NextResponse } from "next/server";
import {
  MEMBER_SESSION_COOKIE,
  revokeCurrentMemberSession,
} from "@/lib/dealer-network/member-auth";

export async function DELETE() {
  await revokeCurrentMemberSession().catch(() => undefined);
  const response = NextResponse.json({ success: true });
  response.cookies.set(MEMBER_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
