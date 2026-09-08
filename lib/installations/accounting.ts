import type { PricingSnapshot } from "./policy";

export type InstallationPayment = {
  id: string;
  purpose: string;
  method: string;
  status: string;
  amount_cents: number;
  refunded_cents: number;
  paid_at: string | null;
  original_payment_id?: string | null;
};
export type InstallationAdjustment = { id: string; amount_cents: number };
export type InstallationCashCorrection = { id: string; original_payment_id: string; amount_cents: number };
export type InstallationCashRefund = { id: string; original_payment_id: string; amount_cents: number };
export type InstallationBalance = ReturnType<typeof installationBalance>;

export function cents(value: unknown, name = "amount", signed = false): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || (!signed && value < 0)) {
    throw new Error(`invalid_${name}_cents`);
  }
  return value;
}
function sum(values: number[]) {
  return values.reduce((total, value) => cents(total + value, "total", true), 0);
}

// Processor/legacy refunds use original.refunded_cents. New cash returns have
// append-only evidence, so original cash receipts remain intact. Refund-purpose
// payment rows are processor mirrors and never subtract a second time.
export function installationBalance(
  pricing: Pick<PricingSnapshot, "laborCents" | "materialsAllowanceCents">,
  adjustments: InstallationAdjustment[],
  payments: InstallationPayment[],
  corrections: InstallationCashCorrection[] = [],
  cashRefunds: InstallationCashRefund[] = [],
) {
  if (!pricing || !Array.isArray(adjustments) || !Array.isArray(payments) || !Array.isArray(corrections) || !Array.isArray(cashRefunds)) throw new Error("incomplete_installation_ledger");
  const adjustmentCents = sum(adjustments.map(a => cents(a.amount_cents, "adjustment", true)));
  const approvedChargesCents = sum([cents(pricing.laborCents, "labor"), cents(pricing.materialsAllowanceCents, "materials"), adjustmentCents]);
  if (approvedChargesCents < 0) throw new Error("negative_approved_charges");
  const ids = new Set<string>();
  const originals = new Map<string, InstallationPayment>();
  let receivedCents = 0, completedRefundsCents = 0, pendingRefundsCents = 0;
  for (const p of payments) {
    if (!p.id || ids.has(p.id)) throw new Error("duplicate_or_missing_payment_id");
    ids.add(p.id);
    cents(p.amount_cents, "payment"); cents(p.refunded_cents, "refund");
    if (p.refunded_cents > p.amount_cents) throw new Error("refund_exceeds_payment");
    if (!["pending", "paid", "failed", "cancelled", "refunded", "partially_refunded"].includes(p.status)) throw new Error("invalid_payment_status");
    if (p.purpose === "refund") continue;
    if (!["deposit", "balance", "additional", "cash"].includes(p.purpose)) throw new Error("invalid_payment_purpose");
    if (!["stripe", "cash"].includes(p.method)) throw new Error("unsupported_payment_method");
    originals.set(p.id, p);
    if (["paid", "partially_refunded", "refunded"].includes(p.status)) {
      if (!p.paid_at || !Number.isFinite(Date.parse(p.paid_at))) throw new Error("unconfirmed_payment_receipt");
      if (p.status === "refunded" && p.refunded_cents !== p.amount_cents) throw new Error("inconsistent_refunded_payment");
      receivedCents = sum([receivedCents, p.amount_cents]);
      completedRefundsCents = sum([completedRefundsCents, p.refunded_cents]);
    } else if (p.refunded_cents !== 0) throw new Error("refund_without_received_payment");
  }
  const mirroredRefunds = new Map<string, number>();
  for (const p of payments.filter(p => p.purpose === "refund")) {
    const original = p.original_payment_id ? originals.get(p.original_payment_id) : undefined;
    if (!original || !["paid", "partially_refunded", "refunded"].includes(original.status)) throw new Error("unlinked_refund_record");
    if (p.status === "pending") pendingRefundsCents = sum([pendingRefundsCents, p.amount_cents]);
    else if (["paid", "refunded"].includes(p.status)) {
      const mirrored = sum([mirroredRefunds.get(original.id) ?? 0, p.amount_cents]);
      if (mirrored > original.refunded_cents) throw new Error("refund_record_not_reconciled");
      mirroredRefunds.set(original.id, mirrored);
    } else if (p.status === "partially_refunded") throw new Error("invalid_refund_record_status");
  }
  const cashReturned = new Map<string, number>();
  const refundIds = new Set<string>();
  for (const refund of cashRefunds) {
    if (!refund.id || refundIds.has(refund.id)) throw new Error("duplicate_or_missing_cash_refund_id");
    refundIds.add(refund.id);
    const original = originals.get(refund.original_payment_id);
    if (!original || original.method !== "cash" || !["paid", "partially_refunded", "refunded"].includes(original.status)) throw new Error("invalid_cash_refund_original");
    const amount = cents(refund.amount_cents, "cash_refund");
    if (amount <= 0) throw new Error("invalid_cash_refund_cents");
    const total = sum([cashReturned.get(original.id) ?? 0, amount]);
    if (total > original.amount_cents - original.refunded_cents) throw new Error("cash_refund_exceeds_eligible_amount");
    cashReturned.set(original.id, total);
  }
  completedRefundsCents = sum([completedRefundsCents, ...cashReturned.values()]);
  const corrected = new Map<string, number>();
  const correctionIds = new Set<string>();
  for (const correction of corrections) {
    if (!correction.id || correctionIds.has(correction.id)) throw new Error("duplicate_or_missing_correction_id");
    correctionIds.add(correction.id);
    const original = originals.get(correction.original_payment_id);
    if (!original || original.method !== "cash" || !["paid", "partially_refunded", "refunded"].includes(original.status)) throw new Error("invalid_correction_original");
    const amount = cents(correction.amount_cents, "correction");
    if (amount <= 0) throw new Error("invalid_correction_cents");
    const total = sum([corrected.get(original.id) ?? 0, amount]);
    if (total > original.amount_cents - original.refunded_cents - (cashReturned.get(original.id) ?? 0)) throw new Error("cash_correction_exceeds_eligible_amount");
    corrected.set(original.id, total);
  }
  const receiptCorrectionsCents = sum([...corrected.values()]);
  const netPaidCents = sum([receivedCents, -completedRefundsCents, -receiptCorrectionsCents]);
  const balanceCents = sum([approvedChargesCents, -netPaidCents]);
  return {
    approvedChargesCents, adjustmentCents, receivedCents, completedRefundsCents, pendingRefundsCents, receiptCorrectionsCents, netPaidCents,
    balanceCents, balanceDueCents: Math.max(0, balanceCents), customerCreditCents: Math.max(0, -balanceCents),
    paymentState: balanceCents < 0 ? "customer_credit" : balanceCents === 0 ? "paid" : netPaidCents > 0 ? "partially_paid" : "unpaid",
  };
}

