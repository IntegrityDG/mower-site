import { readPublicPriceMatch } from "@/lib/price-match/server";

export async function GET() {
  return Response.json(await readPublicPriceMatch(), { headers: { "Cache-Control": "no-store" } });
}
