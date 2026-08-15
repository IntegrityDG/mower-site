import {
  MemberAccessError,
  requireActiveUnlockedMember,
} from "@/lib/dealer-network/member-auth";
import { signedMemberAttachment } from "@/lib/dealer-network/messaging-server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireActiveUnlockedMember();
    const { id } = await params;
    return new Response(null, {
      status: 302,
      headers: {
        location: await signedMemberAttachment(session.memberId, id),
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof MemberAccessError ? error.message : "Photo unavailable." },
      { status: error instanceof MemberAccessError ? error.status : 404 },
    );
  }
}
