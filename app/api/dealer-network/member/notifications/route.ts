import {
  MemberAccessError,
  requireActiveUnlockedMember,
} from "@/lib/dealer-network/member-auth";
import { readMemberNotifications } from "@/lib/dealer-network/member-notifications-server";

export async function GET() {
  try {
    const session = await requireActiveUnlockedMember();
    return Response.json(await readMemberNotifications(session.memberId));
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof MemberAccessError
            ? error.message
            : "Notifications are temporarily unavailable.",
      },
      { status: error instanceof MemberAccessError ? error.status : 500 },
    );
  }
}
