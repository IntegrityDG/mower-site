import { DEFAULT_PRICING } from "../../lib/installations/policy";
import type { InstallationPayment } from "../../lib/installations/accounting";

export const installationId = "11111111-1111-4111-8111-111111111111";
export const operationKey = "22222222-2222-4222-8222-222222222222";
export const receivedAt = "2026-09-01T17:30:00.000Z";
export function payment(amount = 25000, extra: Partial<InstallationPayment> = {}): InstallationPayment {
  return { id: "33333333-3333-4333-8333-333333333333", purpose: "deposit", method: "stripe", status: "paid", amount_cents: amount, refunded_cents: 0, paid_at: receivedAt, ...extra };
}
export function installation(extra = {}) {
  return { id: installationId, public_token: installationId, status: "scheduled", safety_status: "clear", payment_status: "deposit_paid",
    requested_start_at: "2026-10-01T14:00:00.000Z", requested_end_at: "2026-10-01T18:00:00.000Z", approved_at: "2026-09-01T12:00:00.000Z", balance_due_at: "2026-09-28T14:00:00.000Z", approved_travel_charge_cents: 0,
    cash_status: "approved", special_cash_failure_reschedule: false, reschedule_opportunity_used: false,
    pricing_snapshot: { ...DEFAULT_PRICING }, deposit_due_cents: 25000, ...extra };
}
export function receipt(amountDollars = "750.00", extra = {}) {
  return { operationKey, amountDollars, receivedAt, reference: "SYNTHETIC-001", notes: "Synthetic receipt only", confirmOverpayment: false, ...extra };
}
