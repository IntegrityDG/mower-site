import type Stripe from "stripe";
import { PAYMENT_SECURITY_NOTICE, PAYMENT_SECURITY_POLICY_VERSION } from "@/lib/checkout/payment-security-policy";
import { CHECKOUT_POLICY_VERSION } from "@/lib/checkout/idempotency";
import { signCancelState } from "@/lib/checkout/signed-state";
import type { OrderPriceSnapshot } from "@/lib/checkout/types";

type Input = { snapshot: OrderPriceSnapshot; orderId: string; attemptId: string; publicReference: string; customerEmail: string | null; appBaseUrl: string; signingSecret: string; returnPath: string; cancelExpiresAt: number };
export function buildCardCheckoutSession(input: Input): Stripe.Checkout.SessionCreateParams {
  if (input.snapshot.paymentMethod !== "card" || input.snapshot.currency !== "usd") throw new Error("Card USD snapshot required.");
  const lines = input.snapshot.chargeableItems.filter(i => !i.includedInPackagePrice && i.extendedAmountCents > 0).map(i => ({ quantity: i.quantity, price_data: { currency: "usd", unit_amount: i.unitAmountCents, product_data: { name: i.name.slice(0,127), ...(i.description ? { description: i.description.slice(0,500) } : {}) } } }));
  if (lines.reduce((n,l) => n + (l.price_data.unit_amount ?? 0) * (l.quantity ?? 0), 0) !== input.snapshot.totalCents) throw new Error("Stripe line total mismatch.");
  if (!Number.isSafeInteger(input.cancelExpiresAt) || input.cancelExpiresAt <= 0) throw new Error("Invalid cancel expiration.");
  const token = signCancelState({ orderId: input.orderId, attemptId: input.attemptId, publicReference: input.publicReference, expiresAt: input.cancelExpiresAt, returnPath: input.returnPath }, input.signingSecret);
  const validEmail = input.customerEmail?.trim();
  const customerEmail = validEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(validEmail) ? validEmail : null;
  const metadata = { order_id:input.orderId, attempt_id:input.attemptId, public_reference:input.publicReference, payment_method:"card", checkout_policy:CHECKOUT_POLICY_VERSION, security_policy:PAYMENT_SECURITY_POLICY_VERSION };
  return { mode:"payment", payment_method_types:["card"], line_items:lines, customer_creation:"always", ...(customerEmail ? { customer_email: customerEmail } : {}), phone_number_collection:{enabled:true}, billing_address_collection:"required", shipping_address_collection:{allowed_countries:["US"]}, saved_payment_method_options:{payment_method_save:"enabled"}, custom_text:{submit:{message:PAYMENT_SECURITY_NOTICE}}, payment_intent_data:{metadata}, client_reference_id:input.orderId, metadata, success_url:`${input.appBaseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`, cancel_url:`${input.appBaseUrl}/checkout/cancel?token=${encodeURIComponent(token)}` };
}
