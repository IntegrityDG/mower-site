import {
  MemberAccessError,
  consumeDealerRateLimit,
  requireActiveUnlockedMember,
} from "@/lib/dealer-network/member-auth";
import { privateIdentifierHash } from "@/lib/dealer-network/security";
import {
  appendTroubleshootingActivity,
  editOwnTroubleshootingText,
} from "@/lib/dealer-network/troubleshooting-activity-server";

const headers = { "Cache-Control": "private, no-store" };
type Context = { params: Promise<{ id: string }> };

async function mutate(request: Request, { params }: Context, edit: boolean) {
  try {
    const session = await requireActiveUnlockedMember();
    const { id } = await params;
    const raw = await request.json().catch(() => null);
    const allowed = await consumeDealerRateLimit(
      edit ? "troubleshooting_text_edit" : "troubleshooting_activity",
      privateIdentifierHash(session.memberId), 30, 60 * 60,
    );
    if (!allowed) throw new MemberAccessError(429, "Too many troubleshooting changes. Please wait and try again.");
    if (edit) {
      const status = await editOwnTroubleshootingText(id, session.memberId, raw);
      return Response.json({ status }, { headers });
    }
    const activity = await appendTroubleshootingActivity(id, session.memberId, raw);
    return Response.json(activity, { status: 201, headers });
  } catch (error) {
    const known = error instanceof MemberAccessError;
    return Response.json(
      { error: known ? error.message : "The troubleshooting change could not be saved. Please try again." },
      { status: known ? error.status : 500, headers },
    );
  }
}

export async function PATCH(request: Request, context: Context) {
  return mutate(request, context, true);
}

export async function POST(request: Request, context: Context) {
  return mutate(request, context, false);
}
