import test from "node:test";
import assert from "node:assert/strict";

import {
  assertSaleImportApplyPolicy,
  saleImportAppliedValues,
  saleImportBeforeValues,
  SaleImportApplyPolicyError,
  saleImportPricingUpdate,
  type SaleImportApplyProposal,
} from "../lib/admin-pricing/sale-import-apply-policy";
import type { SaleImportCandidate } from "../lib/admin-pricing/sale-import-parser";

const start = "2026-09-22T05:00:00.000Z";
const end = "2026-09-27T05:00:00.000Z";

const proposal: SaleImportApplyProposal = {
  displayMsrpCents: 100_000,
  discountCents: 10_000,
  saleCents: 90_000,
  dealerCostCents: 70_000,
  startsAt: start,
  endsAt: end,
  promotionLabel: "Y40 Flash Sale",
  saleMessage: null,
  saleMessageIsPublic: false,
};

function candidate(
  kind: SaleImportCandidate["kind"],
  slug: string,
  y40PriceMode: SaleImportCandidate["y40PriceMode"] = null,
) {
  return {
    kind,
    slug,
    productSlug: "yarbo",
    y40PriceMode,
  };
}

function validate(overrides: Partial<Parameters<typeof assertSaleImportApplyPolicy>[0]> = {}) {
  assertSaleImportApplyPolicy({
    manufacturerBrand: "Yarbo",
    pricingScope: "y40",
    importPromotionLabel: "Y40 Flash Sale",
    candidate: candidate("product", "yarbo"),
    validationErrors: [],
    proposal,
    ...overrides,
  });
}

test("apply policy allows authoritative Y40 product and package sources", () => {
  assert.doesNotThrow(() => validate());
  assert.doesNotThrow(() => validate({
    candidate: candidate("package", "yarbo-lawn-mower-pro", "package"),
  }));
});

test("apply policy blocks legacy unscoped Yarbo, Y40 variants, changed inheritance, and Y40P package fallthrough", () => {
  assert.throws(
    () => validate({ pricingScope: "generic" }),
    /no verified Y40 or Y40P scope/,
  );
  assert.throws(
    () => validate({ candidate: candidate("variant", "yarbo-y40") }),
    /authoritative Y40 pricing source/,
  );
  assert.throws(
    () => validate({ candidate: candidate("package", "yarbo-lawn-mower-pro", "core_specific") }),
    /no longer inherits pricing/,
  );
  assert.throws(
    () => validate({ pricingScope: "y40p", candidate: candidate("package", "yarbo-lawn-mower-pro", "package") }),
    /core-specific target/,
  );
  assert.doesNotThrow(() => validate({
    pricingScope: "y40p",
    candidate: candidate("variant", "yarbo-y40p"),
  }));
});

test("apply policy revalidates approval evidence, money, reconciliation, dates, and label", () => {
  const cases: Array<[Partial<Parameters<typeof assertSaleImportApplyPolicy>[0]>, RegExp]> = [
    [{ validationErrors: ["source problem"] }, /unresolved source validation/],
    [{ proposal: { ...proposal, saleCents: 90_000.5 } }, /invalid price value/],
    [{ proposal: { ...proposal, saleCents: 80_000 } }, /discount reconciliation/],
    [{ proposal: { ...proposal, startsAt: null } }, /both a start date and an exclusive end date/],
    [{ proposal: { ...proposal, endsAt: start } }, /invalid promotion period/],
    [{ proposal: { ...proposal, promotionLabel: "Different" } }, /no longer matches/],
    [{ proposal: { ...proposal, promotionLabel: " Y40 Flash Sale " }, importPromotionLabel: null }, /invalid promotion label/],
    [{ proposal: { ...proposal, saleCents: null, endsAt: null } }, /Promotional dealer cost requires/],
  ];

  for (const [overrides, message] of cases) {
    assert.throws(
      () => validate(overrides),
      (error: unknown) => error instanceof SaleImportApplyPolicyError && message.test(error.message),
    );
  }
});

test("apply plan updates only manufacturer MSRP and temporary promotion fields", () => {
  const update = saleImportPricingUpdate(proposal, "2026-09-18T20:00:00.000Z");
  assert.deepEqual(update, {
    display_msrp_price_cents: 100_000,
    sale_price_cents: 90_000,
    sale_starts_at: start,
    sale_ends_at: end,
    promotion_label: "Y40 Flash Sale",
    updated_at: "2026-09-18T20:00:00.000Z",
  });
  assert.equal("regular_price_cents" in update, false);
  assert.equal("public_status" in update, false);
  assert.equal("preorder_enabled" in update, false);
});

test("before and applied audit values are complete, stable, and keep private cost scoped to one source row", () => {
  const existingCost = {
    id: "old-cost",
    dealer_cost_cents: 71_000,
    starts_at: start,
    ends_at: end,
    source_import_row_id: "row-1",
  };
  const before = saleImportBeforeValues({
    currentPricing: {
      display_msrp_price_cents: 110_000,
      regular_price_cents: 95_000,
      sale_price_cents: null,
      sale_starts_at: null,
      sale_ends_at: null,
      promotion_label: null,
    },
    currentMessage: { message: "Existing", is_public: false },
    existingPromotionalCost: existingCost,
  });
  assert.equal(before.regular_price_cents, 95_000);
  assert.deepEqual(before.promotional_dealer_cost, existingCost);

  const first = saleImportAppliedValues({
    target: { kind: "package", id: "package-1" },
    importId: "import-1",
    rowId: "row-1",
    proposal,
  });
  const retry = saleImportAppliedValues({
    target: { kind: "package", id: "package-1" },
    importId: "import-1",
    rowId: "row-1",
    proposal,
  });
  assert.deepEqual(retry, first);
  assert.equal(first.discount_cents, 10_000);
  assert.equal(first.promotion_label, "Y40 Flash Sale");
  assert.equal(first.promotional_dealer_cost?.source_import_row_id, "row-1");
  assert.equal(first.sale_message_is_public, false);
});
