import {isReviewAdmin} from "@/lib/reviews/admin-auth";
import {getSupabaseServiceClient} from "@/lib/supabase";
import {reconcileInstallationPayment} from "@/lib/installations/stripe";
import {operationKey} from "@/lib/installations/admin-policy";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  if(!(await isReviewAdmin()))return Response.json({error:"Unauthorized"},{status:401});
  const raw=await request.text();if(new TextEncoder().encode(raw).byteLength>8000)return Response.json({error:"Request too large."},{status:413});
  try{
    const{id}=await params,body=JSON.parse(raw);if(Object.keys(body).some(k=>!["paymentId","sessionId","operationKey","reason"].includes(k)))throw new Error("invalid_reconciliation_request");
    const paymentId=operationKey(body.paymentId);if(body.sessionId&&(!/^cs_test_[a-zA-Z0-9]+$/.test(body.sessionId)))throw new Error("invalid_session_reference");
    const{data,error}=await getSupabaseServiceClient().from("installation_payments").select("id").eq("id",paymentId).eq("installation_id",id).single();
    if(error)throw error;if(!data)throw new Error("invalid_payment");
    return Response.json(await reconcileInstallationPayment(paymentId,{sessionId:body.sessionId||undefined}),{headers:{"Cache-Control":"no-store"}});
  }catch(error){return Response.json({error:String((error as Error)?.message??"Reconciliation could not be confirmed.")},{status:409});}
}
