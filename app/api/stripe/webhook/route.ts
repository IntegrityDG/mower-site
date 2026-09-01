import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { applyAchEventV1, applyCardEventV2, applyWireEventV1, findActiveWireByStripeCustomerId, findByPaymentIntentId, findBySessionId, finishWebhook, linkPaymentIntentByIdentity, recordWebhookReceipt, type CheckoutRecord } from "@/lib/checkout/order-repository";
import { getStripeMode, getStripeWebhookSecret, StripeConfigurationError } from "@/lib/stripe/config";
import { getStripeServerClient } from "@/lib/stripe/server";
import { reconcileAchIntent, reconcileAchSession } from "@/lib/stripe/ach-webhook-policy";
import { assertStripeEventMode, reconcileCompletedSession, reconcileExpiredSession, reconcileFinancialObject, WebhookReconciliationError } from "@/lib/stripe/webhook-policy";
import { reconcileWireIntent, reconcileWireSession } from "@/lib/stripe/wire-webhook-policy";
import { IdsPaymentIntentResolutionError, resolvePaymentIntent } from "@/lib/stripe/payment-intent-resolution";
import { notifyPaymentBusinessEvent } from "@/lib/notifications/payment-notifications";
import { refundNotificationSemanticId } from "@/lib/notifications/notification-keys";
import { applyDemoPayment, expireDemoCheckout, finalizeDemoPartyOrderBenefits, readDemoPaymentByIntent, readDemoPaymentBySession, reconcileDemoRefund } from "@/lib/demo-party/server";
import { DemoPaymentReconciliationError, isDemoPaymentMetadata, reconcileDemoCheckoutSession } from "@/lib/demo-party/stripe-policy";
import { portalTokenIsWellFormed } from "@/lib/demo-party/security";
import { readDemoRequest } from "@/lib/demo-scheduling/server";
import { notifyDemoPaymentConfirmed } from "@/lib/demo-scheduling/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ok = () => NextResponse.json({ received: true });
const objectId = (value: string | { id: string } | null) => typeof value === "string" ? value : value?.id ?? null;
const paymentMethod = (record: CheckoutRecord) => record.snapshot.paymentMethod;
const sessionShape = (session: Stripe.Checkout.Session) => ({ livemode: session.livemode, status: session.status, mode: session.mode, paymentMethodTypes: session.payment_method_types, clientReferenceId: session.client_reference_id, metadata: session.metadata, currency: session.currency, amountTotal: session.amount_total, paymentStatus: session.payment_status });
const intentShape = (intent: Stripe.PaymentIntent) => ({ livemode: intent.livemode, status: intent.status, paymentMethodTypes: intent.payment_method_types, metadata: intent.metadata, currency: intent.currency, amount: intent.amount });
const wireIntentShape = (intent: Stripe.PaymentIntent) => ({ ...intentShape(intent), amountReceived: intent.amount_received });

async function retrieveIntent(id: string) { return getStripeServerClient().paymentIntents.retrieve(id); }
async function listIntentSessions(id: string) { return (await getStripeServerClient().checkout.sessions.list({ payment_intent: id, limit: 2 })).data; }

function portalTokenFromSuccessUrl(session: Stripe.Checkout.Session) {
  const value = (session as Stripe.Checkout.Session & { success_url?: string | null }).success_url;
  if (!value) return null;
  try {
    const match = new URL(value).pathname.match(/^\/services-scheduling\/manage\/([^/]+)$/);
    const token = match ? decodeURIComponent(match[1]) : "";
    return portalTokenIsWellFormed(token) ? token : null;
  } catch { return null; }
}

