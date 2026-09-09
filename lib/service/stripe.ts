import "server-only";
import type Stripe from "stripe";
import { getStripeServerClient } from "@/lib/stripe/server";
import { getStripeMode } from "@/lib/stripe/config";
import { dealerNetworkOrigin } from "@/lib/dealer-network/api";
import { requestFingerprint } from "@/lib/dealer-network/security";
import { activationDate, failureDeadline, nextBillingDate, SERVICE_POLICY_VERSION, SUPPORT_MONTHLY_CENTS } from "./policy";
import { serviceDatabase, serviceRpc, databaseError } from "./repository";
import { serviceToken, tokenHash } from "./security";
import { requireServiceControl, serviceControls } from "./controls";
import { requireServiceAvailability } from "./availability";
import { parseSupportPurchase, ServiceError } from "./validation";
import { serviceRateLimit } from "./auth";
import { caseByToken, readCases, subscriptionByToken } from "./server";
import type { StaffActor, Subscription } from "./types";

type StripeSupportRecord = Subscription & { stripe_checkout_session_id: string | null; stripe_payment_method_id: string | null; request_key: string };
export type ServicePayment = {
  id: string; case_id: string; invoice_id: string | null; operation_key: string;
  purpose: "authorization" | "invoice"; method: "setup" | "card" | "link" | "terminal" | "cash";
  amount_cents: number; currency: "usd"; status: string; livemode: boolean;
  stripe_customer_id: string | null; stripe_session_id: string | null; stripe_intent_id: string | null; created_at: string;
};
const stripe = () => getStripeServerClient();
const live = () => getStripeMode() === "live";
const id = (value: string | { id: string } | null | undefined) => typeof value === "string" ? value : value?.id ?? null;
const iso = (seconds: number) => new Date(seconds * 1000).toISOString();
const meta = (kind: string, reference: string) => ({ ids_service: SERVICE_POLICY_VERSION, service_kind: kind, service_reference: reference });
function assertMode(value: { livemode: boolean }) { if (value.livemode !== live()) throw new ServiceError("Stripe mode mismatch.", 409); }
function assertRecentUnlinked(createdAt: string) {
  if (Date.now() - Date.parse(createdAt) > 23 * 3_600_000) throw new ServiceError("This payment attempt needs reconciliation before retrying. No new charge was created.", 409);
}
export async function supportRecord(subscriptionId: string): Promise<StripeSupportRecord> {
  const { data, error } = await serviceDatabase().from("remote_support_subscriptions").select("*").eq("id", subscriptionId).single();
  if (error) databaseError(error);
  return data;
}
export async function startSupportCheckout(request: Request, value: unknown) {
  requireServiceControl("remoteSupport"); requireServiceControl("payments");
  await requireServiceAvailability("new_remote_support_subscriptions");
  await serviceRateLimit(request, "subscribe", 10);
  const input = parseSupportPurchase(value); const token = serviceToken("support", input.key);
  const record = await serviceRpc<StripeSupportRecord>("ids_support_checkout_draft", { p_key: input.key, p_fingerprint: requestFingerprint(input), p_token_hash: tokenHash(token), p_customer: { ...input, origin: dealerNetworkOrigin(request) }, p_live: live(), p_order: null });
  if (record.stripe_checkout_session_id) {
    const session = await stripe().checkout.sessions.retrieve(record.stripe_checkout_session_id); assertMode(session);
    return { checkoutUrl: session.url ?? `${dealerNetworkOrigin(request)}/remote-assistance/manage/${token}` };
  }
  assertRecentUnlinked(record.created_at);
  const origin = dealerNetworkOrigin(request); const metadata = meta("support_initial", record.id);
  const session = await stripe().checkout.sessions.create({
    mode: "payment", payment_method_types: ["card"], customer_creation: "always", customer_email: input.email,
    line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: SUPPORT_MONTHLY_CENTS, product_data: { name: "IDS Remote Support - first month", description: "Four issue-based sessions. $100/month; cancel anytime, no partial-month refunds." } } }],
    payment_intent_data: { setup_future_usage: "off_session", metadata }, metadata, client_reference_id: record.id,
    custom_text: { submit: { message: "$100 today for your first month, then $100/month automatically. Four issue-based sessions per cycle; no rollover or prorated refunds. Cancel through your private subscription link." } },
    success_url: `${origin}/remote-assistance/manage/${token}?payment=return`, cancel_url: `${origin}/remote-assistance`,
  }, { idempotencyKey: `ids-support-checkout:${record.id}` });
  assertMode(session);
  const { error } = await serviceDatabase().from("remote_support_subscriptions").update({ stripe_checkout_session_id: session.id }).eq("id", record.id).is("stripe_checkout_session_id", null);
  if (error) databaseError(error);
  if (!session.url) throw new ServiceError("Stripe did not return a checkout link.", 502);
  return { checkoutUrl: session.url };
}

