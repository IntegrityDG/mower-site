import {
  MemberAccessError,
  requireActiveUnlockedMember,
} from "@/lib/dealer-network/member-auth";
import { cancelTroubleshootingUpload } from "@/lib/dealer-network/troubleshooting-server";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireActiveUnlockedMember();
    await cancelTroubleshootingUpload(session.memberId, (await params).id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof MemberAccessError
            ? error.message
            : "Upload could not be removed.",
      },
      { status: error instanceof MemberAccessError ? error.status : 400 },
    );
  }
}
