import {installationControls,installationCheckoutAvailable} from "@/lib/installations/controls";
import {installationReadError} from "@/lib/installations/errors";
import {installationByToken} from "@/lib/installations/server";
export async function GET(_:Request,{params}:{params:Promise<{token:string}>}){try{return Response.json({...await installationByToken((await params).token),controls:{...installationControls(),onlinePaymentsEnabled:installationCheckoutAvailable()}},{headers:{"Cache-Control":"no-store"}})}catch(error){if((error as {code?:string})?.code==="PGRST116")return Response.json({error:"Installation not found."},{status:404});const failure=installationReadError(error);return Response.json(failure.body,{status:failure.status})}}