async function monthlyPrice() {
  const lookupKey = "ids_remote_support_monthly_v1";
  const existing = (await stripe().prices.list({ lookup_keys: [lookupKey], active: true, limit: 2 })).data;
  if (existing.length > 1) throw new ServiceError("Remote Support recurring pricing needs review.", 503);
  if (existing[0]) {
    const price = existing[0]; assertMode(price);
    if (price.currency !== "usd" || price.unit_amount !== SUPPORT_MONTHLY_CENTS || price.recurring?.interval !== "month" || price.recurring.interval_count !== 1) throw new ServiceError("Remote Support recurring pricing does not match the approved rate.", 503);
    return price.id;
  }
  const product = await stripe().products.create({ name: "IDS Remote Support", description: "$100/month, four issue-based sessions; one issue until resolved.", metadata: { ids_service: SERVICE_POLICY_VERSION } }, { idempotencyKey: "ids-remote-support-product-v1" });
  const price = await stripe().prices.create({ currency: "usd", unit_amount: SUPPORT_MONTHLY_CENTS, recurring: { interval: "month" }, product: product.id, lookup_key: lookupKey }, { idempotencyKey: "ids-remote-support-price-v1" });
  assertMode(price); return price.id;
}

export async function createPrepaidRecurringSubscription(subscriptionId: string) {
  let record = await supportRecord(subscriptionId);
  if (record.source === "machine" && !record.paid_through) { await fulfillMachineSupport(record); record = await supportRecord(subscriptionId); }
  if (record.stripe_subscription_id || record.status === "cancelled") return;
  if (!record.stripe_customer_id || !record.stripe_payment_method_id || !record.paid_through) throw new ServiceError("The prepaid subscription is awaiting its verified payment method.", 409);
  if (record.livemode !== live()) throw new ServiceError("Subscription mode mismatch.", 409);
  // Stripe idempotency keys are finite-lived. Recover the created subscription
  // by its immutable IDS identity before ever retrying creation.
  const matches: Stripe.Subscription[] = [];
  for await (const candidate of stripe().subscriptions.list({ customer: record.stripe_customer_id, status: "all", limit: 100 })) {
    if (candidate.metadata.ids_service === SERVICE_POLICY_VERSION && candidate.metadata.service_reference === record.id) matches.push(candidate);
  }
  if (matches.length > 1) throw new ServiceError("Multiple recurring records require reconciliation.", 409);
  if (matches[0]) {
    assertMode(matches[0]);
    const { error } = await serviceDatabase().from("remote_support_subscriptions").update({ stripe_subscription_id: matches[0].id }).eq("id", record.id).is("stripe_subscription_id", null);
    if (error) databaseError(error);
    return;
  }
  const method = await stripe().paymentMethods.retrieve(record.stripe_payment_method_id);
  assertMode(method);
  if (id(method.customer) !== record.stripe_customer_id || !["card", "us_bank_account"].includes(method.type)) throw new ServiceError("A reusable authorized payment method is required.", 409);
  // The first month was already collected. Stripe's billing deferral is an
  // implementation detail: IDS grants the paid cycle, not free-trial benefits.
  const paidEnd = Math.floor(Date.parse(record.paid_through) / 1000);
  if (paidEnd <= Date.now() / 1000 + 48 * 3600) throw new ServiceError("Delayed recurring setup requires reconciliation before collecting another payment.", 409);
  const subscription = await stripe().subscriptions.create({ customer: record.stripe_customer_id, default_payment_method: method.id,
    items: [{ price: await monthlyPrice() }], trial_end: paidEnd, proration_behavior: "none",
    cancel_at_period_end: record.cancel_at_period_end,
    payment_settings: { payment_method_types: [method.type as "card" | "us_bank_account"], save_default_payment_method: "on_subscription" },
    metadata: meta("support_recurring", record.id),
  }, { idempotencyKey: `ids-support-recurring:${record.id}` });
  assertMode(subscription);
  const { error } = await serviceDatabase().from("remote_support_subscriptions").update({ stripe_subscription_id: subscription.id }).eq("id", record.id).is("stripe_subscription_id", null);
  if (error) databaseError(error);
}

async function fulfillMachineSupport(record: StripeSupportRecord) {
  const order = await serviceRpc<{ id: string; status: string; paidAt: string | null; totalCents: number; currency: string; customerId: string; stripeCustomerId: string | null; sessionId: string | null; intentId: string | null; snapshot: { optionalServices?: { remoteSupport: boolean }; chargeableItems: { itemType: string; sourceId: string; extendedAmountCents: number }[] } }>("ids_service_machine_order", { p_subscription: record.id });
  if (!order || order.status !== "paid" || !order.paidAt || !order.snapshot.optionalServices?.remoteSupport || !order.sessionId || order.customerId !== record.customer_id) throw new ServiceError("Machine payment is not yet confirmed.", 409);
  const session = await stripe().checkout.sessions.retrieve(order.sessionId); assertMode(session);
  const intent = await stripe().paymentIntents.retrieve(id(session.payment_intent) ?? order.intentId ?? ""); assertMode(intent);
  const method = id(intent.payment_method); const customer = id(intent.customer);
  const supportLines = order.snapshot.chargeableItems.filter(line => line.itemType === "fee" && line.sourceId === "ids-remote-support-v1");
  if (record.livemode !== session.livemode || session.metadata?.order_id !== order.id || session.client_reference_id !== order.id || session.mode !== "payment" || session.payment_status !== "paid" || session.amount_total !== order.totalCents || intent.status !== "succeeded" || intent.amount_received !== order.totalCents || intent.currency !== "usd" || !method || !customer || (order.stripeCustomerId && order.stripeCustomerId !== customer) || supportLines.length !== 1 || supportLines[0].extendedAmountCents !== SUPPORT_MONTHLY_CENTS) throw new ServiceError("Machine subscription payment reconciliation failed.", 409);
  const starts = activationDate(order.paidAt, "machine");
  await serviceRpc("ids_support_paid_cycle", { p_subscription: record.id, p_event: `machine-paid:${order.id}`, p_invoice: `machine:${order.id}`, p_stripe_customer: customer, p_stripe_subscription: null, p_payment_method: method, p_live: session.livemode, p_paid_at: order.paidAt, p_start: starts, p_end: nextBillingDate(starts) });
}

