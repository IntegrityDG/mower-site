import {isReviewAdmin} from "@/lib/reviews/admin-auth";
import {adminInstallations,savePricing} from "@/lib/installations/server";
import type {PricingSnapshot} from "@/lib/installations/policy";
export async function GET(){if(!(await isReviewAdmin()))return Response.json({error:"Unauthorized"},{status:401});return Response.json(await adminInstallations(),{headers:{"Cache-Control":"no-store"}})}
export async function PATCH(request:Request){if(!(await isReviewAdmin()))return Response.json({error:"Unauthorized"},{status:401});try{await savePricing(await request.json() as PricingSnapshot);return Response.json({ok:true})}catch{return Response.json({error:"Pricing could not be saved."},{status:400})}}
