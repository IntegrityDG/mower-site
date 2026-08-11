import type { CheckoutPaymentMethod } from "./types";
import type { PaymentMethodSettings } from "@/lib/payment-method-settings/types";

type PaymentMethodFeatureFlags = Record<string, string | undefined>;

export function paymentMethodIsServerEnabled(
  method: CheckoutPaymentMethod,
  env: PaymentMethodFeatureFlags = process.env,
) {
  if (method === "card") return true;
  if (method === "ach_debit") return env.ACH_CHECKOUT_ENABLED === "true";
  if (method === "wire_transfer") return env.WIRE_CHECKOUT_ENABLED === "true";
  return false;
}

export async function paymentMethodIsAvailableForNewCheckout(
  method: "card" | "ach_debit",
  readSettings: () => Promise<PaymentMethodSettings> = async () => (await import("@/lib/payment-method-settings/server")).readPaymentMethodSettingsFailSafe(),
  env: PaymentMethodFeatureFlags = process.env,
) {
  const settings = await readSettings().catch(() => ({ card:false, ach_debit:false, hearth_financing:false }));
  return settings[method] && paymentMethodIsServerEnabled(method, env);
}