async function fulfillSupportSession(session: Stripe.Checkout.Session, eventId: string, eventCreated: number) {
  assertMode(session);
  const record = await supportRecord(session.metadata?.service_reference ?? "");
  if (session.mode !== "payment" || session.client_reference_id !== record.id || session.metadata?.service_kind !== "support_initial"
    || (record.stripe_checkout_session_id && record.stripe_checkout_session_id !== session.id) || session.currency !== "usd" || session.amount_total !== SUPPORT_MONTHLY_CENTS) throw new ServiceError("Subscription checkout identity or amount mismatch.", 409);
  if (session.status !== "complete" || session.payment_status !== "paid") return;
  const intent = await stripe().paymentIntents.retrieve(id(session.payment_intent) ?? ""); assertMode(intent);
  const customerId = id(session.customer); const method = id(intent.payment_method);
  if (!customerId || !method || intent.status !== "succeeded" || intent.amount_received !== SUPPORT_MONTHLY_CENTS || intent.currency !== "usd" || id(intent.customer) !== customerId) throw new ServiceError("Subscription payment reconciliation failed.", 409);
  const paidAt = iso(eventCreated); const starts = activationDate(paidAt, record.source);
  // Repeated event deliveries must use the first persisted cycle's dates.
  const { data: prior, error } = await serviceDatabase().from("remote_support_cycles").select("starts_at,ends_at,paid_at").eq("stripe_invoice_id", `initial:${session.id}`).maybeSingle();
  if (error) databaseError(error);
  await serviceRpc("ids_support_paid_cycle", { p_subscription: record.id, p_event: eventId, p_invoice: `initial:${session.id}`, p_stripe_customer: customerId, p_stripe_subscription: null, p_payment_method: method, p_live: session.livemode, p_paid_at: prior?.paid_at ?? paidAt, p_start: prior?.starts_at ?? starts, p_end: prior?.ends_at ?? nextBillingDate(starts) });
  await queueRecurringSetup(record.id);
  await createPrepaidRecurringSubscription(record.id);
}
export async function queueRecurringSetup(subscriptionId: string) {
  const { error } = await serviceDatabase().from("service_outbox").upsert({ semantic_key: `support-recurring:${subscriptionId}`, kind: "machine_subscription", subscription_id: subscriptionId }, { onConflict: "semantic_key", ignoreDuplicates: true });
  if (error) databaseError(error);
}

async function subscriptionClock(subscription: Stripe.Subscription) {
  if (!subscription.livemode && subscription.test_clock) {
    const clock = typeof subscription.test_clock === "string" ? await stripe().testHelpers.testClocks.retrieve(subscription.test_clock) : subscription.test_clock;
    return clock.frozen_time * 1000;
  }
  return Date.now();
}
async function firstFailedInvoiceAt(invoice: Stripe.Invoice, deliveredFailure?: number) {
  let earliest = deliveredFailure;
  // A delayed or repeated webhook must not restart the fourteen-day window.
  // Stripe retains these recent events throughout the entire recovery window.
  for await (const event of stripe().events.list({ type: "invoice.payment_failed", created: { gte: invoice.created }, limit: 100 })) {
    if ((event.data.object as Stripe.Invoice).id === invoice.id) earliest = Math.min(earliest ?? event.created, event.created);
  }
  if (earliest === undefined) throw new ServiceError("The invoice failure time needs reconciliation; access remains suspended.", 409);
  return iso(earliest);
}

