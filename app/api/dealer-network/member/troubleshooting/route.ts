import {
  MemberAccessError,
  consumeDealerRateLimit,
  requireActiveUnlockedMember,
} from "@/lib/dealer-network/member-auth";
import { privateIdentifierHash } from "@/lib/dealer-network/security";
import {
  createTroubleshootingEntry,
  readOwnTroubleshootingEntries,
  readTroubleshootingLibrary,
} from "@/lib/dealer-network/troubleshooting-server";

export async function GET(request: Request) {
  try {
    const session = await requireActiveUnlockedMember();
    const query = new URL(request.url).searchParams.get("q") ?? "";
    const [entries, ownEntries] = await Promise.all([
      readTroubleshootingLibrary(query),
      readOwnTroubleshootingEntries(session.memberId),
    ]);
    return Response.json({ entries, ownEntries });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof MemberAccessError
            ? error.message
            : "Troubleshooting entries are unavailable.",
      },
      { status: error instanceof MemberAccessError ? error.status : 400 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireActiveUnlockedMember();
    const allowed = await consumeDealerRateLimit(
      "troubleshooting_submission",
      privateIdentifierHash(session.memberId),
      20,
      24 * 60 * 60,
    );
    if (!allowed)
      throw new MemberAccessError(
        429,
        "Troubleshooting submission limit reached. Please try again later.",
      );
    const entry = await createTroubleshootingEntry(
      session.memberId,
      await request.json().catch(() => null),
    );
    return Response.json({ entry }, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof MemberAccessError
            ? error.message
            : "Troubleshooting entry could not be submitted.",
      },
      { status: error instanceof MemberAccessError ? error.status : 400 },
    );
  }
}
