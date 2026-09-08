import "server-only";
import { isReviewAdmin } from "@/lib/reviews/admin-auth";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { financialPaymentStatus, installationBalance, type InstallationBalance } from "./accounting";
import { validateCashReceipt, validateCashCorrection, validateCashRefund } from "./cash-validation";
import { requireInstallationCashRecording } from "./controls";
import { readInstallationLedger } from "./ledger";

export const CASH_RECORDING_ACTOR = "IDS shared administrator";
export type CashEntryKind = "receipt" | "correction" | "refund";
export type CashReceiptResult = {
  paymentId: string; correctionId?: string; refundId?: string; recordedAt: string; replayed: boolean;
  balanceAtRecording: InstallationBalance;
  currentBalance: InstallationBalance | null; currentBalanceUnavailable: boolean;
};
type Database = ReturnType<typeof getSupabaseServiceClient>;

function normalized(id: string, body: Record<string, unknown>, kind: CashEntryKind) {
  if (kind === "receipt") {
    const r = validateCashReceipt(body);
    return { installationId: id.toLowerCase(), operationKey: r.operationKey, amountCents: r.amountCents,
      receivedAt: r.receivedAt, reference: r.reference, notes: r.notes,
      confirmOverpayment: r.confirmOverpayment, actor: CASH_RECORDING_ACTOR };
  }
  if (kind === "refund") {
    const r = validateCashRefund(body);
    return { installationId: id.toLowerCase(), ...r, actor: CASH_RECORDING_ACTOR };
  }
  const r = validateCashCorrection(body);
  return { installationId: id.toLowerCase(), operationKey: r.operationKey, originalPaymentId: r.originalPaymentId,
    amountCents: r.amountCents, reason: r.reason, actor: CASH_RECORDING_ACTOR };
}
async function confirmed(db: Database, id: string, payload: ReturnType<typeof normalized>, kind: CashEntryKind) {
  const { data, error } = await db.rpc("ids_confirm_installation_cash", {
    p_installation_id: id, p_operation_key: payload.operationKey, p_kind: kind, p_payload: payload,
  });
  if (error) throw error;
  return data;
}
async function resultWithCurrent(db: Database, id: string, data: unknown): Promise<CashReceiptResult> {
  const result = data as CashReceiptResult | null;
  if (!result || typeof result.paymentId !== "string" || !Number.isFinite(Date.parse(result.recordedAt)) ||
      typeof result.replayed !== "boolean" || !result.balanceAtRecording || !Number.isSafeInteger(result.balanceAtRecording.balanceCents)) {
    throw new Error("cash_recording_response_incomplete");
  }
  // Confirmation is independent of today's accounting. Never replace a confirmed
  // operation with an error encouraging a fresh key if the current ledger fails.
  let currentBalance: InstallationBalance | null = null;
  try { currentBalance = (await readInstallationLedger(id, db)).balance; } catch { /* separate unavailable state */ }
  return { ...result, currentBalance, currentBalanceUnavailable: currentBalance === null };
}

// Authenticated read-only confirmation remains available when cash writes are off.
export async function confirmInstallationCash(id: string, body: Record<string, unknown>, kind: CashEntryKind = "receipt") {
  if (!(await isReviewAdmin())) throw new Error("Unauthorized");
  const payload = normalized(id, body, kind);
  const db = getSupabaseServiceClient();
  const existing = await confirmed(db, id, payload, kind);
  return existing ? resultWithCurrent(db, id, existing) : null;
}

