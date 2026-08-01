import type { CheckoutPaymentMethod } from "./types";

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