async function handleDemoSession(eventType: string, session: Stripe.Checkout.Session, expectedLivemode: boolean) {
  const record = await readDemoPaymentBySession(session.id);
  if (!record) throw new DemoPaymentReconciliationError("Demo Session is not linked.");
  if (eventType === "checkout.session.expired") {
    if (!isDemoPaymentMetadata(session.metadata) || session.client_reference_id !== record.appointmentId) throw new DemoPaymentReconciliationError("Expired Demo Session identity mismatch.");
    await expireDemoCheckout(session.id);
    return;
  }
  if (eventType !== "checkout.session.completed") throw new DemoPaymentReconciliationError("Unsupported Demo Session event.");
  const { paymentIntentId } = reconcileDemoCheckoutSession(session, record, expectedLivemode);
  const applied = await applyDemoPayment(session.id, paymentIntentId, null);
  const token = portalTokenFromSuccessUrl(session);
  if (!token) throw new Error("Demo Session is missing its secure return token.");
  const request = await readDemoRequest(applied.requestId);
  await notifyDemoPaymentConfirmed(request, token);
}

async function handleDemoIntent(intent: Stripe.PaymentIntent, expectedLivemode: boolean) {
  if (!isDemoPaymentMetadata(intent.metadata)) throw new DemoPaymentReconciliationError("Demo PaymentIntent metadata mismatch.");
  const record = await readDemoPaymentByIntent(intent.id);
  if (!record) throw new DemoPaymentReconciliationError("Demo PaymentIntent is not linked.");
  if (intent.livemode !== expectedLivemode || intent.currency !== "usd" || intent.amount !== record.amountCents || intent.metadata.appointment_id !== record.appointmentId) throw new DemoPaymentReconciliationError("Demo PaymentIntent reconciliation failed.");
  if (intent.status !== "succeeded") return;
  const sessions = await listIntentSessions(intent.id);
  const session = sessions.find((item) => item.id === record.stripeCheckoutSessionId);
  if (session?.status === "complete" && session.payment_status === "paid") await handleDemoSession("checkout.session.completed", session, expectedLivemode);
}

async function applyAchIntent(record: CheckoutRecord, intent: Stripe.PaymentIntent, expectedLivemode: boolean, session: Stripe.Checkout.Session | null = null, forcedKind?: "failed" | "expired") {
  const kind = forcedKind ?? reconcileAchIntent(intentShape(intent), record, expectedLivemode);
  await applyAchEventV1({ p_kind: kind, p_session_id: session?.id ?? record.sessionId, p_payment_intent_id: intent.id, p_order_id: record.orderId, p_attempt_id: record.attemptId, p_amount: intent.amount, p_currency: intent.currency, p_stripe_session_status: session?.status ?? null, p_stripe_payment_status: session?.payment_status ?? null, p_payment_intent_status: intent.status, p_refunded: null });
  if (kind === "processing") await notifyPaymentBusinessEvent({ orderId: record.orderId, type: "ach_processing" });
  else if (kind === "paid") await notifyPaymentBusinessEvent({ orderId: record.orderId, type: "paid" });
  else if (kind === "failed") await notifyPaymentBusinessEvent({ orderId: record.orderId, type: "payment_failed", semanticId: record.attemptId });
}

async function applyWireIntent(record: CheckoutRecord, intent: Stripe.PaymentIntent, expectedLivemode: boolean, session: Stripe.Checkout.Session | null = null, forcedKind?: "failed" | "expired", eventId: string | null = null) {
  const resolved = reconcileWireIntent(wireIntentShape(intent), record, expectedLivemode);
  const kind = forcedKind ?? resolved.kind;
  await applyWireEventV1({ p_kind: kind, p_event_id: kind === "overpayment" ? eventId : null, p_session_id: session?.id ?? record.sessionId, p_payment_intent_id: intent.id, p_order_id: record.orderId, p_attempt_id: record.attemptId, p_amount: intent.amount, p_currency: intent.currency, p_stripe_session_status: session?.status ?? null, p_stripe_payment_status: session?.payment_status ?? null, p_payment_intent_status: intent.status, p_funded: resolved.funded, p_remaining: resolved.remaining, p_refunded: null });
  if (kind === "paid") await notifyPaymentBusinessEvent({ orderId: record.orderId, type: "paid" });
  else if (kind === "failed") await notifyPaymentBusinessEvent({ orderId: record.orderId, type: "payment_failed", semanticId: record.attemptId });
}

