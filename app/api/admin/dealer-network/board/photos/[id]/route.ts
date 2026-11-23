import { DealerNetworkAdminError, requireDealerNetworkAdmin } from "@/lib/dealer-network/admin-auth";
import { readBoardPhoto } from "@/lib/dealer-network/board-media-server";

export async function GET(_request: Request, { params }: { params: Promise<{id: string}> }) {
  try {
    await requireDealerNetworkAdmin();
    return await readBoardPhoto((await params).id, null);
  } catch (error) {
    return Response.json({ error: error instanceof DealerNetworkAdminError ? "Unauthorized" : "Photo unavailable." }, { status: error instanceof DealerNetworkAdminError ? 401 : 404, headers: { "cache-control": "private, no-store" } });
  }
}
