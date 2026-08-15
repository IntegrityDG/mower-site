import { createDemoServiceAreaHandlers } from "@/lib/demo-scheduling/area-planning-handlers";
import { saveDemoServiceArea } from "@/lib/demo-scheduling/server";
import { isReviewAdmin } from "@/lib/reviews/admin-auth";

const handlers = createDemoServiceAreaHandlers({ isAdmin: isReviewAdmin, save: saveDemoServiceArea });
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handlers.PATCH(request, (await params).id);
}
