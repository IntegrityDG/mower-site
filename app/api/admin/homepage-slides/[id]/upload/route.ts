import { randomUUID } from "node:crypto";
import { isReviewAdmin } from "@/lib/reviews/admin-auth";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { inspectSignedUploadToken, isValidSignedUploadToken } from "@/lib/ids-action/signed-upload-token";
import { HOMEPAGE_SLIDE_BUCKET, HOMEPAGE_SLIDE_MAX_BYTES, HOMEPAGE_SLIDE_TYPES, isSlideId } from "@/lib/homepage-slides/policy";
import { slideTable } from "@/lib/homepage-slides/server";
import { finalizeSlideImage } from "@/lib/homepage-slides/image-server";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  if(!(await isReviewAdmin()))return Response.json({error:"Unauthorized"},{status:401});
  const{id}=await params; const body=await request.json().catch(()=>null);
  if(!isSlideId(id)||!body||!Number.isSafeInteger(body.size)||body.size<1||body.size>HOMEPAGE_SLIDE_MAX_BYTES||!Object.hasOwn(HOMEPAGE_SLIDE_TYPES,body.type??""))return Response.json({error:"Upload a JPEG, PNG, or WebP image, 10 MB or smaller."},{status:400});
  const {data:row}=await slideTable().select("id").eq("id",id).maybeSingle();if(!row)return Response.json({error:"Slide not found."},{status:404});
  const path=`uploads/${id}/${randomUUID()}.${HOMEPAGE_SLIDE_TYPES[body.type as keyof typeof HOMEPAGE_SLIDE_TYPES]}`;
  const{data,error}=await getSupabaseServiceClient().storage.from(HOMEPAGE_SLIDE_BUCKET).createSignedUploadUrl(path);
  if(error||!isValidSignedUploadToken(inspectSignedUploadToken(data?.token,data?.signedUrl)))return Response.json({error:"Upload authorization failed."},{status:503});
  return Response.json({path,signedUrl:data!.signedUrl},{headers:{"Cache-Control":"no-store"}});
}
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}) {
  if(!(await isReviewAdmin()))return Response.json({error:"Unauthorized"},{status:401});
  const{id}=await params;const body=await request.json().catch(()=>null);
  if(!isSlideId(id)||typeof body?.path!=="string"||typeof body?.expectedUpdatedAt!=="string")return Response.json({error:"Invalid upload attachment."},{status:400});
  try{return Response.json({slide:await finalizeSlideImage(id,body.path,body.expectedUpdatedAt)});}catch{return Response.json({error:"Image could not be attached. Use a valid single JPEG, PNG, or WebP under 10 MB and reload if this slide changed."},{status:409});}
}
