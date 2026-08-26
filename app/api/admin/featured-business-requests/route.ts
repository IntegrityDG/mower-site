import { isReviewAdmin } from "@/lib/reviews/admin-auth";
import { listRequests } from "@/lib/featured-businesses/request-server";
export async function GET(request:Request){if(!(await isReviewAdmin()))return Response.json({error:"Unauthorized"},{status:401});try{const status=new URL(request.url).searchParams.get("status")??undefined;const requests=await listRequests(status);return Response.json({requests,pendingCount:requests.filter(item=>item.status==="pending").length});}catch{return Response.json({error:"Requests could not be loaded."},{status:503});}}
