import { isReviewAdmin } from "@/lib/reviews/admin-auth";
import { readAdminBusinesses, saveBusiness } from "@/lib/featured-businesses/server";
import { validateFeaturedBusiness } from "@/lib/featured-businesses/validation";
export async function GET(){if(!(await isReviewAdmin()))return Response.json({error:"Unauthorized"},{status:401});try{return Response.json({businesses:await readAdminBusinesses()});}catch{return Response.json({error:"Businesses could not be loaded."},{status:503});}}
export async function POST(request:Request){if(!(await isReviewAdmin()))return Response.json({error:"Unauthorized"},{status:401});const parsed=validateFeaturedBusiness(await request.json().catch(()=>null));if(!parsed.ok)return Response.json({errors:parsed.errors},{status:400});try{return Response.json({business:await saveBusiness(parsed.value)},{status:201});}catch{return Response.json({error:"Business could not be created."},{status:500});}}
