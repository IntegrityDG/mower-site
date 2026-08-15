import { createDemoAreaAssignmentItemHandlers } from "@/lib/demo-scheduling/area-planning-handlers";
import { clearDemoAreaAssignment } from "@/lib/demo-scheduling/server";
import { isReviewAdmin } from "@/lib/reviews/admin-auth";

const handlers = createDemoAreaAssignmentItemHandlers({ isAdmin: isReviewAdmin, clear: clearDemoAreaAssignment });
export async function DELETE(_: Request, { params }: { params: Promise<{ date: string }> }) {
  return handlers.DELETE((await params).date);
}
