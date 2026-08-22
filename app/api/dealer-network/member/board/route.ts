import { MemberAccessError, requireActiveUnlockedMember } from "@/lib/dealer-network/member-auth";
import { readMemberBoard } from "@/lib/dealer-network/board-server";
export async function GET() { try { const session = await requireActiveUnlockedMember(); return Response.json({ topics: await readMemberBoard(session.memberId) }); } catch (error) { return Response.json({ error: error instanceof MemberAccessError ? error.message : "Dealer Network Board is unavailable." }, { status: error instanceof MemberAccessError ? error.status : 500 }); } }
