import {installationControls} from "@/lib/installations/controls";
import {installationReadError} from "@/lib/installations/errors";
import {isReviewAdmin} from "@/lib/reviews/admin-auth";
import {adminInstallations,savePricing} from "@/lib/installations/server";
import type {PricingSnapshot} from "@/lib/installations/policy";
export async function GET(){if(!(await isReviewAdmin()))return Response.json({error:"Unauthorized"},{status:401});try{return Response.json({...await adminInstallations(),controls:installationControls()},{headers:{"Cache-Control":"no-store"}})}catch(error){const failure=installationReadError(error);return Response.json(failure.body,{status:failure.status,headers:{"Cache-Control":"no-store"}})}}
export async function PATCH(request:Request){if(!(await isReviewAdmin()))return Response.json({error:"Unauthorized"},{status:401});try{await savePricing(await request.json() as PricingSnapshot);return Response.json({ok:true})}catch{return Response.json({error:"Pricing could not be saved."},{status:400})}}
