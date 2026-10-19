import { createTickerAdminHandlers } from "@/lib/promotions/ticker-admin-handlers";
import { readAdminSalesTicker, saveSalesTicker } from "@/lib/promotions/ticker-server";
import { isReviewAdmin } from "@/lib/reviews/admin-auth";

export const { GET, PUT } = createTickerAdminHandlers({
  isAdmin: isReviewAdmin,
  read: readAdminSalesTicker,
  save: saveSalesTicker,
});
