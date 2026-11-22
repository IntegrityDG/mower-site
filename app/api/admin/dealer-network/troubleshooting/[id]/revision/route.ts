import { DealerNetworkAdminError, requireDealerNetworkAdmin } from "@/lib/dealer-network/admin-auth";
import { validateUuid } from "@/lib/dealer-network/validation";
import { getSupabaseServiceClient } from "@/lib/supabase";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const headers = { "cache-control": "private, no-store" };
  try {
    await requireDealerNetworkAdmin();
    const id = validateUuid((await params).id);
    const body = await request.json().catch(() => null);
    const revisionId = validateUuid(body?.revisionId);
    if (!id || !revisionId || typeof body?.approve !== "boolean") {
      return Response.json({ error: "Invalid revision review." }, { status: 400, headers });
    }

    const { error } = await getSupabaseServiceClient().rpc(
      "dealer_network_review_troubleshooting_revision",
      { p_entry_id: id, p_revision_id: revisionId, p_approve: body.approve },
    );
    if (error) {
      if (error.message === "troubleshooting_revision_unavailable") {
        return Response.json(
          { error: "This edit is no longer pending. Refresh and review any newer edit before deciding." },
          { status: 409, headers },
        );
      }
      throw error;
    }
    return Response.json({ success: true }, { headers });
  } catch (error) {
    const unauthorized = error instanceof DealerNetworkAdminError;
    return Response.json(
      { error: unauthorized ? "Unauthorized" : "Troubleshooting edit could not be reviewed." },
      { status: unauthorized ? 401 : 500, headers },
    );
  }
}
