import { createPriceMatchAdminHandlers } from "@/lib/price-match/admin-handlers";
import { readPriceMatch, savePriceMatch } from "@/lib/price-match/server";
import { isReviewAdmin } from "@/lib/reviews/admin-auth";

export const { GET, PUT } = createPriceMatchAdminHandlers({ isAdmin: isReviewAdmin, read: readPriceMatch, save: savePriceMatch });
