import { readPublicHomepageSlides } from "@/lib/homepage-slides/server";
export const dynamic = "force-dynamic";
export async function GET() { return Response.json(await readPublicHomepageSlides(), { headers: { "Cache-Control": "no-store" } }); }
