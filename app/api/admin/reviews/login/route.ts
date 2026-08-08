import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, adminCookieValue, validAdminPassword } from "@/lib/reviews/admin-auth";
export async function POST(request: NextRequest) {
  const { password = "" } = await request.json().catch(() => ({}));
  if (!validAdminPassword(password)) return NextResponse.json({ error: "Invalid password." }, { status: 401 });
  const response = NextResponse.json({ success: true });
  response.cookies.set(ADMIN_COOKIE, adminCookieValue(), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 60 * 60 * 8 });
  return response;
}
export async function DELETE() { const response = NextResponse.json({ success: true }); response.cookies.set(ADMIN_COOKIE, "", { maxAge: 0, path: "/" }); return response; }
