import { createHash, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { validateBusinessImage } from "@/lib/featured-businesses/image-validation";
import { validateFeaturedBusinessRequest } from "@/lib/featured-businesses/request-validation";
import { createRequest } from "@/lib/featured-businesses/request-server";
import { notifyFeaturedBusinessRequest } from "@/lib/featured-businesses/request-notification";

export async function POST(request:NextRequest){
 const form=await request.formData().catch(()=>null);if(!form)return Response.json({error:"Invalid submission."},{status:400});
 if(String(form.get("company")??"").trim())return Response.json({success:true},{status:201});
 const salt=process.env.REVIEW_RATE_LIMIT_SALT,forwarded=request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
 if(!salt||salt.length<32||!forwarded){console.error("Featured business request rate limiting is not configured.");return Response.json({error:"Request submission is temporarily unavailable."},{status:503});}
 const fingerprint=createHash("sha256").update(`${salt}:${forwarded}`).digest("hex"),client=getSupabaseServiceClient();
 const{data:allowed,error:rateError}=await client.rpc("featured_business_request_consume_rate_limit",{p_fingerprint:fingerprint});if(rateError)return Response.json({error:"Request submission is temporarily unavailable."},{status:503});if(!allowed)return Response.json({error:"Too many recent submissions. Please try again later."},{status:429});
 let areas:unknown=[];try{areas=JSON.parse(String(form.get("serviceAreas")??"[]"));}catch{/* validation reports the safe error */}
 const input=Object.fromEntries([...form.entries()].filter(([key])=>key!=="logo"));(input as Record<string,unknown>).serviceAreas=areas;
 const parsed=validateFeaturedBusinessRequest(input),image=await validateBusinessImage(form.get("logo"));if(!parsed.ok||!image.ok)return Response.json({errors:parsed.ok?{logo:image.error}:parsed.errors},{status:400});
 const id=randomUUID(),path=`requests/${id}/${randomUUID()}.${image.extension}`;
 const{error:uploadError}=await client.storage.from("featured-business-request-images").upload(path,await image.file.arrayBuffer(),{contentType:image.contentType,upsert:false});if(uploadError)return Response.json({error:"Your request could not be saved. Please try again."},{status:500});
 try{await createRequest(parsed.value,{path,originalName:image.file.name,contentType:image.contentType},fingerprint);}catch{await client.storage.from("featured-business-request-images").remove([path]);return Response.json({error:"Your request could not be saved. Please try again."},{status:500});}
 await notifyFeaturedBusinessRequest(parsed.value);return Response.json({success:true},{status:201});
}
