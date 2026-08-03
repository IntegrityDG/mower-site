import assert from "node:assert/strict";
import test from "node:test";

import {
  applyTrackedCatalogOverrides,
  loadLymowPricingOverrides,
  type CatalogRows,
} from "../scripts/import-catalog";

const lymowPricingOverrides = loadLymowPricingOverrides();
const staleWorkbookSalePrices = new Map([
  ["lymow-one-plus-5a", 269900],
  ["lymow-one-plus-10a", 284900],
]);

function staleVariantRows(): CatalogRows {
  return new Map([
    [
      "Product Variants",
      lymowPricingOverrides.productVariants.map((override) => ({
        product_slug: "lymow-one-plus",
        variant_slug: override.variant_slug,
        regular_price_cents: override.regular_price_cents,
        sale_price_cents: staleWorkbookSalePrices.get(override.variant_slug),
        sale_starts_at: "2026-01-01T00:00:00.000Z",
        sale_ends_at: "2026-02-01T00:00:00.000Z",
        promotion_label: "Old workbook promotion",
      })),
    ],
  ]);
}

test("tracked Lymow pricing overrides replace stale workbook variant pricing", () => {
  const catalogRows = staleVariantRows();
  const warnings: string[] = [];
  const logger = { warn: (message?: unknown) => warnings.push(String(message)) } satisfies Pick<Console, "warn">;

  applyTrackedCatalogOverrides(catalogRows, lymowPricingOverrides, logger);

  const rowsBySlug = new Map(
    (catalogRows.get("Product Variants") ?? []).map((row) => [String(row.variant_slug), row]),
  );

  for (const override of lymowPricingOverrides.productVariants) {
    const row = rowsBySlug.get(override.variant_slug);
    assert.ok(row, `${override.variant_slug} row should exist`);
    assert.equal(row.regular_price_cents, override.regular_price_cents);
    assert.equal(row.sale_price_cents, override.sale_price_cents);
    assert.notEqual(row.sale_price_cents, staleWorkbookSalePrices.get(override.variant_slug));
    assert.equal(row.sale_starts_at, null);
    assert.equal(row.sale_ends_at, null);
    assert.equal(row.promotion_label, override.promotion_label);
    assert.ok(
      warnings.some((message) =>
        message.includes(override.variant_slug) &&
        message.includes(String(override.sale_price_cents)) &&
        message.includes(override.promotion_label),
      ),
      `${override.variant_slug} override should be logged`,
    );
  }

  assert.equal(warnings.length, lymowPricingOverrides.productVariants.length);
});

test("tracked Lymow pricing overrides fail clearly when an expected variant is missing", () => {
  const catalogRows = staleVariantRows();
  catalogRows.set(
    "Product Variants",
    (catalogRows.get("Product Variants") ?? []).filter(
      (row) => row.variant_slug !== "lymow-one-plus-10a",
    ),
  );

  assert.throws(
    () => applyTrackedCatalogOverrides(catalogRows, lymowPricingOverrides, { warn: () => undefined }),
    /Tracked Lymow pricing override expected Product Variants row lymow-one-plus-10a, but it is missing\./,
  );
});
