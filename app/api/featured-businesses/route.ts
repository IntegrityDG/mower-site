import { readPublicBusinesses } from "@/lib/featured-businesses/server";
export async function GET(request:Request){try{const featured=new URL(request.url).searchParams.get("featured")==="true";return Response.json({businesses:await readPublicBusinesses(featured)});}catch{return Response.json({error:"Featured businesses are temporarily unavailable."},{status:503});}}
