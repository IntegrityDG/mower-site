import { requireDealerNetworkAdmin } from "@/lib/dealer-network/admin-auth";
import { createBoardTopic, readAdminBoard } from "@/lib/dealer-network/board-server";
import { dealerNetworkOrigin } from "@/lib/dealer-network/api";

export async function GET() {
  try { await requireDealerNetworkAdmin(); return Response.json({ topics: await readAdminBoard() }); }
  catch (error) { return Response.json({ error: error instanceof Error && error.name === "DealerNetworkAdminError" ? "Unauthorized" : "Dealer Network Board is unavailable." }, { status: error instanceof Error && error.name === "DealerNetworkAdminError" ? 401 : 500 }); }
}
export async function POST(request: Request) {
  try { await requireDealerNetworkAdmin(); return Response.json(await createBoardTopic(await request.json().catch(() => null), dealerNetworkOrigin(request)), { status: 201 }); }
  catch (error) { const unauthorized = error instanceof Error && error.name === "DealerNetworkAdminError"; return Response.json({ error: unauthorized ? "Unauthorized" : error instanceof Error && error.message === "INVALID_TOPIC" ? "Review the topic fields and poll choices." : "The Board topic could not be created." }, { status: unauthorized ? 401 : error instanceof Error && error.message === "INVALID_TOPIC" ? 400 : 500 }); }
}
