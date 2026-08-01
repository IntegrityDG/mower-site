import type Stripe from "stripe";
import { CHECKOUT_POLICY_VERSION } from "@/lib/checkout/idempotency";
import { PAYMENT_SECURITY_NOTICE, PAYMENT_SECURITY_POLICY_VERSION } from "@/lib/checkout/payment-security-policy";
import { buildBankSessionCommon, type BankSessionInput } from "./ach-checkout-session";

type WireInput = BankSessionInput & { stripeCustomerId: string };

export function buildWireCheckoutSession(input: WireInput): Stripe.Checkout.SessionCreateParams {
  if (input.snapshot.paymentMethod !== "wire_transfer" || input.snapshot.currency !== "usd") throw new Error("Wire USD snapshot required.");
  if (!/^cus_[A-Za-z0-9]+$/.test(input.stripeCustomerId)) throw new Error("Explicit Stripe Customer required.");
  const { line_items, token } = buildBankSessionCommon(input);
  const metadata = { order_id: input.orderId, attempt_id: input.attemptId, payment_method: "wire_transfer", checkout_policy: CHECKOUT_POLICY_VERSION, security_policy: PAYMENT_SECURITY_POLICY_VERSION };
  return { mode: "payment", payment_method_types: ["customer_balance"], payment_method_options: { customer_balance: { funding_type: "bank_transfer", bank_transfer: { type: "us_bank_transfer" } } }, line_items, customer: input.stripeCustomerId, billing_address_collection: "required", shipping_address_collection: { allowed_countries: ["US"] }, custom_text: { submit: { message: PAYMENT_SECURITY_NOTICE } }, payment_intent_data: { metadata }, client_reference_id: input.orderId, metadata, success_url: `${input.appBaseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${input.appBaseUrl}/checkout/cancel?token=${encodeURIComponent(token)}` };
}
