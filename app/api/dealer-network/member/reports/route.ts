import {
  MemberAccessError,
  consumeDealerRateLimit,
  requestClientKey,
  requireActiveUnlockedMember,
} from "@/lib/dealer-network/member-auth";
import { createMemberReport } from "@/lib/dealer-network/messaging-server";
import { privateIdentifierHash } from "@/lib/dealer-network/security";

export async function POST(request: Request) {
  try {
    const session = await requireActiveUnlockedMember();
    const allowed = await consumeDealerRateLimit(
      "member_report",
      privateIdentifierHash(`${session.memberId}:${requestClientKey(request)}`),
      5,
      24 * 60 * 60,
    );
    if (!allowed) throw new MemberAccessError(429, "Report limit reached. Contact IDS if you need immediate help.");
    const reportId = await createMemberReport(
      session.memberId,
      await request.json().catch(() => null),
    );
    return Response.json({ reportId });
  } catch (error) {
    return Response.json(
      { error: error instanceof MemberAccessError ? error.message : "Report could not be submitted." },
      { status: error instanceof MemberAccessError ? error.status : 400 },
    );
  }
}
