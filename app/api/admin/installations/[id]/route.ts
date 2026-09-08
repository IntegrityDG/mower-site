import { isReviewAdmin } from "@/lib/reviews/admin-auth";
import { executeInstallationAdmin } from "@/lib/installations/operations";
export async function PATCH(request: Request, {params}: {params: Promise<{id:string}>}) {
  if(!(await isReviewAdmin()))return Response.json({error:"Unauthorized"},{status:401});
  const raw=await request.text();if(new TextEncoder().encode(raw).byteLength>16000)return Response.json({error:"Request too large."},{status:413});
  try {const {id}=await params;return Response.json(await executeInstallationAdmin(id,JSON.parse(raw)),{headers:{"Cache-Control":"no-store"}});}
  catch(error){const code=String((error as Error)?.message??"");const rejected=error instanceof SyntaxError||(error as {safeToEdit?:boolean})?.safeToEdit===true;return Response.json({error:code||"Update could not be confirmed. Keep the same operation key.",code},{status:rejected?400:409});}
}
