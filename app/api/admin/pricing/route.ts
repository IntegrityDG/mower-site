import { createPricingAdminHandlers } from "@/lib/admin-pricing/handlers";
import { readPricingCatalog, readPricingRecordValues, updatePricingRecord } from "@/lib/admin-pricing/server";
import { isReviewAdmin } from "@/lib/reviews/admin-auth";

const handlers = createPricingAdminHandlers({ isAdmin: isReviewAdmin, read: readPricingCatalog, readValues: readPricingRecordValues, update: updatePricingRecord });
export const GET = handlers.GET;
