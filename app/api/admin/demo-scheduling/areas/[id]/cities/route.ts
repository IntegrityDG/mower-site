import { createDemoServiceAreaCityHandlers } from "@/lib/demo-scheduling/area-planning-handlers";
import { saveDemoServiceAreaCity } from "@/lib/demo-scheduling/server";
import { isReviewAdmin } from "@/lib/reviews/admin-auth";

const handlers = createDemoServiceAreaCityHandlers({ isAdmin: isReviewAdmin, save: saveDemoServiceAreaCity });
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handlers.POST(request, (await params).id);
}
