import "server-only";
import { getSupabaseServiceClient } from "@/lib/supabase";
import type { InvoiceDraftInput } from "./types";

const fail = (error: { message: string } | null, fallback: string) => { if (error) throw new Error(fallback); };

export async function listInvoices(search = "", status = "all", page = 1) {
  const cleanSearch = search.trim().slice(0, 160).replace(/[%_]/g, "");
  const { data, error } = await getSupabaseServiceClient().rpc("custom_invoice_list", { p_search: cleanSearch, p_status: status, p_offset: Math.max(0, page - 1) * 50, p_limit: 50 });
  fail(error, "Invoices could not be loaded.");
  const result = (data ?? { invoices: [], count: 0 }) as { invoices: Record<string, unknown>[]; count: number };
  return { ...result, page };
}

export async function readInvoice(id: string) {
  const { data, error } = await getSupabaseServiceClient().rpc("custom_invoice_read", { p_invoice_id: id });
  fail(error, "Invoice could not be loaded.");
  return data as { invoice: Record<string, unknown>; items: Record<string, unknown>[]; paymentRequests: Record<string, unknown>[]; payments: Record<string, unknown>[]; refunds: Record<string, unknown>[]; events: Record<string, unknown>[] } | null;
}

export async function saveDraft(id: string | null, expectedVersion: number, draft: InvoiceDraftInput, operationKey: string) {
  const { items, ...invoice } = draft;
  const { data, error } = await getSupabaseServiceClient().rpc("custom_invoice_save_draft", { p_invoice_id: id, p_expected_version: expectedVersion, p_invoice: invoice, p_items: items, p_operation_key: operationKey });
  fail(error, error?.message.includes("Stale") ? "This draft changed in another session. Reload before saving." : "Draft could not be saved.");
  return data as Record<string, unknown>;
}

export async function deleteDraft(id: string, expectedVersion: number, operationKey: string) {
  const { error } = await getSupabaseServiceClient().rpc("custom_invoice_delete_draft", { p_invoice_id: id, p_expected_version: expectedVersion, p_operation_key: operationKey });
  fail(error, "Draft could not be deleted.");
}

export async function finalizeInvoice(id: string, expectedVersion: number, operationKey: string) {
  const { data, error } = await getSupabaseServiceClient().rpc("custom_invoice_finalize", { p_invoice_id: id, p_expected_version: expectedVersion, p_operation_key: operationKey });
  fail(error, error?.message.includes("Stale") ? "This draft changed in another session. Reload before finalizing." : error?.message ?? "Invoice could not be finalized.");
  return data as Record<string, unknown>;
}

export async function voidInvoice(id: string, reason: string, operationKey: string) {
  const { data, error } = await getSupabaseServiceClient().rpc("custom_invoice_void", { p_invoice_id: id, p_reason: reason, p_operation_key: operationKey });
  fail(error, error?.message ?? "Invoice could not be voided.");
  return data;
}

export async function duplicateInvoice(id: string, operationKey: string) {
  const { data, error } = await getSupabaseServiceClient().rpc("custom_invoice_duplicate", { p_invoice_id: id, p_operation_key: operationKey });
  fail(error, "Invoice could not be duplicated.");
  return String(data);
}

export async function recordManualPayment(input: { invoiceId: string; amountCents: number; method: string; reference: string; note: string; receivedAt: string; operationKey: string }) {
  const { data, error } = await getSupabaseServiceClient().rpc("custom_invoice_record_manual_payment", { p_invoice_id: input.invoiceId, p_amount_cents: input.amountCents, p_method: input.method, p_reference: input.reference, p_note: input.note, p_received_at: input.receivedAt, p_operation_key: input.operationKey });
  fail(error, error?.message ?? "Payment could not be recorded.");
  return data;
}

export async function cancelPaymentRequests(invoiceId: string, operationKey: string) {
  const { error } = await getSupabaseServiceClient().rpc("custom_invoice_cancel_payment_requests", { p_invoice_id: invoiceId, p_operation_key: operationKey });
  fail(error, error?.message ?? "Online payment requests could not be canceled.");
}

export async function reservePaymentRequest(invoiceId: string, kind: string, methods: string[], operationKey: string) {
  const { data, error } = await getSupabaseServiceClient().rpc("custom_invoice_reserve_payment_request", { p_invoice_id: invoiceId, p_kind: kind, p_methods: methods, p_operation_key: operationKey });
  fail(error, error?.message ?? "Payment request could not be reserved.");
  return data as Record<string, unknown>;
}

export async function linkPaymentRequest(requestId: string, stripeInvoiceId: string, hostedUrl: string, stripeCustomerId: string) {
  const { error } = await getSupabaseServiceClient().rpc("custom_invoice_link_payment_request", { p_request_id: requestId, p_stripe_invoice_id: stripeInvoiceId, p_hosted_url: hostedUrl, p_stripe_customer_id: stripeCustomerId });
  fail(error, "Payment request could not be linked.");
}

export async function failInvoiceDelivery(requestId: string, operationKey: string) {
  const { error } = await getSupabaseServiceClient().rpc("custom_invoice_fail_delivery", { p_request_id: requestId, p_operation_key: operationKey });
  fail(error, "Invoice delivery state could not be updated.");
}

export async function claimInvoiceDelivery(requestId: string, operationKey: string) {
  const { data, error } = await getSupabaseServiceClient().rpc("custom_invoice_claim_delivery", { p_request_id: requestId, p_operation_key: operationKey });
  fail(error, error?.message ?? "Invoice delivery could not start.");
  return data as Record<string, unknown>;
}

export async function finishInvoiceDelivery(requestId: string, operationKey: string, providerId: string) {
  const { error } = await getSupabaseServiceClient().rpc("custom_invoice_finish_delivery", { p_request_id: requestId, p_operation_key: operationKey, p_provider_id: providerId });
  fail(error, "Invoice delivery could not be finalized.");
}

export async function readPaymentRequestByStripeInvoiceId(stripeInvoiceId: string) {
  const { data, error } = await getSupabaseServiceClient().rpc("custom_invoice_request_by_stripe_id", { p_stripe_invoice_id: stripeInvoiceId });
  fail(error, "Payment request lookup failed.");
  return data;
}

export async function applyStripeInvoiceEvent(input: { eventId: string; eventType: string; stripeInvoiceId: string; paymentIntentId: string | null; amountPaid: number; currency: string; livemode: boolean; expectedLivemode: boolean }) {
  const { data, error } = await getSupabaseServiceClient().rpc("custom_invoice_apply_stripe_event", { p_event_id: input.eventId, p_event_type: input.eventType, p_stripe_invoice_id: input.stripeInvoiceId, p_payment_intent_id: input.paymentIntentId, p_amount_paid: input.amountPaid, p_currency: input.currency, p_livemode: input.livemode, p_expected_livemode: input.expectedLivemode });
  fail(error, "Custom invoice reconciliation failed.");
  return String(data);
}

export async function applyStripeRefund(input: { eventId: string; paymentIntentId: string; chargeAmount: number; cumulativeRefunded: number; currency: string; livemode: boolean; expectedLivemode: boolean }) {
  const { data, error } = await getSupabaseServiceClient().rpc("custom_invoice_apply_stripe_refund", { p_event_id: input.eventId, p_payment_intent_id: input.paymentIntentId, p_charge_amount: input.chargeAmount, p_cumulative_refunded: input.cumulativeRefunded, p_currency: input.currency, p_livemode: input.livemode, p_expected_livemode: input.expectedLivemode });
  fail(error, "Custom invoice refund reconciliation failed.");
  return String(data);
}
