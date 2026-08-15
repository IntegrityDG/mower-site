import { createDemoAreaAssignmentHandlers } from "@/lib/demo-scheduling/area-planning-handlers";
import { saveDemoAreaAssignment } from "@/lib/demo-scheduling/server";
import { isReviewAdmin } from "@/lib/reviews/admin-auth";

const handlers = createDemoAreaAssignmentHandlers({ isAdmin: isReviewAdmin, save: saveDemoAreaAssignment });
export const PUT = handlers.PUT;
