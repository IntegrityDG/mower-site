import { createSalesSpecialsAdminHandlers } from "@/lib/promotions/admin-handlers";
import { readSalesSpecialsSlots, saveSalesSpecial } from "@/lib/promotions/server";
import { isReviewAdmin } from "@/lib/reviews/admin-auth";

export const { GET, PUT } = createSalesSpecialsAdminHandlers({
  isAdmin: isReviewAdmin,
  read: readSalesSpecialsSlots,
  save: saveSalesSpecial,
});