export async function reconcileSubscription(subscriptionId: string, failedEventAt?: number) {
  const record = await supportRecord(subscriptionId);
  if (!record.stripe_subscription_id) { if (record.paid_through) await createPrepaidRecurringSubscription(record.id); return; }
  const subscription = await stripe().subscriptions.retrieve(record.stripe_subscription_id, { expand: ["latest_invoice"] }); assertMode(subscription);
  const clockNow = await subscriptionClock(subscription);
  if (id(subscription.customer) !== record.stripe_customer_id || subscription.metadata.service_reference !== record.id || subscription.metadata.ids_service !== SERVICE_POLICY_VERSION) throw new ServiceError("Subscription identity mismatch.", 409);
  const latest = typeof subscription.latest_invoice === "string" ? await stripe().invoices.retrieve(subscription.latest_invoice) : subscription.latest_invoice;
  const voluntarilyCancelled = subscription.metadata.ids_failure_deadline ? record.cancel_at_period_end : subscription.cancel_at_period_end;
  const state = async (status: string, invoice: string | null = null, failedAt: string | null = null) => serviceRpc("ids_support_state", { p_subscription: record.id, p_live: subscription.livemode, p_stripe_subscription: subscription.id, p_state: status, p_invoice: invoice, p_failed_at: failedAt, p_cancel_at_period_end: voluntarilyCancelled });
  if (latest) {
    assertMode(latest);
    if (id(latest.customer) !== record.stripe_customer_id || latest.currency !== "usd") throw new ServiceError("Subscription invoice identity mismatch.", 409);
    if (latest.status === "paid" && latest.amount_paid > 0) {
      const line = latest.lines.data.find(item => item.parent?.subscription_item_details?.subscription_item === subscription.items.data[0]?.id);
      if (!line || latest.amount_paid !== SUPPORT_MONTHLY_CENTS || latest.total !== SUPPORT_MONTHLY_CENTS || !latest.status_transitions.paid_at) throw new ServiceError("Recurring invoice does not match the approved monthly price.", 409);
      const paid = await serviceRpc<{ reviewRequired?: boolean }>("ids_support_paid_cycle", { p_subscription: record.id, p_event: `invoice-paid:${latest.id}`, p_invoice: latest.id, p_stripe_customer: record.stripe_customer_id, p_stripe_subscription: subscription.id,
        p_payment_method: id(subscription.default_payment_method), p_live: subscription.livemode, p_paid_at: iso(latest.status_transitions.paid_at), p_start: iso(line.period.start), p_end: iso(line.period.end) });
      if (paid.reviewRequired) {
        if (subscription.status !== "canceled") await stripe().subscriptions.cancel(subscription.id, { prorate: false, invoice_now: false });
        await state("cancelled"); return;
      }
      if (subscription.metadata.ids_failure_deadline && subscription.status !== "canceled") {
        await stripe().subscriptions.update(subscription.id, { cancel_at: "", proration_behavior: "none", metadata: { ids_failure_deadline: "" } });
        if (voluntarilyCancelled) await stripe().subscriptions.update(subscription.id, { cancel_at_period_end: true, proration_behavior: "none" });
      }
    } else if (latest.status !== "paid" && latest.attempt_count > 0 && latest.amount_due > 0) {
      // First suspend without assuming a fresh window, then determine the
      // authoritative first failure from Stripe's event history.
      let failedAt = record.failed_at;
      if (!failedAt) {
        try { failedAt = await firstFailedInvoiceAt(latest, failedEventAt); }
        catch (error) { await state("suspended", latest.id, null); throw error; }
      }
      await state("suspended", latest.id, failedAt);
      const deadline = Math.floor(Date.parse(failureDeadline(failedAt)) / 1000);
      if (clockNow >= deadline * 1000) {
        if (subscription.status !== "canceled") await stripe().subscriptions.cancel(subscription.id, { prorate: false, invoice_now: false });
        await state("cancelled"); return;
      }
      if (subscription.status !== "canceled" && subscription.cancel_at !== deadline) {
        await stripe().subscriptions.update(subscription.id, { cancel_at: deadline, proration_behavior: "none", metadata: { ids_failure_deadline: String(deadline) } });
      }
    }
  }
  if (subscription.status === "canceled" || subscription.status === "incomplete_expired") await state("cancelled");
  else await state(["past_due", "unpaid"].includes(subscription.status) ? "suspended" : "active", latest?.id ?? null, record.failed_at ?? (failedEventAt ? iso(failedEventAt) : null));
}

export async function cancelSupport(token: string) {
  const record = await subscriptionByToken(token);
  if (record.livemode !== live()) throw new ServiceError("Subscription mode mismatch.", 409);
  if (record.status === "pending_payment") throw new ServiceError("No paid subscription exists yet.", 409);
  if (record.stripe_subscription_id) {
    const current = await stripe().subscriptions.retrieve(record.stripe_subscription_id); assertMode(current);
    if (current.status !== "canceled") {
      if (!record.paid_through || Date.parse(record.paid_through) <= await subscriptionClock(current)) {
        await stripe().subscriptions.cancel(current.id, { prorate: false, invoice_now: false });
      } else await stripe().subscriptions.update(current.id, { cancel_at_period_end: true, proration_behavior: "none" }, { idempotencyKey: `ids-support-cancel:${record.id}` });
    }
  }
  const { error } = await serviceDatabase().from("remote_support_subscriptions").update({ cancel_at_period_end: true }).eq("id", record.id);
  if (error) databaseError(error);
  if (record.stripe_subscription_id) await reconcileSubscription(record.id);
  return { cancelAtPeriodEnd: true, paidThrough: record.paid_through };
}
async function paymentMethodPortalConfiguration() {
  const matches = [];
  for await (const configuration of stripe().billingPortal.configurations.list({ active: true, limit: 100 })) {
    if (configuration.metadata?.ids_service_portal === "payment_method_v1") matches.push(configuration);
  }
  if (matches.length > 1) throw new ServiceError("Billing portal configuration needs review.", 409);
  const configuration = matches[0] ?? await stripe().billingPortal.configurations.create({
    name: "IDS Remote Support payment method", metadata: { ids_service_portal: "payment_method_v1" },
    features: { payment_method_update: { enabled: true }, customer_update: { enabled: false }, invoice_history: { enabled: false }, subscription_cancel: { enabled: false }, subscription_update: { enabled: false } },
  }, { idempotencyKey: "ids-support-payment-method-portal-v1" });
  assertMode(configuration);
  if (!configuration.features.payment_method_update.enabled || configuration.features.subscription_cancel.enabled || configuration.features.subscription_update.enabled || configuration.features.customer_update.enabled) throw new ServiceError("Billing portal permissions need review.", 409);
  return configuration.id;
}
export async function supportBillingPortal(request: Request, token: string) {
  const record = await subscriptionByToken(token);
  if (!record.stripe_customer_id || record.livemode !== live()) throw new ServiceError("Billing access is not ready.", 409);
  // This narrowly scoped flow changes the payment method. Cancellation remains
  // IDS cancel-at-period-end; the generic portal cannot enable prorated refunds.
  const session = await stripe().billingPortal.sessions.create({ customer: record.stripe_customer_id, configuration: await paymentMethodPortalConfiguration(),
    return_url: `${dealerNetworkOrigin(request)}/remote-assistance/manage/${token}`,
    flow_data: { type: "payment_method_update", after_completion: { type: "redirect", redirect: { return_url: `${dealerNetworkOrigin(request)}/remote-assistance/manage/${token}?billing=updated` } } },
  });
  return { url: session.url };
}

