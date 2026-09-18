import type { PaymentMethodSettings } from "@/lib/payment-method-settings/types";
import { InvoiceValidationError } from "./domain";

export type OnlinePaymentMethod = "card" | "us_bank_account";

export function allowedCustomInvoiceMethods(settings: PaymentMethodSettings, environment: Record<string, string | undefined> = process.env) {
  const methods: OnlinePaymentMethod[] = [];
  if (settings.card) methods.push("card");
  if (settings.ach_debit && environment.ACH_CHECKOUT_ENABLED === "true") methods.push("us_bank_account");
  return methods;
}

export function selectCustomInvoiceMethods(requested: unknown, allowed: OnlinePaymentMethod[]) {
  if (!Array.isArray(requested) || requested.length === 0) throw new InvoiceValidationError("Select at least one payment method.");
  const unique = [...new Set(requested.map(String))];
  if (unique.some((method) => !allowed.includes(method as OnlinePaymentMethod))) throw new InvoiceValidationError("A selected payment method is disabled by IDS server settings.");
  return unique as OnlinePaymentMethod[];
}

export function paymentRequestAmount(invoice: { total_cents: number; amount_paid_cents: number; payment_terms: string; deposit_amount_cents: number | null }, kind: string) {
  const balance = invoice.total_cents - invoice.amount_paid_cents;
  if (kind === "deposit" && invoice.payment_terms === "deposit" && invoice.amount_paid_cents === 0 && invoice.deposit_amount_cents && invoice.deposit_amount_cents < invoice.total_cents) return invoice.deposit_amount_cents;
  if ((kind === "full" || kind === "balance") && balance > 0) return balance;
  throw new InvoiceValidationError("That payment request is not valid for this invoice.");
}
