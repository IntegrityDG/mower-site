import { readPublicSalesTicker } from "@/lib/promotions/ticker-server";

export async function GET() {
  return Response.json(await readPublicSalesTicker(), { headers: { "Cache-Control": "no-store" } });
}
