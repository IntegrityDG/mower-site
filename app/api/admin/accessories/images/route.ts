import { randomUUID } from "node:crypto";
import { isReviewAdmin } from "@/lib/reviews/admin-auth";
import { getSupabaseServiceClient } from "@/lib/supabase";
const TYPES:Record<string,string>={"image/jpeg":"jpg","image/png":"png","image/webp":"webp"};
export async function POST(request:Request) {
  if (!(await isReviewAdmin())) return Response.json({error:"Unauthorized"},{status:401});
  const form=await request.formData().catch(()=>null); const file=form?.get("file");
  if (!(file instanceof File) || !TYPES[file.type]) return Response.json({error:"Upload a JPEG, PNG, or WebP image."},{status:400});
  if (file.size>5*1024*1024) return Response.json({error:"Image must be 5 MB or smaller."},{status:400});
  const key=`uploads/${new Date().toISOString().slice(0,10)}/${randomUUID()}.${TYPES[file.type]}`;
  const client=getSupabaseServiceClient(); const {error}=await client.storage.from("ids-accessory-images").upload(key,await file.arrayBuffer(),{contentType:file.type,upsert:false});
  if(error)return Response.json({error:"Image upload failed."},{status:500});
  return Response.json({url:client.storage.from("ids-accessory-images").getPublicUrl(key).data.publicUrl});
}
