import { isReviewAdmin } from "@/lib/reviews/admin-auth";
import { readAdminSlides, saveSlide } from "@/lib/homepage-slides/server";
import { validateSlideInput } from "@/lib/homepage-slides/policy";
export async function GET() { if (!(await isReviewAdmin())) return Response.json({error:"Unauthorized"},{status:401}); try { return Response.json({slides:await readAdminSlides()},{headers:{"Cache-Control":"no-store"}}); } catch { return Response.json({error:"Slides unavailable. Confirm the homepage slide migration is installed."},{status:503}); } }
export async function POST(request:Request) {
  if (!(await isReviewAdmin())) return Response.json({error:"Unauthorized"},{status:401});
  let value; try { value=validateSlideInput(await request.json()); } catch(error) { return Response.json({error:error instanceof Error?error.message:"Invalid slide."},{status:400}); }
  try { return Response.json({slide:await saveSlide(value)},{status:201}); } catch(error) { return Response.json({error:error instanceof Error?error.message:"Could not create slide."},{status:409}); }
}
