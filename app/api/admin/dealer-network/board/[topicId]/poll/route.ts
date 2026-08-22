import { requireDealerNetworkAdmin } from "@/lib/dealer-network/admin-auth";
import { dealerNetworkOrigin } from "@/lib/dealer-network/api";
import { addPollToTopic } from "@/lib/dealer-network/board-server";
export async function POST(request: Request, { params }: { params: Promise<{ topicId: string }> }) { try { await requireDealerNetworkAdmin(); return Response.json(await addPollToTopic((await params).topicId, await request.json().catch(() => null), dealerNetworkOrigin(request)), { status: 201 }); } catch (error) { const unauthorized = error instanceof Error && error.name === "DealerNetworkAdminError"; return Response.json({ error: unauthorized ? "Unauthorized" : "The poll could not be added. Review its choices and topic state." }, { status: unauthorized ? 401 : 400 }); } }
