import { requireDealerNetworkAdmin } from "@/lib/dealer-network/admin-auth";
import {
  decideMemberBrand,
  requireValidAdminId,
} from "@/lib/dealer-network/admin-server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireDealerNetworkAdmin();
    const body = await request.json().catch(() => ({}));
    if (body.decision !== "approve" && body.decision !== "reject")
      return Response.json({ error: "Invalid decision." }, { status: 400 });
    return Response.json({
      affiliation: await decideMemberBrand(
        requireValidAdminId((await params).id),
        body.decision,
      ),
    });
  } catch (error) {
    const unauthorized =
      error instanceof Error && error.name === "DealerNetworkAdminError";
    return Response.json(
      { error: unauthorized ? "Unauthorized" : "Brand decision failed." },
      { status: unauthorized ? 401 : 400 },
    );
  }
}
