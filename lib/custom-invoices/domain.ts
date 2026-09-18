import type { InvoiceAddress, InvoiceDraftInput, InvoiceLineInput, InvoiceStatus, InvoiceTotals } from "./types";

export const MAX_INVOICE_CENTS = 100_000_000_000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export class InvoiceValidationError extends Error {
  constructor(message: string) { super(message); this.name = "InvoiceValidationError"; }
}

export function isUuid(value: unknown): value is string { return typeof value === "string" && UUID.test(value); }
export function isDateOnly(value: string) {
  const match = DATE_ONLY.exec(value);
  if (!match) return false;
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}
export function text(value: unknown, max: number, label: string, required = false) {
  if (typeof value !== "string") throw new InvoiceValidationError(`${label} must be text.`);
  const normalized = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  if (required && !normalized) throw new InvoiceValidationError(`${label} is required.`);
  if (normalized.length > max) throw new InvoiceValidationError(`${label} is too long.`);
  return normalized;
}

export function centsFromDecimal(value: string) {
  const normalized = value.trim();
  if (!/^(0|[1-9]\d{0,9})(\.\d{0,2})?$/.test(normalized)) throw new InvoiceValidationError("Enter a valid non-negative dollar amount with at most two decimals.");
  const [whole, fraction = ""] = normalized.split(".");
  const cents = Number(BigInt(whole) * BigInt(100) + BigInt((fraction + "00").slice(0, 2)));
  if (!Number.isSafeInteger(cents) || cents > MAX_INVOICE_CENTS) throw new InvoiceValidationError("Amount exceeds the supported invoice limit.");
  return cents;
}

export function formatUsd(cents: number) {
  assertCents(cents, "Amount");
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function assertCents(value: unknown, label: string, allowZero = true): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < (allowZero ? 0 : 1) || (value as number) > MAX_INVOICE_CENTS) throw new InvoiceValidationError(`${label} is invalid.`);
}

function address(value: unknown, label: string): InvoiceAddress {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InvoiceValidationError(`${label} is required.`);
  const row = value as Record<string, unknown>;
  const state = text(row.state ?? "", 2, `${label} state`).toUpperCase();
  const postalCode = text(row.postalCode ?? "", 10, `${label} ZIP`);
  if (state && !/^[A-Z]{2}$/.test(state)) throw new InvoiceValidationError(`${label} state must be a two-letter code.`);
  if (postalCode && !/^\d{5}(?:-\d{4})?$/.test(postalCode)) throw new InvoiceValidationError(`${label} ZIP is invalid.`);
  return { line1: text(row.line1 ?? "", 160, `${label} address`), line2: text(row.line2 ?? "", 160, `${label} address line 2`) || undefined, city: text(row.city ?? "", 100, `${label} city`), state, postalCode };
}

function line(value: unknown, index: number): InvoiceLineInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InvoiceValidationError(`Line ${index + 1} is invalid.`);
  const row = value as Record<string, unknown>;
  const lineType = row.lineType;
  const sourceType = row.sourceType;
  if (!["item","fee","discount","credit"].includes(String(lineType))) throw new InvoiceValidationError(`Line ${index + 1} type is invalid.`);
  if (!["custom","product","variant","package","option","service"].includes(String(sourceType))) throw new InvoiceValidationError(`Line ${index + 1} source is invalid.`);
  if (sourceType !== "custom" && lineType !== "item") throw new InvoiceValidationError(`Line ${index + 1} catalog entries must be item lines.`);
  if (!Number.isSafeInteger(row.quantity) || Number(row.quantity) < 1 || Number(row.quantity) > 10_000) throw new InvoiceValidationError(`Line ${index + 1} quantity is invalid.`);
  assertCents(row.unitPriceCents, `Line ${index + 1} unit price`);
  const amount = Number(row.quantity) * Number(row.unitPriceCents);
  if (!Number.isSafeInteger(amount) || amount > MAX_INVOICE_CENTS) throw new InvoiceValidationError(`Line ${index + 1} total is too large.`);
  const catalogId = sourceType === "custom" || row.catalogId == null ? null : String(row.catalogId);
  if (sourceType !== "custom" && !isUuid(catalogId)) throw new InvoiceValidationError(`Line ${index + 1} catalog reference is invalid.`);
  const reference = sourceType === "custom" || row.catalogReferencePriceCents == null ? null : Number(row.catalogReferencePriceCents);
  if (reference != null) assertCents(reference, `Line ${index + 1} catalog reference price`);
  return {
    id: isUuid(row.id) ? row.id : undefined,
    lineType: lineType as InvoiceLineInput["lineType"], sourceType: sourceType as InvoiceLineInput["sourceType"], catalogId,
    catalogParentId: sourceType !== "custom" && isUuid(row.catalogParentId) ? row.catalogParentId : null,
    description: text(row.description, 500, `Line ${index + 1} description`, true),
    secondaryDescription: text(row.secondaryDescription ?? "", 1000, `Line ${index + 1} secondary description`) || null,
    sku: text(row.sku ?? "", 120, `Line ${index + 1} SKU`) || null,
    quantity: Number(row.quantity), unitPriceCents: Number(row.unitPriceCents), catalogReferencePriceCents: reference,
    catalogStatus: sourceType === "custom" ? null : text(row.catalogStatus ?? "", 80, `Line ${index + 1} catalog status`) || null,
    catalogPurchaseState: sourceType === "custom" ? null : text(row.catalogPurchaseState ?? "", 80, `Line ${index + 1} purchase state`) || null,
    availabilityWarning: sourceType !== "custom" && row.availabilityWarning === true,
    sortOrder: Number.isSafeInteger(row.sortOrder) && Number(row.sortOrder) >= 0 && Number(row.sortOrder) <= 10_000 ? Number(row.sortOrder) : index,
  };
}

