import { requireDealerNetworkAdmin } from "@/lib/dealer-network/admin-auth";
import {
  requireValidAdminId,
  signedReportedAttachment,
} from "@/lib/dealer-network/admin-server";

export async function GET(
  _request: Request,
  {
    params,
  }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  try {
    await requireDealerNetworkAdmin();
    const { id, attachmentId } = await params;
    return new Response(null, {
      status: 302,
      headers: {
        location: await signedReportedAttachment(
          requireValidAdminId(id),
          requireValidAdminId(attachmentId),
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
