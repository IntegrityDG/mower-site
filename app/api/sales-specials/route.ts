import { readSalesSpecials } from "@/lib/promotions/server";

export async function GET() {
  try {
    const promotion = await readSalesSpecials();
    if (!promotion?.enabled) return Response.json({ promotion: null });
    return Response.json({ promotion });
  } catch {
    return Response.json({ promotion: null });
  }
}
