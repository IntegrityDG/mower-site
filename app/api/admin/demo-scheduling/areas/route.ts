import { createDemoServiceAreaHandlers } from "@/lib/demo-scheduling/area-planning-handlers";
import { saveDemoServiceArea } from "@/lib/demo-scheduling/server";
import { isReviewAdmin } from "@/lib/reviews/admin-auth";

const handlers = createDemoServiceAreaHandlers({ isAdmin: isReviewAdmin, save: saveDemoServiceArea });
export const POST = handlers.POST;