export async function recordInstallationCash(id: string, body: Record<string, unknown>): Promise<CashReceiptResult> {
  if (!(await isReviewAdmin())) throw new Error("Unauthorized");
  requireInstallationCashRecording();
  const receipt = validateCashReceipt(body);
  const db = getSupabaseServiceClient();
  const existing = await confirmed(db, id, normalized(id, body, "receipt"), "receipt");
  if (existing) return resultWithCurrent(db, id, existing);
  const ledger = await readInstallationLedger(id, db);
  const balanceAfter = installationBalance(ledger.pricing, ledger.adjustments, [...ledger.payments, {
    id: `new-cash:${receipt.operationKey}`, purpose: "cash", method: "cash", status: "paid",
    amount_cents: receipt.amountCents, refunded_cents: 0, paid_at: receipt.receivedAt,
  }], ledger.corrections, ledger.cashRefunds);
  const { data, error } = await db.rpc("ids_record_installation_cash", {
    p_installation_id: id, p_operation_key: receipt.operationKey,
    p_amount_cents: receipt.amountCents, p_received_at: receipt.receivedAt,
    p_reference: receipt.reference, p_notes: receipt.notes,
    p_confirm_overpayment: receipt.confirmOverpayment, p_actor: CASH_RECORDING_ACTOR,
    p_expected_ledger: ledger.snapshot, p_balance_before: ledger.balance,
    p_balance_after: balanceAfter, p_payment_status: financialPaymentStatus(balanceAfter),
  });
  if (error) throw error;
  return resultWithCurrent(db, id, data);
}

export async function correctInstallationCash(id: string, body: Record<string, unknown>): Promise<CashReceiptResult> {
  if (!(await isReviewAdmin())) throw new Error("Unauthorized");
  requireInstallationCashRecording();
  const correction = validateCashCorrection(body);
  const db = getSupabaseServiceClient();
  const existing = await confirmed(db, id, normalized(id, body, "correction"), "correction");
  if (existing) return resultWithCurrent(db, id, existing);
  const ledger = await readInstallationLedger(id, db);
  const balanceAfter = installationBalance(ledger.pricing, ledger.adjustments, ledger.payments, [...ledger.corrections, {
    id: `new-correction:${correction.operationKey}`, original_payment_id: correction.originalPaymentId, amount_cents: correction.amountCents,
  }], ledger.cashRefunds);
  const { data, error } = await db.rpc("ids_correct_installation_cash", {
    p_installation_id: id, p_operation_key: correction.operationKey, p_original_payment_id: correction.originalPaymentId,
    p_amount_cents: correction.amountCents, p_reason: correction.reason, p_actor: CASH_RECORDING_ACTOR,
    p_expected_ledger: ledger.snapshot, p_balance_before: ledger.balance,
    p_balance_after: balanceAfter, p_payment_status: financialPaymentStatus(balanceAfter),
  });
  if (error) throw error;
  return resultWithCurrent(db, id, data);
}

export async function refundInstallationCash(id: string, body: Record<string, unknown>): Promise<CashReceiptResult> {
  if (!(await isReviewAdmin())) throw new Error("Unauthorized");
  requireInstallationCashRecording();
  const refund = validateCashRefund(body), db = getSupabaseServiceClient();
  const existing = await confirmed(db, id, normalized(id, body, "refund"), "refund");
  if (existing) return resultWithCurrent(db, id, existing);
  const ledger = await readInstallationLedger(id, db);
  const balanceAfter = installationBalance(ledger.pricing, ledger.adjustments, ledger.payments, ledger.corrections, [...ledger.cashRefunds, {
    id: `new-refund:${refund.operationKey}`, original_payment_id: refund.originalPaymentId, amount_cents: refund.amountCents,
  }]);
  const { data, error } = await db.rpc("ids_record_installation_cash_refund", {
    p_installation_id: id, p_operation_key: refund.operationKey, p_original_payment_id: refund.originalPaymentId,
    p_amount_cents: refund.amountCents, p_returned_at: refund.returnedAt, p_reference: refund.reference,
    p_reason: refund.reason, p_confirm_money_returned: true, p_actor: CASH_RECORDING_ACTOR,
    p_expected_ledger: ledger.snapshot, p_balance_before: ledger.balance,
    p_balance_after: balanceAfter, p_payment_status: financialPaymentStatus(balanceAfter),
  });
  if (error) throw error;
  return resultWithCurrent(db, id, data);
}