export async function retrySupportPayment(token: string, operationKey: string) {
  requireServiceControl("payments");
  const record = await subscriptionByToken(token);
  await reconcileSubscription(record.id);
  const current = await supportRecord(record.id);
  if (current.status !== "suspended" || !current.failed_at || !current.stripe_subscription_id || !current.stripe_customer_id) throw new ServiceError("There is no overdue payment eligible for retry.", 409);
  const customer = await stripe().customers.retrieve(current.stripe_customer_id);
  if (customer.deleted) throw new ServiceError("Billing customer is unavailable.", 409);
  assertMode(customer);
  const methodId = id(customer.invoice_settings.default_payment_method) ?? current.stripe_payment_method_id;
  if (!methodId) throw new ServiceError("Update your payment method first.", 409);
  const method = await stripe().paymentMethods.retrieve(methodId); assertMode(method);
  if (id(method.customer) !== customer.id) throw new ServiceError("Payment method ownership mismatch.", 409);
  const subscription = await stripe().subscriptions.retrieve(current.stripe_subscription_id); assertMode(subscription);
  if (await subscriptionClock(subscription) >= Date.parse(failureDeadline(current.failed_at))) throw new ServiceError("The payment recovery window has closed.", 409);
  const invoiceId = id(subscription.latest_invoice);
  if (!invoiceId) throw new ServiceError("No overdue invoice is available.", 409);
  await stripe().subscriptions.update(subscription.id, { default_payment_method: method.id });
  try { await stripe().invoices.pay(invoiceId, { payment_method: method.id }, { idempotencyKey: `ids-support-retry:${invoiceId}:${method.id}:${operationKey}` }); }
  catch { await reconcileSubscription(current.id); throw new ServiceError("Payment was not confirmed. Review your method and subscription status before retrying.", 409); }
  await reconcileSubscription(current.id); return { ok: true };
}

