import { isReviewAdmin } from "@/lib/reviews/admin-auth";
import { serveSlideImage } from "@/lib/homepage-slides/image-server";
import { isSlideId } from "@/lib/homepage-slides/policy";
export const dynamic = "force-dynamic";
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}) {if(!(await isReviewAdmin()))return new Response(null,{status:401});const{id}=await params;return isSlideId(id)?serveSlideImage(id,true):new Response(null,{status:404});}
