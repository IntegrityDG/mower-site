import type Stripe from "stripe";
import { CHECKOUT_POLICY_VERSION } from "@/lib/checkout/idempotency";
import { PAYMENT_SECURITY_NOTICE, PAYMENT_SECURITY_POLICY_VERSION } from "@/lib/checkout/payment-security-policy";
import { allocateDiscountedBankItems } from "@/lib/checkout/payment-pricing";
import { signCancelState } from "@/lib/checkout/signed-state";
import type { OrderPriceSnapshot } from "@/lib/checkout/types";
import { SUPPORT_CHECKOUT_NOTICE } from "@/lib/checkout/optional-services";

export type BankSessionInput = { snapshot: OrderPriceSnapshot; orderId: string; attemptId: string; publicReference: string; customerEmail: string | null; appBaseUrl: string; signingSecret: string; returnPath: string; cancelExpiresAt: number };

function common(input: BankSessionInput) {
  if (!Number.isSafeInteger(input.cancelExpiresAt) || input.cancelExpiresAt <= 0) throw new Error("Invalid cancel expiration.");
  const token = signCancelState({ orderId: input.orderId, attemptId: input.attemptId, publicReference: input.publicReference, expiresAt: input.cancelExpiresAt, returnPath: input.returnPath }, input.signingSecret);
  const equipment = input.snapshot.chargeableItems.filter(item => item.itemType !== "fee");
  const services = input.snapshot.chargeableItems.filter(item => item.itemType === "fee").map(item => ({ name: item.name, description: item.description, amountCents: item.extendedAmountCents }));
  const line_items = [...allocateDiscountedBankItems(equipment, input.snapshot.discountCents), ...services].map((item) => ({ quantity: 1, price_data: { currency: "usd" as const, unit_amount: item.amountCents, product_data: { name: item.name.slice(0, 127), ...(item.description ? { description: item.description.slice(0, 500) } : {}) } } }));
  if (line_items.reduce((sum, item) => sum + item.price_data.unit_amount, 0) !== input.snapshot.totalCents) throw new Error("Stripe line total mismatch.");
  return { line_items, token };
}

export function buildAchCheckoutSession(input: BankSessionInput): Stripe.Checkout.SessionCreateParams {
  if (input.snapshot.paymentMethod !== "ach_debit" || input.snapshot.currency !== "usd") throw new Error("ACH USD snapshot required.");
  const { line_items, token } = common(input);
  const email = input.customerEmail?.trim();
  const metadata = { order_id: input.orderId, attempt_id: input.attemptId, public_reference: input.publicReference, payment_method: "ach_debit", checkout_policy: CHECKOUT_POLICY_VERSION, security_policy: PAYMENT_SECURITY_POLICY_VERSION };
  return { mode: "payment", payment_method_types: ["us_bank_account"], line_items, customer_creation: "always", ...(email ? { customer_email: email } : {}), billing_address_collection: "required", shipping_address_collection: { allowed_countries: ["US"] }, custom_text: { submit: { message: input.snapshot.optionalServices?.remoteSupport ? `${PAYMENT_SECURITY_NOTICE} ${SUPPORT_CHECKOUT_NOTICE}` : PAYMENT_SECURITY_NOTICE } }, payment_intent_data: { metadata, ...(input.snapshot.optionalServices?.remoteSupport ? { setup_future_usage: "off_session" as const } : {}) }, client_reference_id: input.orderId, metadata, success_url: `${input.appBaseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${input.appBaseUrl}/checkout/cancel?token=${encodeURIComponent(token)}` };
}

export { common as buildBankSessionCommon };
