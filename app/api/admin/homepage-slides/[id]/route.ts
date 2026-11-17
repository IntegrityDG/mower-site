import { isReviewAdmin } from "@/lib/reviews/admin-auth";
import { saveSlide } from "@/lib/homepage-slides/server";
import { isSlideId, validateSlideInput } from "@/lib/homepage-slides/policy";
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}) {
  if (!(await isReviewAdmin())) return Response.json({error:"Unauthorized"},{status:401});
  const {id}=await params; if(!isSlideId(id)) return Response.json({error:"Invalid slide."},{status:400});
  let value, version; try { const body=await request.json(); if(Object.keys(body).some(key=>!["values","expectedUpdatedAt"].includes(key))) throw new Error("Invalid update."); value=validateSlideInput(body.values); version=body.expectedUpdatedAt; if(typeof version!=="string"||!Number.isFinite(Date.parse(version))) throw new Error("Reload before saving."); } catch(error) { return Response.json({error:error instanceof Error?error.message:"Invalid slide."},{status:400}); }
  try {return Response.json({slide:await saveSlide(value,id,version)});} catch(error) {return Response.json({error:error instanceof Error?error.message:"Could not update slide."},{status:409});}
}