export function financialPaymentStatus(balance: InstallationBalance) {
  return balance.balanceDueCents === 0 ? "paid" : balance.netPaidCents > 0 ? "partially_paid" : "unpaid";
}

// Exact accounting inputs checked again under the draft cash RPC's parent lock.
// Dates reduce to confirmation evidence; timestamps remain on receipt/history rows.
export function ledgerSnapshot(pricing: Pick<PricingSnapshot, "laborCents" | "materialsAllowanceCents">,
  adjustments: InstallationAdjustment[], payments: InstallationPayment[], corrections: InstallationCashCorrection[] = [], cashRefunds: InstallationCashRefund[] = []) {
  installationBalance(pricing, adjustments, payments, corrections, cashRefunds);
  return {
    pricing: { laborCents: pricing.laborCents, materialsAllowanceCents: pricing.materialsAllowanceCents },
    adjustments: adjustments.map(a => ({ id: a.id, amount_cents: a.amount_cents })).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    payments: payments.map(p => ({ id: p.id, purpose: p.purpose, method: p.method, status: p.status,
      amount_cents: p.amount_cents, refunded_cents: p.refunded_cents, confirmed: p.paid_at !== null,
      original_payment_id: p.original_payment_id ?? null })).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    corrections: corrections.map(c => ({ id: c.id, original_payment_id: c.original_payment_id, amount_cents: c.amount_cents })).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    cashRefunds: cashRefunds.map(r => ({ id: r.id, original_payment_id: r.original_payment_id, amount_cents: r.amount_cents })).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  };
}

export function installationCheckoutAmount(balance: InstallationBalance, purpose: "deposit" | "balance", depositDueCents: number) {
  const remainingDeposit = Math.max(0, cents(depositDueCents, "deposit") - balance.netPaidCents);
  return purpose === "deposit" ? Math.min(remainingDeposit, balance.balanceDueCents) : balance.balanceDueCents;
}
