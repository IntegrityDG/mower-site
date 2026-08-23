import { requireDealerNetworkAdmin } from "@/lib/dealer-network/admin-auth";
import { resolveDealerBrandRequest } from "@/lib/dealer-network/admin-server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireDealerNetworkAdmin();
    const body = await request.json().catch(() => ({}));
    if (body.action !== "add" && body.action !== "dismiss")
      return Response.json({ error: "Invalid action." }, { status: 400 });
    return Response.json(
      await resolveDealerBrandRequest((await params).id, body.action),
    );
  } catch (error) {
    const unauthorized =
      error instanceof Error && error.name === "DealerNetworkAdminError";
    return Response.json(
      {
        error: unauthorized
          ? "Unauthorized"
          : "Brand request could not be updated.",
      },
      { status: unauthorized ? 401 : 400 },
    );
  }
}
