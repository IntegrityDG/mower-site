import {
  MemberAccessError,
  consumeDealerRateLimit,
  requestClientKey,
  requireActiveUnlockedMember,
} from "@/lib/dealer-network/member-auth";
import { privateIdentifierHash } from "@/lib/dealer-network/security";
import { prepareTroubleshootingUploads } from "@/lib/dealer-network/troubleshooting-server";

export async function POST(request: Request) {
  try {
    const session = await requireActiveUnlockedMember();
    const allowed = await consumeDealerRateLimit(
      "troubleshooting_upload_prepare",
      privateIdentifierHash(`${session.memberId}:${requestClientKey(request)}`),
      30,
      60 * 60,
    );
    if (!allowed) throw new MemberAccessError(429, "Photo upload limit reached.");
    return Response.json(
      await prepareTroubleshootingUploads(
        session.memberId,
        await request.json().catch(() => null),
      ),
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof MemberAccessError
            ? error.message
            : "Photo upload could not be prepared.",
      },
      { status: error instanceof MemberAccessError ? error.status : 400 },
    );
  }
}
