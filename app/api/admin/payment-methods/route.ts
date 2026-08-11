import { createPaymentMethodAdminHandlers } from "@/lib/payment-method-settings/admin-handlers";
import { readPaymentMethodSettings, savePaymentMethodSetting } from "@/lib/payment-method-settings/server";
import { isReviewAdmin } from "@/lib/reviews/admin-auth";

export const dynamic = "force-dynamic";
export const { GET, PATCH } = createPaymentMethodAdminHandlers({ isAdmin:isReviewAdmin, read:readPaymentMethodSettings, save:savePaymentMethodSetting });
