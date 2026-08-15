import { createDemoServiceAreaCityHandlers } from "@/lib/demo-scheduling/area-planning-handlers";
import { saveDemoServiceAreaCity } from "@/lib/demo-scheduling/server";
import { isReviewAdmin } from "@/lib/reviews/admin-auth";

const handlers = createDemoServiceAreaCityHandlers({ isAdmin: isReviewAdmin, save: saveDemoServiceAreaCity });
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; cityId: string }> }) {
  const { id, cityId } = await params;
  return handlers.PATCH(request, id, cityId);
}
