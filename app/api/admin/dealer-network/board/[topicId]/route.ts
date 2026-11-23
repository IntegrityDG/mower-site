import { DealerNetworkAdminError, requireDealerNetworkAdmin } from "@/lib/dealer-network/admin-auth";
import { adminTopicAction, updateBoardTopicText } from "@/lib/dealer-network/board-server";
import { dealerNetworkOrigin } from "@/lib/dealer-network/api";
export async function PATCH(request: Request, { params }: { params: Promise<{ topicId: string }> }) {
  try {
    await requireDealerNetworkAdmin();
    const body = await request.json().catch(() => ({}));
    const { topicId } = await params;
    if (body?.action === "updateTopic") {
      await updateBoardTopicText(topicId, body);
      return Response.json({ ok: true }, { headers: { "cache-control": "private, no-store" } });
    }
    return Response.json(await adminTopicAction(topicId, body?.action, dealerNetworkOrigin(request)));
  }
  catch (error) { const unauthorized = error instanceof DealerNetworkAdminError; return Response.json({ error: unauthorized ? "Unauthorized" : "The topic action could not be completed." }, { status: unauthorized ? 401 : 400 }); }
}