export function normalizeDraft(value: unknown): InvoiceDraftInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InvoiceValidationError("Invoice data is invalid.");
  const row = value as Record<string, unknown>;
  const email = text(row.customerEmail ?? "", 320, "Customer email").toLowerCase();
  if (email && !EMAIL.test(email)) throw new InvoiceValidationError("Customer email is invalid.");
  const phone = text(row.customerPhone ?? "", 40, "Customer phone");
  if (phone && phone.replace(/\D/g, "").length < 7) throw new InvoiceValidationError("Customer phone is invalid.");
  const items = Array.isArray(row.items) ? row.items.map(line) : [];
  if (items.length > 200) throw new InvoiceValidationError("Invoice has too many lines.");
  assertCents(row.taxCents, "Sales tax");
  const paymentTerms = row.paymentTerms === "deposit" ? "deposit" : "full";
  const depositAmountCents = row.depositAmountCents == null ? null : Number(row.depositAmountCents);
  if (depositAmountCents != null) assertCents(depositAmountCents, "Deposit", false);
  const dueDate = row.dueDate == null || row.dueDate === "" ? null : text(row.dueDate, 10, "Due date", true);
  if (dueDate && !isDateOnly(dueDate)) throw new InvoiceValidationError("Due date is invalid.");
  return {
    customerName: text(row.customerName ?? "", 160, "Customer name"), companyName: text(row.companyName ?? "", 160, "Company name") || null,
    customerEmail: email, customerPhone: phone, billingAddress: address(row.billingAddress, "Billing address"), shippingAddress: address(row.shippingAddress, "Shipping address"),
    customerNotes: text(row.customerNotes ?? "", 5000, "Customer notes"), internalNotes: text(row.internalNotes ?? "", 5000, "Internal notes"), fulfillmentNotes: text(row.fulfillmentNotes ?? "", 3000, "Fulfillment notes"),
    dueDate, paymentTerms, depositAmountCents: paymentTerms === "deposit" ? depositAmountCents : null,
    availabilityAcknowledged: row.availabilityAcknowledged === true, taxCents: Number(row.taxCents), items,
  };
}

export function calculateTotals(items: InvoiceLineInput[], taxCents: number): InvoiceTotals {
  assertCents(taxCents, "Sales tax");
  const totals = { item: 0, fee: 0, discount: 0, credit: 0 };
  for (const item of items) {
    const amount = item.quantity * item.unitPriceCents;
    if (!Number.isSafeInteger(amount) || amount > MAX_INVOICE_CENTS) throw new InvoiceValidationError("Line total exceeds the supported invoice limit.");
    totals[item.lineType] += amount;
    if (!Number.isSafeInteger(totals[item.lineType]) || totals[item.lineType] > MAX_INVOICE_CENTS) throw new InvoiceValidationError("Invoice total exceeds the supported limit.");
  }
  const totalCents = totals.item + totals.fee + taxCents - totals.discount - totals.credit;
  if (!Number.isSafeInteger(totalCents) || totalCents < 0 || totalCents > MAX_INVOICE_CENTS) throw new InvoiceValidationError("Invoice total must be between $0.00 and the supported limit.");
  return { subtotalCents: totals.item, feeCents: totals.fee, discountCents: totals.discount, creditCents: totals.credit, taxCents, totalCents };
}

export function validateFinalization(draft: InvoiceDraftInput) {
  if (!draft.customerName || !draft.customerEmail || !EMAIL.test(draft.customerEmail) || draft.customerPhone.replace(/\D/g, "").length < 7) throw new InvoiceValidationError("Complete valid customer information is required.");
  for (const [label, addressValue] of [["Billing", draft.billingAddress], ["Shipping", draft.shippingAddress]] as const) {
    if (!addressValue.line1 || !addressValue.city || !/^[A-Z]{2}$/.test(addressValue.state) || !/^\d{5}(?:-\d{4})?$/.test(addressValue.postalCode)) throw new InvoiceValidationError(`${label} address is incomplete.`);
  }
  if (!draft.items.length) throw new InvoiceValidationError("At least one line item is required.");
  if (!draft.dueDate || !isDateOnly(draft.dueDate)) throw new InvoiceValidationError("A valid due date is required.");
  if (draft.items.some((item) => item.availabilityWarning) && !draft.availabilityAcknowledged) throw new InvoiceValidationError("Acknowledge preorder, coming-soon, or unavailable items before finalizing.");
  const totals = calculateTotals(draft.items, draft.taxCents);
  if (totals.totalCents <= 0) throw new InvoiceValidationError("Finalized invoice total must be greater than $0.00.");
  if (draft.paymentTerms === "deposit" && (!draft.depositAmountCents || draft.depositAmountCents >= totals.totalCents)) throw new InvoiceValidationError("Deposit must be greater than $0.00 and less than the invoice total.");
  return totals;
}

export function displayStatus(status: InvoiceStatus, dueDate: string | null, balanceCents: number, now = new Date()) {
  if (status !== "void" && status !== "paid" && balanceCents > 0 && dueDate && dueDate < now.toISOString().slice(0, 10)) return "overdue";
  return status;
}
