import { requireDealerNetworkAdmin } from "@/lib/dealer-network/admin-auth";
import { saveDealerBrand } from "@/lib/dealer-network/admin-server";

export async function POST(request: Request) {
  try {
    await requireDealerNetworkAdmin();
    return Response.json(
      { brand: await saveDealerBrand(await request.json().catch(() => null)) },
      { status: 201 },
    );
  } catch (error) {
    const unauthorized =
      error instanceof Error && error.name === "DealerNetworkAdminError";
    return Response.json(
      { error: unauthorized ? "Unauthorized" : "Brand could not be created." },
      { status: unauthorized ? 401 : 400 },
    );
  }
}
