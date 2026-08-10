import { createPricingAdminHandlers } from "@/lib/admin-pricing/handlers";
import { readPricingCatalog, updatePricingRecord } from "@/lib/admin-pricing/server";
import { isReviewAdmin } from "@/lib/reviews/admin-auth";

const handlers = createPricingAdminHandlers({ isAdmin: isReviewAdmin, read: readPricingCatalog, update: updatePricingRecord });
export const PATCH = handlers.PATCH;
