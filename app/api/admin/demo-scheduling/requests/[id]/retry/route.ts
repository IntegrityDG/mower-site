import { isReviewAdmin } from "@/lib/reviews/admin-auth";
import { retryFailedDemoNotifications } from "@/lib/demo-scheduling/notifications";
import { readDemoNotificationEvents, readDemoRequest } from "@/lib/demo-scheduling/server";

const applicable={pending:["ids_new_request"],approved:["customer_approved","ids_calendar_invite"],denied:["customer_denied"],cancelled:[]} as const;
export async function POST(_:Request,{params}:{params:Promise<{id:string}>}){if(!(await isReviewAdmin()))return Response.json({error:"Unauthorized"},{status:401});try{const{id}=await params,request=await readDemoRequest(id),events=await readDemoNotificationEvents(id),allowed=applicable[request.status];if(!events.some(event=>event.status==="failed"&&allowed.includes(event.event_type as never)))return Response.json({retried:false,message:"There are no failed applicable notifications to retry."});const delivery=await retryFailedDemoNotifications(request);return Response.json({retried:true,delivery});}catch{return Response.json({error:"Failed notifications could not be retried."},{status:500});}}
