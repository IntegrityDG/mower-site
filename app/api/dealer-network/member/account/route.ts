import { NextResponse } from "next/server";
import {
  MEMBER_SESSION_COOKIE,
  MemberAccessError,
  consumeDealerRateLimit,
  readCurrentMemberTokenHash,
  requestClientKey,
  requireActiveUnlockedMember,
} from "@/lib/dealer-network/member-auth";
import {
  changeMemberPin,
  readMemberAccountSecurity,
  retryOwnBusinessLocation,
  revokeAllMemberSessions,
  revokeOtherMemberSessions,
} from "@/lib/dealer-network/member-account-server";
import { privateIdentifierHash } from "@/lib/dealer-network/security";

function clearMemberCookie(response: NextResponse) {
  response.cookies.set(MEMBER_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}

async function authenticatedContext() {
  const session = await requireActiveUnlockedMember();
  const tokenHash = await readCurrentMemberTokenHash();
  if (!tokenHash) throw new MemberAccessError(401, "Authentication required.");
  return { session, tokenHash };
}

function accountError(error: unknown) {
  const access = error instanceof MemberAccessError;
  return Response.json(
    { error: access ? error.message : "Account security request failed." },
    { status: access ? error.status : 500 },
  );
}

export async function GET() {
  try {
    const { tokenHash } = await authenticatedContext();
    return Response.json(
      { summary: await readMemberAccountSecurity(tokenHash) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const response = accountError(error);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}

export async function PATCH(request: Request) {
  try {
    const { session, tokenHash } = await authenticatedContext();
    const body = await request.json().catch(() => ({}));
    if (body.action === "revoke_other_sessions") {
      const revoked = await revokeOtherMemberSessions(tokenHash);
      return Response.json({
        success: true,
        message: revoked
          ? `Signed out ${revoked} other session${revoked === 1 ? "" : "s"}.`
          : "No other active sessions were found.",
      });
    }
    if (body.action === "retry_business_location") {
      const result = await retryOwnBusinessLocation(session.memberId);
      return result.ok
        ? Response.json({ success: true, message: result.message })
        : Response.json({ success: false, error: result.error }, { status: result.status });
    }
    if (body.action === "change_pin") {
      const allowed = await consumeDealerRateLimit(
        "member_change_pin",
        privateIdentifierHash(`${session.memberId}:${requestClientKey(request)}`),
        10,
        15 * 60,
      );
      if (!allowed)
        throw new MemberAccessError(429, "Too many attempts. Please wait and try again.");
      const result = await changeMemberPin(session.memberId, tokenHash, body);
      if (!result.ok)
        return Response.json({ success: false, error: result.error }, { status: 400 });
      return clearMemberCookie(
        NextResponse.json({
          success: true,
          message: "Your PIN was changed. Sign in again with your new PIN.",
        }),
      );
    }
    return Response.json({ error: "Account action is invalid." }, { status: 400 });
  } catch (error) {
    return accountError(error);
  }
}

export async function DELETE() {
  try {
    const { session } = await authenticatedContext();
    await revokeAllMemberSessions(session.memberId);
    return clearMemberCookie(
      NextResponse.json({ success: true, message: "Signed out everywhere." }),
    );
  } catch (error) {
    return accountError(error);
  }
}
