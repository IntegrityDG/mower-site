import type { InvoiceTotals, ServicePricing, Subscription, TripCategory, WorkSheet } from "./types";

export const SUPPORT_MONTHLY_CENTS = 10_000;
export const SUPPORT_SESSIONS_PER_CYCLE = 4;
export const SUPPORT_ACTIVATION_DELAY_DAYS = 10;
export const SUPPORT_FAILURE_GRACE_DAYS = 14;
export const SUPPORT_DISCOUNT_BASIS_POINTS = 2_500;
export const MAX_CASE_IMAGES = 3;
export const MAX_CASE_IMAGE_BYTES = 15 * 1024 * 1024;
export const WARRANTY_REPORT_RECIPIENT = "Service.IDS@proton.me";
export const SERVICE_POLICY_VERSION = "ids-service-v1";
export const SERVICE_TIME_ZONE = "America/Chicago";
export const TRAVEL_ORIGIN = "Central Williamsville, Missouri";
export const DEFAULT_SERVICE_PRICING: Readonly<ServicePricing> = Object.freeze({
  firstHourCents: 8_000, additionalHalfHourCents: 4_000,
  initialTravelHalfHourCents: 1_750, returnTravelHalfHourCents: 500,
  hazardTravelHalfHourCents: 1_750, warrantyHourlyCents: 8_000,
});

export const EMPTY_WORK_SHEET: WorkSheet = {
  diagnosis: "", workPerformed: "", testing: "", resolution: "",
  labor: [], travel: [], supplies: [], holdNotes: "", authorizationNotes: "",
  manufacturerReimbursementCents: 0,
};
const DAY = 86_400_000;
const time = (value: string | number) => {
  const result = typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(result)) throw new Error("Invalid timestamp.");
  return result;
};
export function activationDate(paidAt: string, source: "standalone" | "machine") {
  return new Date(time(paidAt) + (source === "machine" ? SUPPORT_ACTIVATION_DELAY_DAYS * DAY : 0)).toISOString();
}
// Preserve the day where possible, and clamp month ends (Jan 31 -> Feb 28).
export function nextBillingDate(start: string) {
  const date = new Date(time(start));
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 1);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date.toISOString();
}
export function subscriptionEligible(subscription: Pick<Subscription, "status" | "activation_at" | "paid_through" | "failed_at"> | null, now = Date.now()) {
  return Boolean(subscription && ["active", "pending_activation"].includes(subscription.status)
    && !subscription.failed_at && subscription.activation_at && subscription.paid_through
    && time(subscription.activation_at) <= now && now < time(subscription.paid_through));
}
export function failureDeadline(failedAt: string) { return new Date(time(failedAt) + SUPPORT_FAILURE_GRACE_DAYS * DAY).toISOString(); }
export function paymentRecoveryAllowed(failedAt: string, paidAt: string) { return time(paidAt) < time(failureDeadline(failedAt)); }
export function cancellationConsumesSession(appointmentAt: string, cancelledAt: string) { return time(appointmentAt) - time(cancelledAt) < DAY; }

function whole(value: number, label: string, maximum = 10_000_000) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) throw new Error(`Invalid ${label}.`);
  return value;
}
export function laborAmount(minutes: number, pricing: ServicePricing = DEFAULT_SERVICE_PRICING, warranty = false) {
  whole(minutes, "active work minutes", 525_600);
  if (warranty) return Math.round(minutes * pricing.warrantyHourlyCents / 60);
  return minutes === 0 ? 0 : pricing.firstHourCents + Math.ceil(Math.max(0, minutes - 60) / 30) * pricing.additionalHalfHourCents;
}
export function travelAmount(category: TripCategory, outbound: number, returning: number, pricing: ServicePricing = DEFAULT_SERVICE_PRICING) {
  whole(outbound, "mapped outbound minutes", 10_080);
  whole(returning, "mapped return minutes", 10_080);
  if (!["initial", "legitimate_return", "hazard_return"].includes(category)) throw new Error("Invalid trip category.");
  const billableMinutes = category === "initial" ? Math.max(0, outbound - 60) + Math.max(0, returning - 60) : outbound + returning;
  const blocks = Math.ceil(billableMinutes / 30);
  const rateCents = category === "initial" ? pricing.initialTravelHalfHourCents : category === "legitimate_return" ? pricing.returnTravelHalfHourCents : pricing.hazardTravelHalfHourCents;
  return { billableMinutes, blocks, rateCents, amountCents: blocks * rateCents };
}
export function calculateInvoice(sheet: WorkSheet, options: { remote: boolean; warranty: boolean; subscriberEligible: boolean; shopDropoff?: boolean; pricing?: ServicePricing }): InvoiceTotals {
  const pricing = options.pricing ?? DEFAULT_SERVICE_PRICING;
  Object.values(pricing).forEach(value => whole(value, "rate", 1_000_000));
  const activeMinutes = sheet.labor.reduce((sum, entry) => sum + whole(entry.minutes, "active work minutes", 525_600), 0);
  const laborCents = laborAmount(activeMinutes, pricing, options.warranty);
  if (options.remote && sheet.travel.length) throw new Error("Remote Service cannot include travel charges.");
  if (options.shopDropoff && sheet.travel.length) throw new Error("Shop drop-off cannot include technician travel.");
  if (sheet.travel.filter(trip => trip.category === "initial").length > 1) throw new Error("Only the initial trip has included travel.");
  const travelLines = sheet.travel.map(trip => ({ id: trip.id, ...travelAmount(trip.category, trip.outboundMinutes, trip.returnMinutes, pricing) }));
  const travelCents = travelLines.reduce((sum, trip) => sum + trip.amountCents, 0);
  const supplies = { part: 0, material: 0, consumable: 0 };
  for (const line of sheet.supplies) {
    if (!Object.hasOwn(supplies, line.kind) || !Number.isFinite(line.quantity) || line.quantity <= 0 || line.quantity > 10_000 || Math.abs(Math.round(line.quantity * 1000) - line.quantity * 1000) > 1e-7) throw new Error("Invalid supply quantity or category.");
    supplies[line.kind] += Math.round(line.quantity * whole(line.unitCents, "supply unit price"));
  }
  const eligibleSubtotalCents = laborCents + travelCents;
  const discountCents = options.subscriberEligible && !options.warranty ? Math.round(eligibleSubtotalCents * SUPPORT_DISCOUNT_BASIS_POINTS / 10_000) : 0;
  const serviceValueCents = eligibleSubtotalCents + supplies.part + supplies.material + supplies.consumable;
  whole(serviceValueCents, "invoice total", 99_999_999);
  return {
    activeMinutes, additionalLaborBlocks: options.warranty ? 0 : Math.ceil(Math.max(0, activeMinutes - 60) / 30),
    laborCents, travelCents, travelLines, eligibleSubtotalCents, discountCents,
    partsCents: supplies.part, materialsCents: supplies.material, consumablesCents: supplies.consumable,
    serviceValueCents, customerDueCents: options.warranty ? 0 : serviceValueCents - discountCents,
  };
}
export function finalWarrantyReportAllowed(caseStatus: string, warrantyStatus: string, invoiceStatus: string) {
  return caseStatus === "resolved" && warrantyStatus === "verified" && invoiceStatus === "finalized";
}
export const serviceMoney = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
