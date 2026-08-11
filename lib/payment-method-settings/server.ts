import "server-only";

import { getSupabaseServiceClient } from "@/lib/supabase";
import { CUSTOMER_PAYMENT_METHODS, FAIL_SAFE_PAYMENT_METHOD_SETTINGS, type CustomerPaymentMethod, type PaymentMethodSettings } from "./types";

export async function readPaymentMethodSettings(): Promise<PaymentMethodSettings> {
  const { data, error } = await getSupabaseServiceClient()
    .from("checkout_payment_method_settings")
    .select("payment_method,enabled");
  if (error) throw new Error("Payment method settings are unavailable.");
  const settings = { ...FAIL_SAFE_PAYMENT_METHOD_SETTINGS };
  for (const row of data ?? []) if (CUSTOMER_PAYMENT_METHODS.includes(row.payment_method as CustomerPaymentMethod)) settings[row.payment_method as CustomerPaymentMethod] = row.enabled === true;
  return settings;
}

export async function readPaymentMethodSettingsFailSafe() {
  try { return await readPaymentMethodSettings(); }
  catch { return { ...FAIL_SAFE_PAYMENT_METHOD_SETTINGS }; }
}

export async function savePaymentMethodSetting(paymentMethod: CustomerPaymentMethod, enabled: boolean) {
  const { error } = await getSupabaseServiceClient()
    .from("checkout_payment_method_settings")
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq("payment_method", paymentMethod);
  if (error) throw new Error("Payment method setting could not be saved.");
  return { paymentMethod, enabled };
}