async function handleSession(eventType: string, session: Stripe.Checkout.Session, eventId: string, expectedLivemode: boolean) {
  const record = await findBySessionId(session.id);
  if (!record) throw new Error("session not linked");
  const method = paymentMethod(record);
  if (method === "card") {
    if (eventType === "checkout.session.completed") {
      const kind = reconcileCompletedSession(sessionShape(session), record, expectedLivemode);
      const paymentIntentId = objectId(session.payment_intent); const stripeCustomerId = objectId(session.customer);
      if (!paymentIntentId || !stripeCustomerId) throw new WebhookReconciliationError("Paid Session is missing required Stripe references.");
      await applyCardEventV2({ p_kind: kind, p_session_id: session.id, p_payment_intent_id: paymentIntentId, p_order_id: record.orderId, p_attempt_id: record.attemptId, p_amount: session.amount_total, p_currency: session.currency, p_stripe_session_status: session.status, p_stripe_payment_status: session.payment_status, p_refunded: null, p_stripe_customer_id: stripeCustomerId, p_contact: { email: session.customer_details?.email, name: session.customer_details?.name, phone: session.customer_details?.phone, billingAddress: session.customer_details?.address, shippingAddress: session.collected_information?.shipping_details?.address } });
      await finalizeDemoPartyOrderBenefits(record.orderId, record.attemptId, "paid");
      await notifyPaymentBusinessEvent({ orderId: record.orderId, type: "paid" });
      return;
    }
    if (eventType === "checkout.session.expired") {
      const kind = reconcileExpiredSession(sessionShape(session), record, expectedLivemode);
      await applyCardEventV2({ p_kind: kind, p_session_id: session.id, p_payment_intent_id: objectId(session.payment_intent), p_order_id: record.orderId, p_attempt_id: record.attemptId, p_amount: record.totalCents, p_currency: record.currency, p_stripe_session_status: session.status, p_stripe_payment_status: session.payment_status });
      await finalizeDemoPartyOrderBenefits(record.orderId, record.attemptId, "expired");
      return;
    }
    throw new WebhookReconciliationError("Unsupported card Session event.");
  }
  const paymentIntentId = objectId(session.payment_intent);
  if (!paymentIntentId) throw new Error("session missing PaymentIntent");
  const intent = await retrieveIntent(paymentIntentId);
  if (method === "ach_debit") {
    reconcileAchSession(sessionShape(session), record, expectedLivemode); reconcileAchIntent(intentShape(intent), record, expectedLivemode);
    if (eventType === "checkout.session.expired" && !["processing","succeeded"].includes(intent.status)) await applyAchIntent(record, intent, expectedLivemode, session, "expired");
    else if (eventType === "checkout.session.async_payment_failed") await applyAchIntent(record, intent, expectedLivemode, session, "failed");
    else await applyAchIntent(record, intent, expectedLivemode, session);
    return;
  }
  if (method === "wire_transfer") {
    reconcileWireSession(sessionShape(session), record, expectedLivemode); const resolved = reconcileWireIntent(wireIntentShape(intent), record, expectedLivemode);
    if (eventType === "checkout.session.expired" && resolved.funded === 0 && resolved.kind !== "paid") await applyWireIntent(record, intent, expectedLivemode, session, "expired");
    else if (eventType === "checkout.session.async_payment_failed") await applyWireIntent(record, intent, expectedLivemode, session, "failed");
    else await applyWireIntent(record, intent, expectedLivemode, session, undefined, eventId);
    return;
  }
  throw new WebhookReconciliationError("Unsupported Session payment method.");
}

