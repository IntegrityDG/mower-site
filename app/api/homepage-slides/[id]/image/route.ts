import { serveSlideImage } from "@/lib/homepage-slides/image-server";
import { isSlideId } from "@/lib/homepage-slides/policy";
export const dynamic = "force-dynamic";
export async function GET(_: Request, { params }: { params: Promise<{id:string}> }) { const {id} = await params; return isSlideId(id) ? serveSlideImage(id) : new Response(null, {status:404}); }
