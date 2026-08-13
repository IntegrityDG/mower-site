import { isReviewAdmin } from "@/lib/reviews/admin-auth";
import { deleteException } from "@/lib/demo-scheduling/server";
export async function DELETE(_:Request,{params}:{params:Promise<{id:string}>}){if(!(await isReviewAdmin()))return Response.json({error:"Unauthorized"},{status:401});try{await deleteException((await params).id);return new Response(null,{status:204});}catch{return Response.json({error:"Blackout could not be removed."},{status:500});}}