async function handleIntent(intent: Stripe.PaymentIntent, eventId: string, expectedLivemode: boolean) {
  const resolution = await resolvePaymentIntent(intent, { findByPaymentIntentId, findBySessionId, linkByIdentity: linkPaymentIntentByIdentity, listSessions: listIntentSessions });
  if (!resolution) return;
  const { record } = resolution;
  if (paymentMethod(record) === "ach_debit") { await applyAchIntent(record, intent, expectedLivemode); return; }
  if (paymentMethod(record) === "wire_transfer") { await applyWireIntent(record, intent, expectedLivemode, null, undefined, eventId); return; }
  if (paymentMethod(record) === "card" && intent.status === "succeeded") {
    const session = resolution.session ?? (await listIntentSessions(intent.id))[0] ?? null;
    if (!session || session.status !== "complete" || session.payment_status !== "paid") return;
    const kind = reconcileCompletedSession(sessionShape(session), record, expectedLivemode);
    const stripeCustomerId = objectId(session.customer);
    if (!stripeCustomerId) throw new IdsPaymentIntentResolutionError("Paid IDS card Session is missing its Stripe customer.", { paymentIntentId: intent.id, sessionId: session.id });
    await applyCardEventV2({ p_kind: kind, p_session_id: session.id, p_payment_intent_id: intent.id, p_order_id: record.orderId, p_attempt_id: record.attemptId, p_amount: session.amount_total, p_currency: session.currency, p_stripe_session_status: session.status, p_stripe_payment_status: session.payment_status, p_refunded: null, p_stripe_customer_id: stripeCustomerId, p_contact: { email: session.customer_details?.email, name: session.customer_details?.name, phone: session.customer_details?.phone, billingAddress: session.customer_details?.address, shippingAddress: session.collected_information?.shipping_details?.address } });
    await finalizeDemoPartyOrderBenefits(record.orderId, record.attemptId, "paid");
    await notifyPaymentBusinessEvent({ orderId: record.orderId, type: "paid" });
    return;
  }
  throw new WebhookReconciliationError("Unsupported card PaymentIntent event.");
}

async function handleFinancial(event: Stripe.Event, expectedLivemode: boolean) {
  const stripeObject = event.data.object as Stripe.Charge | Stripe.Dispute;
  const paymentIntentId = objectId("payment_intent" in stripeObject ? stripeObject.payment_intent : null); if (!paymentIntentId) throw new Error("unknown PaymentIntent");
  const demoPayment = await readDemoPaymentByIntent(paymentIntentId);
  if (demoPayment) {
    if (event.type !== "charge.refunded") throw new DemoPaymentReconciliationError("Demo disputes require manual review.");
    const charge = stripeObject as Stripe.Charge;
    if (charge.livemode !== expectedLivemode || charge.currency !== "usd" || charge.amount !== demoPayment.amountCents) throw new DemoPaymentReconciliationError("Demo refund reconciliation failed.");
    await reconcileDemoRefund(paymentIntentId, charge.amount_refunded, event.id);
    return;
  }
  const record = await findByPaymentIntentId(paymentIntentId); if (!record) throw new Error("PaymentIntent not linked yet");
  reconcileFinancialObject({ livemode: stripeObject.livemode, amount: stripeObject.amount, currency: stripeObject.currency }, record, event.type === "charge.dispute.created", expectedLivemode);
  const kind = event.type === "charge.refunded" ? "refund" : "dispute";
  const cumulativeRefunded = event.type === "charge.refunded" ? (stripeObject as Stripe.Charge).amount_refunded : null;
  if (paymentMethod(record) === "card") await applyCardEventV2({ p_kind: kind, p_session_id: record.sessionId, p_payment_intent_id: paymentIntentId, p_order_id: record.orderId, p_attempt_id: record.attemptId, p_amount: stripeObject.amount, p_currency: stripeObject.currency, p_stripe_session_status: null, p_stripe_payment_status: null, p_refunded: cumulativeRefunded });
  else if (paymentMethod(record) === "ach_debit") await applyAchEventV1({ p_kind: kind, p_session_id: record.sessionId, p_payment_intent_id: paymentIntentId, p_order_id: record.orderId, p_attempt_id: record.attemptId, p_amount: stripeObject.amount, p_currency: stripeObject.currency, p_stripe_session_status: null, p_stripe_payment_status: null, p_payment_intent_status: null, p_refunded: cumulativeRefunded });
  else await applyWireEventV1({ p_kind: kind, p_event_id: event.id, p_session_id: record.sessionId, p_payment_intent_id: paymentIntentId, p_order_id: record.orderId, p_attempt_id: record.attemptId, p_amount: record.totalCents, p_currency: record.currency, p_stripe_session_status: null, p_stripe_payment_status: null, p_payment_intent_status: null, p_funded: record.fundedAmountCents ?? record.totalCents, p_remaining: record.amountRemainingCents ?? 0, p_refunded: cumulativeRefunded });
  await notifyPaymentBusinessEvent({ orderId: record.orderId, type: kind, semanticId: kind === "refund" ? refundNotificationSemanticId(cumulativeRefunded!) : stripeObject.id });
}

