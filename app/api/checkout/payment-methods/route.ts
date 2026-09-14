import { paymentMethodIsServerEnabled } from "@/lib/checkout/payment-method-availability";
import { createPublicPaymentMethodAvailabilityHandler } from "@/lib/payment-method-settings/public-handler";
import { readPaymentMethodSettings } from "@/lib/payment-method-settings/server";

export const dynamic = "force-dynamic";

export const GET = createPublicPaymentMethodAvailabilityHandler({
  readSettings: readPaymentMethodSettings,
  achEnvironmentEnabled: () => paymentMethodIsServerEnabled("ach_debit"),
});
