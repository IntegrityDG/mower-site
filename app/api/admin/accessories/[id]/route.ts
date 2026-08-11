import { createAccessoryAdminHandlers } from "@/lib/accessories/admin-handlers";
import { readAccessoryCatalog, saveAccessoryItem, saveAccessorySettings, setAccessoryAvailability } from "@/lib/accessories/server";
import { isReviewAdmin } from "@/lib/reviews/admin-auth";
const handlers=createAccessoryAdminHandlers({isAdmin:isReviewAdmin,read:()=>readAccessoryCatalog(true),saveSettings:saveAccessorySettings,saveItem:saveAccessoryItem,setAvailability:setAccessoryAvailability});
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}) { return handlers.PATCH(request,(await params).id); }
