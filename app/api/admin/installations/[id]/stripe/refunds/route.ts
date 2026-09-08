import {isReviewAdmin} from "@/lib/reviews/admin-auth";
import {requestInstallationStripeRefund} from "@/lib/installations/stripe";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  if(!(await isReviewAdmin()))return Response.json({error:"Unauthorized"},{status:401});
  const raw=await request.text();if(new TextEncoder().encode(raw).byteLength>8000)return Response.json({error:"Request too large."},{status:413});
  try{const{id}=await params;return Response.json(await requestInstallationStripeRefund(id,JSON.parse(raw)),{headers:{"Cache-Control":"no-store"}});}
  catch(error){return Response.json({error:String((error as Error)?.message??"Refund could not be confirmed. Retry this same key.")},{status:409});}
}
