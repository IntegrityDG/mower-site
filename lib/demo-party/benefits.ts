import type { DemoPartyBenefits } from "./types";

export const DEMO_FEE_CENTS = 10_000;
export const MAX_DEMO_PARTY_GUESTS = 5;
export const MAX_QUALIFYING_GUESTS = MAX_DEMO_PARTY_GUESTS;
export const GUEST_BENEFIT_INCREMENT_CENTS = 2_000;
export const MAX_FOOD_AND_DRINKS_CENTS = 15_000;
export const REFERRAL_PURCHASE_WINDOW_DAYS = 14;
export const REFERRAL_RETURN_PERIOD_DAYS = 30;

export function calculateDemoPartyBenefits(verifiedQualifyingGuests: number): DemoPartyBenefits {
  const qualifyingGuests = Math.min(MAX_QUALIFYING_GUESTS, Math.max(0, Math.trunc(verifiedQualifyingGuests)));
  const feeRefundCents = qualifyingGuests * GUEST_BENEFIT_INCREMENT_CENTS;
  const baseMachineDiscountCents = qualifyingGuests * GUEST_BENEFIT_INCREMENT_CENTS;
  return {
    qualifyingGuests,
    feeRefundCents,
    baseMachineDiscountCents,
    maximumMachineDiscountCents: baseMachineDiscountCents,
  };
}

export function guestMeetsContinuousHourRule(checkedInAt: string | null, checkedOutAt: string | null) {
  if (!checkedInAt || !checkedOutAt) return false;
  const start = Date.parse(checkedInAt);
  const end = Date.parse(checkedOutAt);
  return Number.isFinite(start) && Number.isFinite(end) && end - start >= 60 * 60_000;
}

export function referralPurchaseIsWithinWindow(demoStartsAt: string, purchasePaidAt: string) {
  const demo = Date.parse(demoStartsAt);
  const purchase = Date.parse(purchasePaidAt);
  return Number.isFinite(demo) && Number.isFinite(purchase) && purchase >= demo && purchase <= demo + REFERRAL_PURCHASE_WINDOW_DAYS * 86_400_000;
}

export function chooseMachinePricingRoute(input: {
  regularMsrpCents: number;
  promotionalOrIdsPriceCents: number;
  baseMachineDiscountCents: number;
}) {
  const earnedDiscount = input.baseMachineDiscountCents;
  const demoPartyPriceCents = Math.max(0, input.regularMsrpCents - Math.min(input.regularMsrpCents, earnedDiscount));
  if (input.promotionalOrIdsPriceCents <= demoPartyPriceCents) {
    return { route: "existing_price" as const, priceCents: input.promotionalOrIdsPriceCents, consumedBaseCents: 0 };
  }
  const applicableDiscount = input.regularMsrpCents - demoPartyPriceCents;
  const consumedBaseCents = Math.min(input.baseMachineDiscountCents, applicableDiscount);
  return {
    route: "demo_party_msrp" as const,
    priceCents: demoPartyPriceCents,
    consumedBaseCents,
  };
}

export function reserveBenefit(input: { earnedCents: number; consumedCents: number; requestedCents: number }) {
  for (const value of [input.earnedCents, input.consumedCents, input.requestedCents]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid benefit amount.");
  }
  const availableCents = Math.max(0, input.earnedCents - input.consumedCents);
  if (input.requestedCents > availableCents) throw new Error("Benefit balance is unavailable.");
  return { consumedCents: input.consumedCents + input.requestedCents, availableCents: availableCents - input.requestedCents };
}
