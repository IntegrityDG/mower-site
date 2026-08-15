import { requireDealerNetworkAdmin } from "@/lib/dealer-network/admin-auth";
import {
  requireValidAdminId,
  saveDealerBrand,
} from "@/lib/dealer-network/admin-server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireDealerNetworkAdmin();
    return Response.json({
      brand: await saveDealerBrand(
        await request.json().catch(() => null),
        requireValidAdminId((await params).id),
      ),
    });
  } catch (error) {
    const unauthorized =
      error instanceof Error && error.name === "DealerNetworkAdminError";
    return Response.json(
      { error: unauthorized ? "Unauthorized" : "Brand could not be updated." },
      { status: unauthorized ? 401 : 400 },
    );
  }
}