async function paymentRecord(paymentId: string): Promise<ServicePayment> {
  const { data, error } = await serviceDatabase().from("service_payments").select("*").eq("id", paymentId).single();
  if (error) databaseError(error); return data;
}
async function customerForCase(caseId: string) {
  return serviceRpc<{ id: string; stripe_customer_id: string | null; name: string; email: string | null }>("ids_service_customer", { p_case: caseId });
}
async function ensureStripeCustomer(caseId: string) {
  const customer = await customerForCase(caseId);
  if (customer.stripe_customer_id) { const existing = await stripe().customers.retrieve(customer.stripe_customer_id); if (existing.deleted) throw new ServiceError("The saved customer is unavailable.", 409); assertMode(existing); return existing.id; }
  const created = await stripe().customers.create({ name: customer.name, ...(customer.email ? { email: customer.email } : {}), metadata: { ids_customer_id: customer.id } }, { idempotencyKey: `ids-service-customer:${customer.id}` });
  assertMode(created);
  await serviceRpc("ids_service_customer_link", { p_customer: customer.id, p_stripe_customer: created.id });
  return created.id;
}
export async function createServicePayment(request: Request, input: { actor: StaffActor; caseId: string; key: string; method: ServicePayment["method"]; token?: string; receipt?: string; notes?: string }) {
  requireServiceControl(input.method === "cash" ? "cash" : "payments");
  const detail = await readCases(input.actor, input.caseId);
  if (input.method === "card" && !detail.case.payment_method_id) throw new ServiceError("No authorized card is saved. Create a pay-now link.", 409);
  if (input.method === "setup" && (!input.token || (await caseByToken(input.token)).id !== input.caseId)) throw new ServiceError("Customer payment authorization is required.", 403);
  if (input.method === "terminal" && !serviceControls().terminalReader) throw new ServiceError("No supported Stripe Terminal reader is configured. Phone Tap to Pay requires a native Terminal app.", 409);
  if (input.token && (await caseByToken(input.token)).id !== input.caseId) throw new ServiceError("Customer request ownership mismatch.", 403);
  const payment = await serviceRpc<ServicePayment>("ids_service_payment_reserve", { p_actor: input.actor.id, p_case: input.caseId, p_key: input.key, p_method: input.method, p_live: live(), p_receipt: input.receipt ?? null, p_notes: input.notes ?? null, p_customer_authorized: Boolean(input.token) });
  if (payment.method === "cash") return { paymentId: payment.id, status: "paid_cash" };
  if (payment.stripe_session_id) {
    const existing = await stripe().checkout.sessions.retrieve(payment.stripe_session_id); assertMode(existing);
    return { paymentId: payment.id, url: existing.url, status: payment.status };
  }
  if (payment.stripe_intent_id) {
    const existing = await stripe().paymentIntents.retrieve(payment.stripe_intent_id); assertMode(existing);
    await applyServiceIntent(existing, `api-reconcile:${existing.id}:${existing.status}`);
    return { paymentId: payment.id, status: existing.status };
  }
  assertRecentUnlinked(payment.created_at);
  const customerId = await ensureStripeCustomer(input.caseId); const metadata = meta(payment.purpose === "authorization" ? "service_authorization" : "service_invoice", payment.id);
  const origin = dealerNetworkOrigin(request);
  if (payment.method === "setup" || payment.method === "link") {
    const returnUrl = input.token ? `${origin}/service/manage/${input.token}` : `${origin}/service/payment-result`;
    const session = await stripe().checkout.sessions.create({ mode: payment.method === "setup" ? "setup" : "payment", customer: customerId, payment_method_types: ["card"], client_reference_id: payment.case_id, metadata,
      ...(payment.method === "setup" ? { setup_intent_data: { metadata, description: "IDS paid Service authorization under published labor/travel rates" }, custom_text: { submit: { message: "Save this card for IDS Service under the published $80/$40 labor and travel rates. No estimated Service charge is collected now. Final payment is a separate authorized action." } } }
        : { line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: payment.amount_cents, product_data: { name: `IDS Service - ${detail.case.case_number}` } } }], payment_intent_data: { metadata } }),
      success_url: `${returnUrl}?payment=return`, cancel_url: returnUrl,
    }, { idempotencyKey: `ids-service-checkout:${payment.id}` });
    assertMode(session);
    const { error } = await serviceDatabase().from("service_payments").update({ stripe_customer_id: customerId, stripe_session_id: session.id, stripe_intent_id: id(session.setup_intent) ?? id(session.payment_intent), status: "open" }).eq("id", payment.id);
    if (error) databaseError(error);
    return { paymentId: payment.id, url: session.url, status: "open" };
  }
  const terminal = payment.method === "terminal";
  if (!terminal && !detail.case.payment_method_id) throw new ServiceError("No authorized card is saved. Create a pay-now link.", 409);
  let intent: Stripe.PaymentIntent;
  try {
    intent = await stripe().paymentIntents.create({ amount: payment.amount_cents, currency: "usd", customer: customerId,
      payment_method_types: terminal ? ["card_present"] : ["card"], metadata,
      ...(terminal ? { capture_method: "automatic" as const } : { payment_method: detail.case.payment_method_id!, confirm: true, off_session: true }),
    }, { idempotencyKey: `ids-service-intent:${payment.id}` });
  } catch (error) {
    const failed = (error as { payment_intent?: Stripe.PaymentIntent }).payment_intent;
    if (!failed) throw error;
    intent = failed;
  }
  assertMode(intent);
  const { error } = await serviceDatabase().from("service_payments").update({ stripe_customer_id: customerId, stripe_intent_id: intent.id }).eq("id", payment.id);
  if (error) databaseError(error);
  if (terminal) {
    await stripe().terminal.readers.processPaymentIntent(serviceControls().terminalReader!, { payment_intent: intent.id }, { idempotencyKey: `ids-service-reader:${payment.id}` });
  } else {
    // A declined or authentication-required off-session attempt must be closed
    // at Stripe before the invoice can accept another collection method.
    if (["requires_payment_method", "requires_action"].includes(intent.status)) intent = await stripe().paymentIntents.cancel(intent.id);
    await applyServiceIntent(intent, `api-reconcile:${intent.id}:${intent.status}`);
  }
  return { paymentId: payment.id, status: intent.status };
}

async function applyServiceIntent(intent: Stripe.PaymentIntent, eventId: string) {
  assertMode(intent); const record = await paymentRecord(intent.metadata.service_reference ?? "");
  if (intent.metadata.ids_service !== SERVICE_POLICY_VERSION || intent.amount !== record.amount_cents || intent.currency !== record.currency) throw new ServiceError("Service payment amount or identity mismatch.", 409);
  const status = intent.status === "succeeded" ? "succeeded" : intent.status === "processing" ? "processing" : intent.status === "canceled" ? "expired" : "open";
  await serviceRpc("ids_service_payment_apply", { p_payment: record.id, p_event: eventId, p_status: status, p_live: intent.livemode, p_customer: id(intent.customer), p_intent: intent.id, p_session: record.stripe_session_id, p_amount: intent.amount, p_currency: intent.currency, p_method: null });
}

