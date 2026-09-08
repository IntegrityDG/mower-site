import { cashEntryRequest } from "@/lib/installations/cash-http";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return cashEntryRequest(request, params, "refund", true);
}
