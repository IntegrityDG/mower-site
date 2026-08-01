import { createHash } from "node:crypto";
import { PAYMENT_SECURITY_POLICY_ID, PAYMENT_SECURITY_POLICY_VERSION } from "./payment-security-policy";
import type { CheckoutPaymentMethod, CheckoutRequest } from "./types";

const CHECKOUT_POLICY_VERSION = "card-checkout-4B2A-v1";
const clean = (value: string | null) => value?.trim().replace(/\s+/g, " ") || null;
export function canonicalCheckoutRequest(input: CheckoutRequest) {
  return { requestId: input.requestId.toLowerCase(), paymentMethod: input.paymentMethod, selection: { ...input.selection, options: [...input.selection.options].sort((a,b) => a.optionId.localeCompare(b.optionId)) }, customer: { name: clean(input.customer.name), email: clean(input.customer.email)?.toLowerCase() ?? null, phone: clean(input.customer.phone) }, shippingAddress: { ...input.shippingAddress, line1: clean(input.shippingAddress.line1), line2: clean(input.shippingAddress.line2), city: clean(input.shippingAddress.city), state: clean(input.shippingAddress.state)?.toUpperCase(), postalCode: clean(input.shippingAddress.postalCode) } };
}
export function checkoutRequestFingerprint(input: CheckoutRequest) { return createHash("sha256").update(JSON.stringify(canonicalCheckoutRequest(input))).digest("hex"); }
export function checkoutAttemptIdempotencyKey(requestId: string, paymentMethod: CheckoutPaymentMethod = "card") { return createHash("sha256").update([CHECKOUT_POLICY_VERSION, PAYMENT_SECURITY_POLICY_ID, PAYMENT_SECURITY_POLICY_VERSION, paymentMethod, requestId.toLowerCase()].join(":" )).digest("hex"); }
export { CHECKOUT_POLICY_VERSION };
