import {
  MemberAccessError,
  requireActiveUnlockedMember,
} from "@/lib/dealer-network/member-auth";
import { validateUuid } from "@/lib/dealer-network/validation";
import { markMemberActivityAlertRead, readMemberNotifications } from "@/lib/dealer-network/member-notifications-server";

const headers = { "cache-control": "private, no-store" };

export async function GET() {
  try {
    const session = await requireActiveUnlockedMember();
    return Response.json(await readMemberNotifications(session.memberId), { headers });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof MemberAccessError
            ? error.message
            : "Notifications are temporarily unavailable.",
      },
      { status: error instanceof MemberAccessError ? error.status : 500, headers },
    );
  }
}


export async function PATCH(request: Request) {
  try {
    const session = await requireActiveUnlockedMember();
    const body = await request.json().catch(() => null);
    const alertId = validateUuid(body?.alertId);
    const contextId = validateUuid(body?.contextId);
    const sourceId = validateUuid(body?.sourceId);
    if (!alertId || !contextId || (body?.sourceId != null && !sourceId)) {
      return Response.json({ error: "Invalid alert." }, { status: 400, headers });
    }
    const marked = await markMemberActivityAlertRead(session.memberId, alertId, contextId, sourceId);
    return Response.json({ marked }, { headers });
  } catch (error) {
    return Response.json({ error: "The alert could not be marked as read." }, {
      status: error instanceof MemberAccessError ? error.status : 500,
      headers,
    });
  }
}
