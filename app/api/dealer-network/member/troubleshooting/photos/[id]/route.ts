import {
  MemberAccessError,
  requireActiveUnlockedMember,
} from "@/lib/dealer-network/member-auth";
import { signedMemberTroubleshootingPhoto } from "@/lib/dealer-network/troubleshooting-server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireActiveUnlockedMember();
    return new Response(null, {
      status: 302,
      headers: {
        location: await signedMemberTroubleshootingPhoto(
          session.memberId,
          (await params).id,
        ),
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof MemberAccessError ? error.message : "Photo unavailable.",
      },
      { status: error instanceof MemberAccessError ? error.status : 404 },
    );
  }
}
