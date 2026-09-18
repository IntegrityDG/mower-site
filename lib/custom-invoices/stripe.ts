import "server-only";
import type Stripe from "stripe";
import { readPaymentMethodSettings } from "@/lib/payment-method-settings/server";
import { getStripeMode } from "@/lib/stripe/config";
import { getStripeServerClient } from "@/lib/stripe/server";
import { applyStripeRefund, cancelPaymentRequests, readInvoice, readPaymentRequestByStripeInvoiceId, reservePaymentRequest, linkPaymentRequest } from "./repository";
import { allowedCustomInvoiceMethods, selectCustomInvoiceMethods, type OnlinePaymentMethod } from "./payment-policy";

export type CustomInvoiceStripe = Pick<Stripe, "customers" | "invoices" | "invoiceItems" | "invoicePayments">;

function stripeAddress(value: unknown): Stripe.AddressParam | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  return { line1: String(row.line1 ?? ""), line2: row.line2 ? String(row.line2) : undefined, city: String(row.city ?? ""), state: String(row.state ?? ""), postal_code: String(row.postalCode ?? ""), country: "US" };
}

export async function createHostedPaymentRequest(input: { invoiceId: string; kind: string; requestedMethods: unknown; operationKey: string }, stripe: CustomInvoiceStripe = getStripeServerClient()) {
  const detail = await readInvoice(input.invoiceId);
  if (!detail) throw new Error("Invoice not found.");
  const settings = await readPaymentMethodSettings();
  const allowed = allowedCustomInvoiceMethods(settings);
  const requestedMethods = selectCustomInvoiceMethods(input.requestedMethods, allowed);
  const active = detail.paymentRequests.find((request) => request.status === "creating" || request.status === "open");
  const reserved = active ?? await reservePaymentRequest(input.invoiceId, input.kind, requestedMethods, input.operationKey);
  const reservedMethods = selectCustomInvoiceMethods(reserved.allowed_payment_methods, allowed);
  const providerOperationKey = String(reserved.operation_key);
  const requestKind = String(reserved.request_kind);
  if (reserved.stripe_invoice_id && reserved.hosted_invoice_url) return { detail, request: reserved };

  const invoice = detail.invoice as Record<string, unknown>;
  const invoiceNumber = String(invoice.invoice_number);
  const metadata = { custom_invoice_id: input.invoiceId, payment_request_id: String(reserved.id), invoice_number: invoiceNumber };
  let customerId = typeof invoice.stripe_customer_id === "string" ? invoice.stripe_customer_id : "";
  if (!customerId) {
    const customer = await stripe.customers.create({ name: String(invoice.customer_name), email: String(invoice.customer_email), phone: String(invoice.customer_phone), address: stripeAddress(invoice.billing_address), metadata: { custom_invoice_id: input.invoiceId } }, { idempotencyKey: `${providerOperationKey}:customer` });
    customerId = customer.id;
  }
  const dueDate = Math.floor(Date.parse(`${String(invoice.due_date)}T23:59:59Z`) / 1000);
  if (!Number.isSafeInteger(dueDate) || dueDate <= Math.floor(Date.now() / 1000)) throw new Error("Due date must be in the future before sending an online payment request.");
  const requestLabel = requestKind === "deposit" ? "Deposit" : requestKind === "balance" ? "Remaining balance" : "Payment";
  const stripeInvoice = await stripe.invoices.create({ customer: customerId, collection_method: "send_invoice", auto_advance: false, due_date: dueDate, metadata, payment_settings: { payment_method_types: reservedMethods }, description: `${requestLabel} for IDS Invoice ${invoiceNumber}`, custom_fields: [{ name: "IDS Invoice", value: invoiceNumber }], footer: "Integrity Distribution Systems | IntegrityDistributionSystems@gmail.com" }, { idempotencyKey: `${providerOperationKey}:invoice` });
  await stripe.invoiceItems.create({ customer: customerId, invoice: stripeInvoice.id, currency: "usd", amount: Number(reserved.amount_cents), description: `${requestKind === "full" ? "Payment in full" : requestLabel} for IDS Invoice ${invoiceNumber}`, metadata }, { idempotencyKey: `${providerOperationKey}:item` });
  const finalized = await stripe.invoices.finalizeInvoice(stripeInvoice.id, { auto_advance: false }, { idempotencyKey: `${providerOperationKey}:finalize` });
  if (!finalized.hosted_invoice_url) throw new Error("Stripe did not return a hosted invoice URL.");
  try {
    await linkPaymentRequest(String(reserved.id), finalized.id, finalized.hosted_invoice_url, customerId);
  } catch (error) {
    try {
      await stripe.invoices.voidInvoice(finalized.id, {}, { idempotencyKey: `${providerOperationKey}:cleanup` });
      await cancelPaymentRequests(input.invoiceId, `cleanup:${String(reserved.id)}`);
    } catch { /* Keep the reservation if provider cleanup could not be confirmed. */ }
    throw error;
  }
  const refreshed = await readInvoice(input.invoiceId);
  if (!refreshed) throw new Error("Invoice could not be reloaded.");
  const request = refreshed.paymentRequests.find((row) => row.id === reserved.id);
  if (!request) throw new Error("Payment request could not be reloaded.");
  return { detail: refreshed, request };
}

