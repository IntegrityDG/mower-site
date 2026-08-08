import { createReferralAdminHandlers } from "@/lib/referrals/admin-handlers";
import { listAdminReferrals, mutateAdminReferral } from "@/lib/referrals/repository";
import { isReviewAdmin } from "@/lib/reviews/admin-auth";

const handlers = createReferralAdminHandlers({ isAdmin: isReviewAdmin, list: listAdminReferrals, mutate: mutateAdminReferral });
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return handlers.PATCH(request, (await context.params).id);
}