async function handleCashBalance(event: Stripe.Event, expectedLivemode: boolean) {
  const cash = event.data.object as Stripe.CashBalance & { customer?: string };
  const customerId = typeof cash.customer === "string" ? cash.customer : null;
  if (!customerId) throw new WebhookReconciliationError("Unusable cash balance event.");
  const record = await findActiveWireByStripeCustomerId(customerId); if (!record || !record.paymentIntentId) throw new Error("wire attempt not uniquely resolved");
  const intent = await retrieveIntent(record.paymentIntentId);
  await applyWireIntent(record, intent, expectedLivemode, null, undefined, event.id);
}

export async function POST(request: Request) {
  let event: Stripe.Event;
  let expectedLivemode: boolean;
  try { const signature=request.headers.get("stripe-signature"); if(!signature)return NextResponse.json({error:"Invalid webhook."},{status:400}); event=getStripeServerClient().webhooks.constructEvent(await request.text(),signature,getStripeWebhookSecret()); expectedLivemode=getStripeMode()==="live"; }
  catch(error){return NextResponse.json({error:error instanceof StripeConfigurationError?"Webhook unavailable.":"Invalid webhook."},{status:error instanceof StripeConfigurationError?503:400});}
  try { assertStripeEventMode(event.livemode, expectedLivemode); } catch { return NextResponse.json({error:"Invalid webhook."},{status:400}); }
  const object=event.data.object as {id?:string}; let receiptState:string;
  try { receiptState=await recordWebhookReceipt({id:event.id,type:event.type,objectId:object.id??null,livemode:event.livemode,apiVersion:event.api_version}); } catch { return NextResponse.json({error:"Webhook temporarily unavailable."},{status:503}); }
  if (["processed", "ignored"].includes(receiptState)) return ok();
  if (receiptState === "processing") return NextResponse.json({error:"Webhook processing is already in progress."},{status: 503});
  try {
    if (["checkout.session.completed","checkout.session.async_payment_succeeded","checkout.session.async_payment_failed","checkout.session.expired"].includes(event.type)) {
      const session=event.data.object as Stripe.Checkout.Session;
      if(isDemoPaymentMetadata(session.metadata)||await readDemoPaymentBySession(session.id)) await handleDemoSession(event.type,session,expectedLivemode);
      else await handleSession(event.type,session,event.id,expectedLivemode);
    }
    else if (["payment_intent.requires_action","payment_intent.processing","payment_intent.partially_funded","payment_intent.succeeded","payment_intent.payment_failed","payment_intent.canceled"].includes(event.type)) {
      const intent=event.data.object as Stripe.PaymentIntent;
      if(isDemoPaymentMetadata(intent.metadata)||await readDemoPaymentByIntent(intent.id)) await handleDemoIntent(intent,expectedLivemode);
      else await handleIntent(intent,event.id,expectedLivemode);
    }
    else if (event.type==="charge.refunded"||event.type==="charge.dispute.created") await handleFinancial(event,expectedLivemode);
    else if (event.type==="cash_balance.funds_available") await handleCashBalance(event,expectedLivemode);
    else { await finishWebhook(event.id,"ignored"); return ok(); }
    await finishWebhook(event.id,"processed"); return ok();
  } catch(error) {
    if(error instanceof WebhookReconciliationError||error instanceof DemoPaymentReconciliationError){await finishWebhook(event.id,"ignored","RECONCILIATION_REJECTED").catch(()=>undefined);return ok();}
    console.error("Stripe webhook processing failed", { eventId: event.id, eventType: event.type, objectId: object.id ?? null, errorName: error instanceof Error ? error.name : "UnknownError" });
    await finishWebhook(event.id,"failed","PROCESSING_FAILED").catch(()=>undefined);return NextResponse.json({error:"Webhook processing failed."},{status:503});
  }
}
