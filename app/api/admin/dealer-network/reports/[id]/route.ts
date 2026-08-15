import { requireDealerNetworkAdmin } from "@/lib/dealer-network/admin-auth";
import {
  readReportedConversation,
  requireValidAdminId,
  updateDealerReport,
} from "@/lib/dealer-network/admin-server";

function failure(error: unknown) {
  const unauthorized =
    error instanceof Error && error.name === "DealerNetworkAdminError";
  return Response.json(
    { error: unauthorized ? "Unauthorized" : "Report unavailable." },
    { status: unauthorized ? 401 : 404 },
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireDealerNetworkAdmin();
    return Response.json({
      conversation: await readReportedConversation(
        requireValidAdminId((await params).id),
      ),
    });
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireDealerNetworkAdmin();
    await updateDealerReport(
      requireValidAdminId((await params).id),
      await request.json().catch(() => null),
    );
    return Response.json({ success: true });
  } catch (error) {
    return failure(error);
  }
}
