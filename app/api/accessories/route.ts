import { readAccessoryCatalog } from "@/lib/accessories/server";
export const dynamic = "force-dynamic";
export async function GET() { try { return Response.json(await readAccessoryCatalog(false), { headers: { "Cache-Control": "no-store" } }); } catch (error) { console.error("Accessory catalog API failure:", error); return Response.json({ error: "The accessory catalog is temporarily unavailable." }, { status: 503 }); } }