export async function cancelHostedPaymentRequests(invoiceId: string, operationKey: string, stripe: CustomInvoiceStripe = getStripeServerClient()) {
  const detail = await readInvoice(invoiceId);
  if (!detail) throw new Error("Invoice not found.");
  for (const request of detail.paymentRequests) if (request.status === "open" && request.stripe_invoice_id) await stripe.invoices.voidInvoice(String(request.stripe_invoice_id), {}, { idempotencyKey: `custom-invoice-void:${invoiceId}:${request.id}` });
  await cancelPaymentRequests(invoiceId, operationKey);
}

function paymentIntentId(value: unknown) {
  const id = typeof value === "string" ? value : value && typeof value === "object" && "id" in value ? String((value as { id: unknown }).id) : "";
  return /^pi_[A-Za-z0-9_]+$/.test(id) ? id : null;
}

function paidAmount(value: unknown) {
  return value && typeof value === "object" && "amount_paid" in value ? Number((value as { amount_paid: unknown }).amount_paid) : null;
}

async function paidInvoicePaymentIntent(invoice: Stripe.Invoice, stripe: CustomInvoiceStripe, expectedAmount: number) {
  const legacy = paymentIntentId((invoice as unknown as { payment_intent?: unknown }).payment_intent);
  const embedded = invoice.payments?.data.find((payment) => payment.status === "paid" && paidAmount(payment) === expectedAmount);
  const embeddedIntent = paymentIntentId(embedded?.payment.payment_intent);
  if (embeddedIntent) return embeddedIntent;
  const payments = await stripe.invoicePayments.list({ invoice: invoice.id, status: "paid", limit: 10 });
  const listedIntent = paymentIntentId(payments.data.find((payment) => payment.status === "paid" && paidAmount(payment) === expectedAmount)?.payment.payment_intent);
  return listedIntent ?? legacy;
}

export async function handleCustomInvoiceStripeWebhook(event: Stripe.Event, expectedLivemode = getStripeMode() === "live", stripe: CustomInvoiceStripe = getStripeServerClient()) {
  if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    const intent = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id ?? null;
    const resolvedIntent = paymentIntentId(intent);
    if (!resolvedIntent) return false;
    return (await applyStripeRefund({ eventId:event.id,paymentIntentId:resolvedIntent,chargeAmount:charge.amount,cumulativeRefunded:charge.amount_refunded,currency:charge.currency,livemode:charge.livemode,expectedLivemode })) !== "not_custom_invoice";
  }
  if (!["invoice.paid", "invoice.payment_failed", "invoice.voided"].includes(event.type)) return false;
  const invoice = event.data.object as Stripe.Invoice;
  const request = await readPaymentRequestByStripeInvoiceId(invoice.id);
  if (!request) return false;
  if (invoice.metadata?.custom_invoice_id !== request.invoice_id || invoice.metadata?.payment_request_id !== request.id) throw new Error("Custom invoice Stripe metadata mismatch.");
  const resolvedPaymentIntentId = event.type === "invoice.paid" ? await paidInvoicePaymentIntent(invoice, stripe, Number(request.amount_cents)) : null;
  if (event.type === "invoice.paid" && !resolvedPaymentIntentId) throw new Error("Custom invoice payment evidence is incomplete.");
  await import("./repository").then(({ applyStripeInvoiceEvent }) => applyStripeInvoiceEvent({ eventId: event.id, eventType: event.type, stripeInvoiceId: invoice.id, paymentIntentId: resolvedPaymentIntentId, amountPaid: invoice.amount_paid, currency: invoice.currency, livemode: invoice.livemode, expectedLivemode }));
  return true;
}

export function providerPaymentMethods(methods: OnlinePaymentMethod[]) { return methods; }
