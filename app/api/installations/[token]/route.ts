import {installationByToken} from "@/lib/installations/server";
export async function GET(_:Request,{params}:{params:Promise<{token:string}>}){try{return Response.json(await installationByToken((await params).token),{headers:{"Cache-Control":"no-store"}})}catch{return Response.json({error:"Installation not found."},{status:404})}}
