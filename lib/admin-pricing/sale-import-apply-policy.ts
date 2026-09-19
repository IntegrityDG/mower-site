import type {
  SaleImportCandidate,
  SaleImportPricingScope,
} from "./sale-import-parser";

export type SaleImportApplyKind = SaleImportCandidate["kind"];

export type SaleImportApplyProposal = {
  displayMsrpCents: number | null;
  saleCents: number | null;
  discountCents: number | null;
  dealerCostCents: number | null;
  startsAt: string | null;
  endsAt: string | null;
  promotionLabel: string | null;
  saleMessage: string | null;
  saleMessageIsPublic: boolean;
};

export class SaleImportApplyPolicyError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "SaleImportApplyPolicyError";
    this.status = status;
  }
}

function validMoney(value: number | null) {
  return value === null || (
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 2_147_483_647
  );
}

export function assertSaleImportApplyPolicy(input: {
  manufacturerBrand: string;
  pricingScope: SaleImportPricingScope;
  importPromotionLabel: string | null;
  candidate: Pick<
    SaleImportCandidate,
    "kind" | "slug" | "productSlug" | "y40PriceMode"
  >;
  validationErrors: unknown;
  proposal: SaleImportApplyProposal;
}) {
  const {
    manufacturerBrand,
    pricingScope,
    importPromotionLabel,
    candidate,
    validationErrors,
    proposal,
  } = input;

  if (manufacturerBrand.toLowerCase() === "yarbo") {
    if (pricingScope === "generic") {
      throw new SaleImportApplyPolicyError(
        409,
        "This legacy Yarbo import has no verified Y40 or Y40P scope. Upload it again with the repaired importer.",
      );
    }

    if (pricingScope === "y40") {
      const allowedY40Target =
        candidate.productSlug === "yarbo" &&
        candidate.kind !== "variant" &&
        (candidate.kind !== "product" || candidate.slug === "yarbo");

      if (!allowedY40Target) {
        throw new SaleImportApplyPolicyError(
          409,
          "The approved row no longer points to the authoritative Y40 pricing source.",
        );
      }

      if (candidate.kind === "package" && candidate.y40PriceMode !== "package") {
        throw new SaleImportApplyPolicyError(
          409,
          "The Y40 package no longer inherits pricing from its base package, so it was not changed.",
        );
      }
    }

    if (
      pricingScope === "y40p" &&
      !(candidate.kind === "variant" && candidate.slug === "yarbo-y40p")
    ) {
      throw new SaleImportApplyPolicyError(
        409,
        "Y40P package imports require a core-specific target and are not supported by this importer.",
      );
    }
  }

  if (Array.isArray(validationErrors) && validationErrors.length > 0) {
    throw new SaleImportApplyPolicyError(
      409,
      "An approved row has unresolved source validation errors and was not changed.",
    );
  }

  for (const value of [
    proposal.displayMsrpCents,
    proposal.saleCents,
    proposal.discountCents,
    proposal.dealerCostCents,
  ]) {
    if (!validMoney(value)) {
      throw new SaleImportApplyPolicyError(
        400,
        "An approved row contains an invalid price value.",
      );
    }
  }

  if (
    proposal.displayMsrpCents !== null &&
    proposal.discountCents !== null &&
    proposal.saleCents !== null &&
    proposal.displayMsrpCents - proposal.discountCents !== proposal.saleCents
  ) {
    throw new SaleImportApplyPolicyError(
      409,
      "An approved row no longer passes manufacturer discount reconciliation.",
    );
  }

  if (proposal.saleCents !== null && (!proposal.startsAt || !proposal.endsAt)) {
    throw new SaleImportApplyPolicyError(
      400,
      "Temporary sale pricing requires both a start date and an exclusive end date.",
    );
  }

  if (
    (proposal.startsAt && !Number.isFinite(Date.parse(proposal.startsAt))) ||
    (proposal.endsAt && !Number.isFinite(Date.parse(proposal.endsAt))) ||
    (proposal.startsAt && proposal.endsAt && Date.parse(proposal.endsAt) <= Date.parse(proposal.startsAt))
  ) {
    throw new SaleImportApplyPolicyError(
      400,
      "An approved row contains an invalid promotion period.",
    );
  }

  if (importPromotionLabel && proposal.promotionLabel !== importPromotionLabel) {
    throw new SaleImportApplyPolicyError(
      409,
      "The row promotion label no longer matches the reviewed import metadata.",
    );
  }

  if (
    proposal.promotionLabel !== null &&
    (
      proposal.promotionLabel.trim() !== proposal.promotionLabel ||
      proposal.promotionLabel.length === 0 ||
      proposal.promotionLabel.length > 160
    )
  ) {
    throw new SaleImportApplyPolicyError(
      400,
      "An approved row contains an invalid promotion label.",
    );
  }

  if (proposal.dealerCostCents !== null && !proposal.endsAt) {
    throw new SaleImportApplyPolicyError(
      400,
      "Promotional dealer cost requires a promotion end date so normal dealer cost can automatically resume.",
    );
  }
}

