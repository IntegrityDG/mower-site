import { requireDealerNetworkAdmin } from "@/lib/dealer-network/admin-auth";
import { readDealerNetworkAdminDashboard } from "@/lib/dealer-network/admin-server";

export async function GET() {
  try {
    await requireDealerNetworkAdmin();
    return Response.json(await readDealerNetworkAdminDashboard());
  } catch (error) {
    const unauthorized =
      error instanceof Error && error.name === "DealerNetworkAdminError";
    return Response.json(
      {
        error: unauthorized
          ? "Unauthorized"
          : "Dealer Network administration is unavailable.",
      },
      { status: unauthorized ? 401 : 500 },
    );
  }
}