export async function reconcileServicePayments(actor: StaffActor, caseId: string, closeOpen: boolean) {
  await readCases(actor, caseId);
  if (!actor.canCollectPayments && !actor.canRecordCash) throw new ServiceError("Payment permission is required.", 403);
  const { data, error } = await serviceDatabase().from("service_payments").select("*").eq("case_id", caseId).eq("purpose", "invoice").in("status", ["creating", "open", "processing", "failed"]);
  if (error) databaseError(error);
  for (const payment of (data ?? []) as ServicePayment[]) {
    if (payment.livemode !== live()) throw new ServiceError("Payment mode mismatch.", 409);
    if (!payment.stripe_session_id && !payment.stripe_intent_id) await recoverUnlinkedServicePayment(payment, closeOpen);
    if (payment.status === "expired") continue;
    let intentId = payment.stripe_intent_id;
    if (payment.stripe_session_id) {
      let session = await stripe().checkout.sessions.retrieve(payment.stripe_session_id); assertMode(session);
      if (closeOpen && session.status === "open") session = await stripe().checkout.sessions.expire(session.id);
      intentId = id(session.payment_intent);
      if (session.status === "expired" && !intentId) {
        await serviceRpc("ids_service_payment_apply", { p_payment: payment.id, p_event: `reconcile-expired:${session.id}`, p_status: "expired", p_live: payment.livemode, p_customer: id(session.customer), p_intent: null, p_session: session.id, p_amount: payment.amount_cents, p_currency: payment.currency });
      }
    }
    if (intentId) {
      let intent = await stripe().paymentIntents.retrieve(intentId); assertMode(intent);
      if (closeOpen && ["requires_payment_method", "requires_action", "requires_confirmation", "requires_capture"].includes(intent.status)) intent = await stripe().paymentIntents.cancel(intent.id);
      await applyServiceIntent(intent, `reconcile:${intent.id}:${intent.status}`);
      if (closeOpen && !["canceled", "succeeded"].includes(intent.status)) throw new ServiceError("Stripe is still processing this payment. Another collection remains blocked.", 409);
    } else if (!payment.stripe_session_id) {
      throw new ServiceError("An unlinked attempt needs its original idempotent request retried before it can be closed. Another collection remains blocked.", 409);
    }
  }
  return { ok: true };
}

export async function recoverUnlinkedServicePayment(payment: ServicePayment, closeAbsent: boolean) {
  if (payment.livemode !== live() || payment.purpose !== "invoice" || payment.method === "cash") throw new ServiceError("Payment reconciliation identity mismatch.", 409);
  const created = { gte: Math.floor(Date.parse(payment.created_at) / 1000) - 60 };
  const sessions: Stripe.Checkout.Session[] = [], intents: Stripe.PaymentIntent[] = [];
  let inspected = 0;
  // Listing avoids the eventual-consistency delay of Stripe metadata search.
  // Bound work; exceeding the bound requires review, never assumed absence.
  for await (const session of stripe().checkout.sessions.list({ created, limit: 100 })) {
    if (++inspected > 1000) throw new ServiceError("This attempt needs a narrower processor review; another collection remains blocked.", 409);
    if (session.metadata?.ids_service === SERVICE_POLICY_VERSION && session.metadata.service_reference === payment.id) sessions.push(session);
  }
  inspected = 0;
  for await (const intent of stripe().paymentIntents.list({ created, limit: 100 })) {
    if (++inspected > 1000) throw new ServiceError("This attempt needs a narrower processor review; another collection remains blocked.", 409);
    if (intent.metadata.ids_service === SERVICE_POLICY_VERSION && intent.metadata.service_reference === payment.id) intents.push(intent);
  }
  if (sessions.length > 1 || intents.length > 1) throw new ServiceError("Multiple processor objects need review; another collection remains blocked.", 409);
  const session = sessions[0], intent = intents[0];
  if (session) {
    assertMode(session);
    if (session.mode !== "payment" || session.client_reference_id !== payment.case_id || session.currency !== payment.currency || session.amount_total !== payment.amount_cents || (intent && id(session.payment_intent) !== intent.id)) throw new ServiceError("Recovered checkout identity mismatch.", 409);
  }
  if (intent) { assertMode(intent); if (intent.amount !== payment.amount_cents || intent.currency !== payment.currency) throw new ServiceError("Recovered payment amount mismatch.", 409); }
  if (session || intent) {
    const customer = id(session?.customer) ?? id(intent?.customer);
    const expected = await customerForCase(payment.case_id);
    if (!customer || (expected.stripe_customer_id && customer !== expected.stripe_customer_id) || (payment.stripe_customer_id && customer !== payment.stripe_customer_id)) throw new ServiceError("Recovered payment customer mismatch.", 409);
    const patch = { stripe_customer_id: customer, stripe_session_id: session?.id ?? null, stripe_intent_id: intent?.id ?? id(session?.payment_intent) };
    const { error } = await serviceDatabase().from("service_payments").update(patch).eq("id", payment.id).is("stripe_session_id", null).is("stripe_intent_id", null);
    if (error) databaseError(error); Object.assign(payment, patch); return;
  }
  // Creation retries stop at 23h. After 48h, a complete list with no match also
  // rules out an in-flight original request. Preserve that reconciliation in
  // the ledger before allowing a new explicitly authorized collection.
  if (closeAbsent && Date.now() - Date.parse(payment.created_at) >= 48 * 3_600_000) {
    await serviceRpc("ids_service_payment_apply", { p_payment: payment.id, p_event: `reconciled-absent:${payment.id}`, p_status: "expired", p_live: payment.livemode, p_customer: payment.stripe_customer_id, p_intent: null, p_session: null, p_amount: payment.amount_cents, p_currency: payment.currency });
    payment.status = "expired"; return;
  }
  throw new ServiceError("Stripe has no linked result yet. Retry the original request; a new collection remains blocked until reconciliation is certain.", 409);
}

