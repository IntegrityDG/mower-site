import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripeWebhookSecret, StripeConfigurationError } from "@/lib/stripe/config";
import { getStripeServerClient } from "@/lib/stripe/server";
import { applyCardEventV2, findByPaymentIntentId, findBySessionId, finishWebhook, recordWebhookReceipt } from "@/lib/checkout/order-repository";
import { assertTestEvent, reconcileCompletedSession, reconcileExpiredSession, reconcileFinancialObject, WebhookReconciliationError } from "@/lib/stripe/webhook-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ok = () => NextResponse.json({ received: true });
const objectId = (value: string | { id: string } | null) => typeof value === "string" ? value : value?.id ?? null;

export async function POST(request: Request) {
  let event: Stripe.Event;
  try {
    const signature = request.headers.get("stripe-signature");
    if (!signature) return NextResponse.json({ error: "Invalid webhook." }, { status: 400 });
    event = getStripeServerClient().webhooks.constructEvent(await request.text(), signature, getStripeWebhookSecret());
  } catch (error) {
    return NextResponse.json({ error: error instanceof StripeConfigurationError ? "Webhook unavailable." : "Invalid webhook." }, { status: error instanceof StripeConfigurationError ? 503 : 400 });
  }
  try { assertTestEvent(event.livemode); }
  catch { return NextResponse.json({ error: "Live events are not accepted." }, { status: 400 }); }
  const object = event.data.object as { id?: string };
  let receiptState: string;
  try {
    receiptState = await recordWebhookReceipt({ id: event.id, type: event.type, objectId: object.id ?? null, livemode: false, apiVersion: event.api_version });
  } catch { return NextResponse.json({ error: "Webhook temporarily unavailable." }, { status: 503 }); }
  if (["processed", "ignored"].includes(receiptState)) return ok();
  if (receiptState === "processing") return NextResponse.json({ error: "Webhook processing is already in progress." }, { status: 503 });

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const record = await findBySessionId(session.id);
      if (!record) throw new Error("not linked yet");
      const kind = reconcileCompletedSession({ livemode: session.livemode, status: session.status, mode: session.mode, paymentMethodTypes: session.payment_method_types, clientReferenceId: session.client_reference_id, metadata: session.metadata, currency: session.currency, amountTotal: session.amount_total, paymentStatus: session.payment_status }, record);
      const paymentIntentId = objectId(session.payment_intent);
      const stripeCustomerId = objectId(session.customer);
      if (kind === "paid" && (!paymentIntentId || !stripeCustomerId)) throw new WebhookReconciliationError("Paid Session is missing required Stripe references.");
      await applyCardEventV2({ p_kind: kind, p_session_id: session.id, p_payment_intent_id: paymentIntentId, p_order_id: record.orderId, p_attempt_id: record.attemptId, p_amount: session.amount_total, p_currency: session.currency, p_stripe_session_status: session.status, p_stripe_payment_status: session.payment_status, p_refunded: null, p_stripe_customer_id: stripeCustomerId, p_contact: { email: session.customer_details?.email, name: session.customer_details?.name, phone: session.customer_details?.phone, billingAddress: session.customer_details?.address, shippingAddress: session.collected_information?.shipping_details?.address } });
    } else if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      const record = await findBySessionId(session.id);
      if (!record) throw new Error("unknown");
      const kind = reconcileExpiredSession({ livemode: session.livemode, status: session.status, mode: session.mode, paymentMethodTypes: session.payment_method_types, clientReferenceId: session.client_reference_id, metadata: session.metadata, currency: session.currency, amountTotal: session.amount_total, paymentStatus: session.payment_status }, record);
      await applyCardEventV2({ p_kind: kind, p_session_id: session.id, p_payment_intent_id: objectId(session.payment_intent), p_order_id: record.orderId, p_attempt_id: record.attemptId, p_amount: record.totalCents, p_currency: record.currency, p_stripe_session_status: session.status, p_stripe_payment_status: session.payment_status });
    } else if (event.type === "charge.refunded" || event.type === "charge.dispute.created") {
      const stripeObject = event.data.object as Stripe.Charge | Stripe.Dispute;
      const paymentIntentId = objectId("payment_intent" in stripeObject ? stripeObject.payment_intent : null);
      if (!paymentIntentId) throw new Error("unknown");
      const record = await findByPaymentIntentId(paymentIntentId);
      if (!record) throw new Error("not linked yet");
      reconcileFinancialObject({ livemode: stripeObject.livemode, amount: stripeObject.amount, currency: stripeObject.currency }, record, event.type === "charge.dispute.created");
      await applyCardEventV2({ p_kind: event.type === "charge.refunded" ? "refund" : "dispute", p_session_id: record.sessionId, p_payment_intent_id: paymentIntentId, p_order_id: record.orderId, p_attempt_id: record.attemptId, p_amount: stripeObject.amount, p_currency: stripeObject.currency, p_stripe_session_status: null, p_stripe_payment_status: null, p_refunded: event.type === "charge.refunded" ? (stripeObject as Stripe.Charge).amount_refunded : null });
    } else {
      await finishWebhook(event.id, "ignored");
      return ok();
    }
    await finishWebhook(event.id, "processed");
    return ok();
  } catch (error) {
    if (error instanceof WebhookReconciliationError) {
      await finishWebhook(event.id, "ignored", "RECONCILIATION_REJECTED").catch(() => undefined);
      return ok();
    }
    await finishWebhook(event.id, "failed", "PROCESSING_FAILED").catch(() => undefined);
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 503 });
  }
}
