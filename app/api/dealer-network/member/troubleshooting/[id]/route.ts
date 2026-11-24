import { MemberAccessError, requireActiveUnlockedMember } from "@/lib/dealer-network/member-auth";
import { readMemberTroubleshootingEntry } from "@/lib/dealer-network/troubleshooting-server";
import { addTroubleshootingActivity } from "@/lib/dealer-network/troubleshooting-activity-server";
import { validateUuid } from "@/lib/dealer-network/validation";

const headers = { "cache-control": "private, no-store" };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { memberId } = await requireActiveUnlockedMember();
    const id = validateUuid((await params).id);
    const entry = id ? await readMemberTroubleshootingEntry(id, memberId) : null;
    if (!entry) return Response.json({ error: "This troubleshooting entry is unavailable." }, { status: 404, headers });
    const { entries, ownEntries } = await addTroubleshootingActivity(memberId, [entry], entry.memberId === memberId ? [entry] : []);
    return Response.json({ entry: entries[0] ?? ownEntries[0] }, { headers });
  } catch (error) {
    return Response.json({ error: "This troubleshooting entry is unavailable." }, {
      status: error instanceof MemberAccessError ? error.status : 500, headers,
    });
  }
}
