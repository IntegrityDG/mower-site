import { MemberAccessError, requireActiveUnlockedMember } from "@/lib/dealer-network/member-auth";
import { addBoardComment } from "@/lib/dealer-network/board-server";

const headers = { "Cache-Control": "private, no-store" };
const messages: Record<string, { status: number; error: string }> = {
  RATE_LIMIT: { status: 429, error: "Too many comments. Please wait." },
  INVALID_COMMENT: { status: 400, error: "Check the character and photo limits." },
  comment_limit: { status: 409, error: "This discussion has reached its five-comment limit." },
  reply_limit: { status: 409, error: "This comment has reached its five-reply limit." },
  discussion_closed: { status: 409, error: "This discussion is closed." },
  invalid_parent: { status: 409, error: "This comment can no longer receive replies." },
  not_recipient: { status: 404, error: "This discussion is unavailable." },
  DISCUSSION_UNAVAILABLE: { status: 404, error: "This discussion is unavailable." },
  INVALID_PARENT: { status: 409, error: "This comment can no longer receive replies." },
  invalid_uploads: { status: 400, error: "Photos could not be verified for this comment." },
  UPLOAD_UNAVAILABLE: { status: 400, error: "Photos could not be verified for this comment." },
  INVALID_UPLOAD_REQUEST: { status: 400, error: "Check the photo limits and try again." },
  INVALID_IMAGE_SIZE: { status: 400, error: "A photo did not match the expected file size." },
};

export async function POST(request: Request, { params }: { params: Promise<{ discussionId: string }> }) {
  try {
    const session = await requireActiveUnlockedMember();
    const id = await addBoardComment(session.memberId, (await params).discussionId, await request.json().catch(() => null));
    return Response.json({ id }, { status: 201, headers });
  } catch (error) {
    const key = error && typeof error === "object" && "message" in error ? String(error.message) : "";
    const outcome = error instanceof MemberAccessError ? { status: error.status, error: error.message }
      : (Object.hasOwn(messages, key) ? messages[key] : { status: 400, error: "The comment could not be added." });
    return Response.json({ error: outcome.error }, { status: outcome.status, headers });
  }
}
