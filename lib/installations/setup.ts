import { DEFAULT_PRICING, initialAmount, travelQuote, type PricingSnapshot } from "./policy";

export const SETUP = { laborCents: 50000, includedMinutes: 240, hourlyCents: 12500, incrementMinutes: 15 } as const;
export type ServiceComponent = "installation" | "setup";
export type ServiceSelection = { installation_selected?: boolean; setup_selected?: boolean };
export const hasInstallation = (job: ServiceSelection) => job.installation_selected !== false;
export const hasSetup = (job: ServiceSelection) => job.setup_selected === true;
export const setupPrice = (pricing: PricingSnapshot) => pricing.setupLaborCents ?? SETUP.laborCents;
export const setupOvertime = (minutes: number) => {
  if (!Number.isFinite(minutes) || minutes < 0) throw new Error("invalid_setup_duration");
  return Math.ceil(Math.max(0, minutes - SETUP.includedMinutes) / SETUP.incrementMinutes) * 3125;
};
// Round the final eligible labor/travel amount once, to the nearest cent.
export const supportDiscount = (grossCents: number, eligible: boolean) => {
  if (!Number.isSafeInteger(grossCents) || grossCents < 0) throw new Error("invalid_discount_basis");
  return eligible ? grossCents - Math.round(grossCents * 0.75) : 0;
};
export function jobPricing(job: ServiceSelection, pricing: PricingSnapshot): PricingSnapshot {
  return hasInstallation(job) ? pricing : { ...pricing, laborCents: 0, materialsAllowanceCents: 0 };
}
export function serviceInitialAmount(job: ServiceSelection, pricing: PricingSnapshot, eligible = false) {
  const setup = hasSetup(job) ? setupPrice(pricing) : 0;
  return initialAmount(jobPricing(job, pricing)) + setup - supportDiscount(setup, eligible === true);
}
export function serviceTravelQuote(job: ServiceSelection, minutes: number, pricing: PricingSnapshot, override?: number, eligible = false) {
  const combined = hasInstallation(job) && hasSetup(job);
  const q = travelQuote(minutes, pricing);
  const totalBillableHours = combined ? Math.ceil(Math.max(0, minutes - 120) / 60) : q.totalBillableHours;
  const calculatedChargeCents = combined ? totalBillableHours * 3500 : q.calculatedChargeCents;
  const grossChargeCents = override ?? calculatedChargeCents;
  const discountCents = supportDiscount(grossChargeCents, eligible === true);
  return { ...q, billableHoursPerDirection: combined ? 0 : q.billableHoursPerDirection, totalBillableHours,
    calculatedChargeCents, grossChargeCents, discountCents, approvedChargeCents: grossChargeCents - discountCents,
    manuallyOverridden: override !== undefined && override !== calculatedChargeCents,
    policy: combined ? "combined_visit" : "round_trip" };
}
export const serviceName = (job: ServiceSelection) => !hasInstallation(job) ? "Professional Setup & Optimization" : hasSetup(job) ? "Professional Installation + Setup" : "Professional Installation";
export const SETUP_DESCRIPTION = "Add up to four hours of professional mapping, no-go zone and pathway configuration, track lubrication, blade conversion, mowing-plan and schedule optimization, testing, and final system tuning.";
export const setupDefaultPricing = (pricing: PricingSnapshot = DEFAULT_PRICING) => jobPricing({ installation_selected: false }, pricing);
