import {
  MemberAccessError,
  requireActiveUnlockedMember,
} from "@/lib/dealer-network/member-auth";
import {
  createSuggestion,
  readOwnSuggestions,
} from "@/lib/dealer-network/member-server";

export async function GET() {
  try {
    const session = await requireActiveUnlockedMember();
    return Response.json({
      suggestions: await readOwnSuggestions(session.memberId),
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof MemberAccessError
            ? error.message
            : "Suggestions unavailable.",
      },
      { status: error instanceof MemberAccessError ? error.status : 500 },
    );
  }
}
export async function POST(request: Request) {
  try {
    const session = await requireActiveUnlockedMember();
    const result = await createSuggestion(
      session.memberId,
      await request.json().catch(() => null),
    );
    return result.ok
      ? Response.json({ suggestion: result.value }, { status: 201 })
      : Response.json({ errors: result.errors }, { status: 400 });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof MemberAccessError
            ? error.message
            : "Suggestion could not be submitted.",
      },
      { status: error instanceof MemberAccessError ? error.status : 500 },
    );
  }
}