export function saleImportPricingUpdate(
  proposal: SaleImportApplyProposal,
  updatedAt: string,
) {
  const update: Record<string, unknown> = {};

  if (proposal.displayMsrpCents !== null) {
    update.display_msrp_price_cents = proposal.displayMsrpCents;
  }
  if (proposal.saleCents !== null) {
    update.sale_price_cents = proposal.saleCents;
  }
  if (proposal.startsAt !== null) {
    update.sale_starts_at = proposal.startsAt;
  }
  if (proposal.endsAt !== null) {
    update.sale_ends_at = proposal.endsAt;
  }
  if (proposal.promotionLabel !== null) {
    update.promotion_label = proposal.promotionLabel;
  }
  if (Object.keys(update).length > 0) {
    update.updated_at = updatedAt;
  }

  return update;
}

export function saleImportBeforeValues(input: {
  currentPricing: Record<string, unknown>;
  currentMessage: Record<string, unknown> | null;
  existingPromotionalCost: Record<string, unknown> | null;
}) {
  return {
    display_msrp_price_cents: input.currentPricing.display_msrp_price_cents ?? null,
    regular_price_cents: input.currentPricing.regular_price_cents ?? null,
    sale_price_cents: input.currentPricing.sale_price_cents ?? null,
    sale_starts_at: input.currentPricing.sale_starts_at ?? null,
    sale_ends_at: input.currentPricing.sale_ends_at ?? null,
    promotion_label: input.currentPricing.promotion_label ?? null,
    sale_message: input.currentMessage?.message ?? null,
    sale_message_is_public: input.currentMessage?.is_public === true,
    promotional_dealer_cost: input.existingPromotionalCost,
  };
}

export function saleImportAppliedValues(input: {
  target: { kind: SaleImportApplyKind; id: string };
  importId: string;
  rowId: string;
  proposal: SaleImportApplyProposal;
}) {
  const { target, importId, rowId, proposal } = input;
  return {
    target_kind: target.kind,
    target_id: target.id,
    display_msrp_price_cents: proposal.displayMsrpCents,
    sale_price_cents: proposal.saleCents,
    discount_cents: proposal.discountCents,
    sale_starts_at: proposal.startsAt,
    sale_ends_at: proposal.endsAt,
    promotion_label: proposal.promotionLabel,
    promotional_dealer_cost: proposal.dealerCostCents === null
      ? null
      : {
          dealer_cost_cents: proposal.dealerCostCents,
          starts_at: proposal.startsAt,
          ends_at: proposal.endsAt,
          source_import_id: importId,
          source_import_row_id: rowId,
        },
    sale_message: proposal.saleMessage,
    sale_message_is_public: proposal.saleMessageIsPublic,
  };
}
