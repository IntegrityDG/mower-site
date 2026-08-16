import { requireDealerNetworkAdmin } from "@/lib/dealer-network/admin-auth";
import { requireValidAdminId } from "@/lib/dealer-network/admin-server";
import { signedAdminTroubleshootingPhoto } from "@/lib/dealer-network/troubleshooting-server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireDealerNetworkAdmin();
    return new Response(null, {
      status: 302,
      headers: {
        location: await signedAdminTroubleshootingPhoto(
          requireValidAdminId((await params).id),
        ),
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    const unauthorized =
      error instanceof Error && error.name === "DealerNetworkAdminError";
    return Response.json(
      { error: unauthorized ? "Unauthorized" : "Photo unavailable." },
      { status: unauthorized ? 401 : 404 },
    );
  }
}
