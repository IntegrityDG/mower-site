import { cents, type InstallationBalance } from "./accounting";

// A booking keeps the version accepted at intake; never infer it from today's date.
export const INSTALLATION_TERMS_VERSION = "2026-11-15-cancellation-review";
export const LEGACY_INSTALLATION_TERMS_VERSIONS = ["2026-09-04", "2026-09-08-setup"] as const;
export const INSTALLATION_CANCELLATION_COPY = "If you cancel before installation begins, IDS will review your cancellation on a case-by-case basis. Materials already purchased for your job using your payment are non-refundable. You may arrange to pick up those materials or choose to forfeit them. A cancellation fee of up to $250 may also be deducted from the amount you’ve paid after the purchased-materials deduction. The rest of your payment will be refunded. No cancellation fee applies if IDS cancels. This policy does not limit any right to a full refund under applicable law.";
export const LEGACY_INSTALLATION_CANCELLATION_COPY = "Cancellation deposit refund: more than 48 hours, 100%; 24–48 hours, 50%; less than 24 hours, non-refundable. Materials are reconciled separately.";
export function usesReviewedCancellation(termsVersion: unknown) {
  return termsVersion === INSTALLATION_TERMS_VERSION;
}
export function usesLegacyCancellation(termsVersion: unknown) {
  return LEGACY_INSTALLATION_TERMS_VERSIONS.some(version => version === termsVersion);
}
export function cancellationCopy(termsVersion: unknown) {
  if (usesReviewedCancellation(termsVersion)) return INSTALLATION_CANCELLATION_COPY;
  if (usesLegacyCancellation(termsVersion)) return LEGACY_INSTALLATION_CANCELLATION_COPY;
  return "IDS must verify the cancellation terms accepted for this booking before determining its settlement.";
}

export type CancellationReview = {
  cause: "customer" | "ids" | "full_refund_required";
  feeCents: number;
  purchasedMaterialsCents: number;
  materialsChoice: "awaiting_choice" | "pickup" | "forfeit" | "not_applicable";
  settlementFinal: boolean;
};

// Staff records the decision under the existing administrator authority. This
// calculation neither determines legal rights nor charges or refunds money.
export function reviewedCancellation(balance: InstallationBalance, body: Record<string, unknown>): CancellationReview {
  if (body.cancellationReviewed !== true) throw new Error("cancellation_review_required");
  const cause = body.cancellationCause;
  if (cause !== "customer" && cause !== "ids" && cause !== "full_refund_required") throw new Error("cancellation_cause_required");
  if (balance.pendingRefundsCents > 0) throw new Error("resolve_pending_refunds_before_cancellation");
  const requestedFee = cents(body.cancellationFeeCents ?? 0, "cancellation_fee");
  const purchasedMaterials = cents(body.purchasedMaterialsCents ?? 0, "purchased_materials");
  if (requestedFee > 25000) throw new Error("cancellation_fee_exceeds_250");
  if (typeof body.materialsPurchaseEvidence !== "undefined" && (typeof body.materialsPurchaseEvidence !== "string" || body.materialsPurchaseEvidence.length > 2000)) throw new Error("invalid_materials_purchase_evidence");
  if (cause !== "customer" && (requestedFee !== 0 || purchasedMaterials !== 0)) throw new Error("no_customer_deductions_for_this_cancellation");
  if (purchasedMaterials > balance.netPaidCents) throw new Error("purchased_materials_exceed_collected_payment");
  if (purchasedMaterials > 0 && !(typeof body.materialsPurchaseEvidence === "string" && body.materialsPurchaseEvidence.trim())) throw new Error("verified_materials_purchase_required");
  return {
    cause, feeCents: Math.min(requestedFee, Math.max(0, balance.netPaidCents - purchasedMaterials)), purchasedMaterialsCents: purchasedMaterials,
    materialsChoice: purchasedMaterials > 0 ? "awaiting_choice" : "not_applicable",
    settlementFinal: cause !== "ids",
  };
}
