export const REFERRAL_STATUSES = ["pending", "qualified", "paid", "disqualified"] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];
export type ReferralTier = "base" | "higher";

export type AdminReferral = {
  id: string;
  referrerName: string;
  referrerEmail: string;
  orderIdentifier: string;
  brand: "Lymow" | "Yarbo" | "Pandag";
  productName: string;
  purchaseDate: string;
  eligibleDate: string;
  status: ReferralStatus;
  baseRewardCents: number;
  higherTierRewardCents: number;
  finalRewardCents: number | null;
  tierApplied: ReferralTier | null;
  qualifiedAt: string | null;
  paidAt: string | null;
  disqualifiedAt: string | null;
  disqualificationReason: string | null;
  orderStatus: string;
  paymentStatus: string;
  isDemoParty: boolean;
};

export function isReadyForReview(referral: Pick<AdminReferral, "status" | "eligibleDate">, now = new Date()) {
  return referral.status === "pending" && new Date(referral.eligibleDate).getTime() <= now.getTime();
}

export function displayReferralStatus(referral: AdminReferral, now = new Date()) {
  return isReadyForReview(referral, now) ? "ready" as const : referral.status;
}

export function rewardForQualification(base: number, higher: number, earlierQualifiedOrPaid: number) {
  return earlierQualifiedOrPaid >= 5
    ? { finalRewardCents: higher, tierApplied: "higher" as const }
    : { finalRewardCents: base, tierApplied: "base" as const };
}

export const QUALIFICATION_CONFIRMATIONS = ["returnPeriodPassed", "orderCompleted", "everydayLowPrice"] as const;

export function hasQualificationConfirmations(value: unknown): value is Record<(typeof QUALIFICATION_CONFIRMATIONS)[number], true> {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return QUALIFICATION_CONFIRMATIONS.every((key) => record[key] === true);
}