async function reconcileFinancialEvent(event: Stripe.Event): Promise<boolean> {
  const object = event.data.object as Stripe.Refund | Stripe.Dispute | Stripe.Charge;
  const chargeId = object.object === "charge" ? object.id : id(object.charge);
  if (!chargeId) return false;
  const charge = await stripe().charges.retrieve(chargeId);
  const intentId = id(charge.payment_intent);
  if (!intentId) return false;
  const intent = await stripe().paymentIntents.retrieve(intentId);
  let metadata = intent.metadata;
  if (metadata.ids_service !== SERVICE_POLICY_VERSION) {
    const payments = await stripe().invoicePayments.list({ payment: { type: "payment_intent", payment_intent: intent.id }, limit: 2 });
    if (payments.data.length === 1) {
      const invoice = await stripe().invoices.retrieve(id(payments.data[0].invoice)!);
      metadata = invoice.parent?.subscription_details?.metadata ?? {};
    }
  }
  if (metadata.ids_service !== SERVICE_POLICY_VERSION) return false;
  assertMode(event); assertMode(charge); assertMode(intent);
  if (charge.currency !== "usd" || intent.currency !== "usd" || charge.amount !== intent.amount || id(charge.customer) !== id(intent.customer) || !charge.paid) throw new ServiceError("Financial event identity mismatch.", 409);
  const refunds = []; for await (const refund of stripe().refunds.list({ charge: charge.id, limit: 100 })) { refunds.push({ id: refund.id, amount: refund.amount, status: refund.status }); }
  const disputes = []; for await (const dispute of stripe().disputes.list({ payment_intent: intent.id, limit: 100 })) { assertMode(dispute); disputes.push({ id: dispute.id, amount: dispute.amount, status: dispute.status }); }
  const review = refunds.some(refund => !["succeeded", "failed", "canceled"].includes(refund.status ?? "unknown")) || disputes.some(dispute => !["won", "warning_closed"].includes(dispute.status));
  await serviceRpc("ids_service_financial_reconcile", { p_reference: metadata.service_reference, p_support: metadata.service_kind.startsWith("support_"), p_object: charge.id, p_event: event.id,
    p_live: charge.livemode, p_customer: id(charge.customer), p_intent: intent.id, p_amount: charge.amount, p_refunded: charge.amount_refunded, p_review: review,
    p_details: { chargeId: charge.id, amountCents: charge.amount, refundedCents: charge.amount_refunded, reviewRequired: review, refunds, disputes } });
  return true;
}

export async function handleServiceStripeWebhook(event: Stripe.Event): Promise<boolean> {
  if (event.type === "charge.refunded" || event.type.startsWith("refund.") || event.type.startsWith("charge.dispute.")) return reconcileFinancialEvent(event);
  const payload = event.data.object as unknown as { metadata?: Record<string, string>; id: string };
  let metadata = payload.metadata;
  if (event.type.startsWith("invoice.")) metadata = (event.data.object as Stripe.Invoice).parent?.subscription_details?.metadata ?? undefined;
  if (metadata?.ids_service !== SERVICE_POLICY_VERSION) return false;
  assertMode(event);
  if (event.type.startsWith("customer.subscription.") || event.type.startsWith("invoice.")) {
    await reconcileSubscription(metadata.service_reference, event.type === "invoice.payment_failed" ? event.created : undefined); return true;
  }
  if (event.type.startsWith("checkout.session.")) {
    const session = event.data.object as Stripe.Checkout.Session;
    if (metadata.service_kind === "support_initial") {
      if (["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) await fulfillSupportSession(session, event.id, event.created);
      return true;
    }
    const record = await paymentRecord(metadata.service_reference);
    if (session.client_reference_id !== record.case_id || (record.stripe_session_id && session.id !== record.stripe_session_id)) throw new ServiceError("Service checkout identity mismatch.", 409);
    if (session.mode === "setup" && session.status === "complete") {
      const intent = await stripe().setupIntents.retrieve(id(session.setup_intent) ?? ""); assertMode(intent);
      if (intent.status !== "succeeded" || intent.metadata?.service_reference !== record.id || id(intent.customer) !== id(session.customer)) throw new ServiceError("Service authorization was not confirmed.", 409);
      await serviceRpc("ids_service_payment_apply", { p_payment: record.id, p_event: event.id, p_status: "succeeded", p_live: intent.livemode, p_customer: id(intent.customer), p_intent: intent.id, p_session: session.id, p_amount: 0, p_currency: "usd", p_method: id(intent.payment_method) });
    } else if (session.mode === "payment" && id(session.payment_intent)) await applyServiceIntent(await stripe().paymentIntents.retrieve(id(session.payment_intent)!), event.id);
    else if (session.status === "expired") await serviceRpc("ids_service_payment_apply", { p_payment: record.id, p_event: event.id, p_status: "expired", p_live: session.livemode, p_customer: id(session.customer), p_intent: record.stripe_intent_id, p_session: session.id, p_amount: record.amount_cents, p_currency: "usd", p_method: null });
    return true;
  }
  if (event.type.startsWith("payment_intent.")) {
    const intent = event.data.object as Stripe.PaymentIntent;
    if (metadata.service_kind === "support_initial") {
      if (intent.status === "succeeded") {
        const sessions = await stripe().checkout.sessions.list({ payment_intent: intent.id, limit: 2 });
        const session = sessions.data.find(s => s.metadata?.service_reference === metadata?.service_reference);
        if (!session) throw new ServiceError("Paid subscription checkout is not linked yet.", 409);
        await fulfillSupportSession(session, event.id, event.created);
      }
    } else await applyServiceIntent(await stripe().paymentIntents.retrieve(intent.id), event.id);
    return true;
  }
  return true;
}
