import { requireDealerNetworkAdmin } from "@/lib/dealer-network/admin-auth";
import { adminTopicAction } from "@/lib/dealer-network/board-server";
import { dealerNetworkOrigin } from "@/lib/dealer-network/api";
export async function PATCH(request: Request, { params }: { params: Promise<{ topicId: string }> }) {
  try { await requireDealerNetworkAdmin(); const body = await request.json().catch(() => ({})); return Response.json(await adminTopicAction((await params).topicId, body.action, dealerNetworkOrigin(request))); }
  catch (error) { const unauthorized = error instanceof Error && error.name === "DealerNetworkAdminError"; return Response.json({ error: unauthorized ? "Unauthorized" : "The topic action could not be completed." }, { status: unauthorized ? 401 : 400 }); }
}
