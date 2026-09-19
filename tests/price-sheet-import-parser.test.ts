import test from "node:test";
import assert from "node:assert/strict";

import * as XLSX from "xlsx";

import {
  assertSaleImportBrandMatches,
  classifySaleImportHeader,
  matchSaleImportRow,
  matchSaleImportRows,
  normalizeSaleImportText,
  parseSaleImportWorkbook,
  SaleImportParseError,
  type SaleImportCandidate,
} from "../lib/admin-pricing/sale-import-parser";
import { activeSalePriceCents, sellingPriceCents } from "../lib/pricing-program/policy";
import { yarboPackagePriceSource } from "../lib/checkout/yarbo-package-price";
import { operationalPriceCents } from "../lib/checkout/operational-price";

const start = "2026-09-22T05:00:00.000Z";
const end = "2026-09-27T05:00:00.000Z";

const sourceNames = [
  "Yarbo Core",
  "Snow Blower Module",
  "Lawn Mower Pro Module",
  "Leaf Blower Module",
  "Trimmer Package\n(Trimmer module + BBM)",
  "Yarbo Snow Blower\n(Core + Snow Blower Module)",
  "Yarbo Lawn Mower Pro\n(Core + Lawn Mower Pro Module)",
  "Yarbo Leaf Blower\n(Core + Leaf Blower Module)",
  "Yarbo Leaf Blower + Trimmer Package\n(Core + Leaf Blower Module + Trimmer Module+BBM)",
  "Yarbo Snow Blower + Trimmer Package\n(Core + Snow Blower Module + Trimmer module + BBM)",
  "Yarbo Lawn Mower Pro + Trimmer Package\n(Core + Lawn Mower Pro Module + Trimmer Module + BBM)",
  "Yarbo Snow Blower + Leaf Blower\n(Core + Snow Blower Module + Leaf Blower Module)",
  "Yarbo Snow Blower + Leaf Blower + Trimmer Package\n(Core + Snow Blower Module + Leaf Blower Module + Trimmer Module + BBM)",
  "Yarbo Lawn Mower Pro + Snow Blower\n(Core + Lawn Mower Pro Module + Snow Blower Module)",
  "Yarbo Lawn Mower Pro + Leaf Blower\n(Core + Lawn Mower Pro Module + Leaf Blower Module)",
  "Yarbo Lawn Mower Pro + Snow Blower + Trimmer Package\n(Core + Lawn Mower Pro Module + Snow Blower Module + + Trimmer Module + BBM )",
  "Yarbo Lawn Mower Pro + Leaf Blower + Trimmer Package\n(Core + Lawn Mower Pro Module + Leaf Blower Module + Trimmer Module + BBM )",
  "Yarbo Lawn Mower Pro + Snow Blower + Leaf Blower\n(Core + Lawn Mower Pro Module + Snow Blower Module + Leaf Blower Module",
  "Yarbo Lawn Mower Pro + Snow Blower + Leaf Blower + Trimmer Package\n(Core + Lawn Mower Pro Module + Snow Blower Module + Leaf Blower Module + Trimmer Module + BBM）",
];

const expectedSlugs = [
  "yarbo",
  "yarbo-snow-blower-module",
  "yarbo-lawn-mower-pro-module",
  "yarbo-leaf-blower-module",
  "yarbo-trimmer-module",
  "yarbo-snow-blower",
  "yarbo-lawn-mower-pro",
  "yarbo-leaf-blower",
  "yarbo-leaf-blower-trimmer",
  "yarbo-snow-blower-trimmer",
  "yarbo-lawn-mower-pro-trimmer",
  "yarbo-snow-leaf",
  "yarbo-snow-leaf-trimmer",
  "yarbo-pro-snow",
  "yarbo-pro-leaf",
  "yarbo-pro-snow-trimmer",
  "yarbo-pro-leaf-trimmer",
  "yarbo-pro-snow-leaf",
  "yarbo-pro-snow-leaf-trimmer",
];

const optionComponents: Record<string, string[]> = {
  "yarbo-snow-blower": ["yarbo-snow-blower-module"],
  "yarbo-lawn-mower-pro": ["yarbo-lawn-mower-pro-module"],
  "yarbo-leaf-blower": ["yarbo-leaf-blower-module"],
  "yarbo-leaf-blower-trimmer": ["yarbo-leaf-blower-module", "yarbo-trimmer-module"],
  "yarbo-snow-blower-trimmer": ["yarbo-snow-blower-module", "yarbo-trimmer-module"],
  "yarbo-lawn-mower-pro-trimmer": ["yarbo-lawn-mower-pro-module", "yarbo-trimmer-module"],
  "yarbo-snow-leaf": ["yarbo-leaf-blower-module", "yarbo-snow-blower-module"],
  "yarbo-snow-leaf-trimmer": ["yarbo-leaf-blower-module", "yarbo-snow-blower-module", "yarbo-trimmer-module"],
  "yarbo-pro-snow": ["yarbo-lawn-mower-pro-module", "yarbo-snow-blower-module"],
  "yarbo-pro-leaf": ["yarbo-lawn-mower-pro-module", "yarbo-leaf-blower-module"],
  "yarbo-pro-snow-trimmer": ["yarbo-lawn-mower-pro-module", "yarbo-snow-blower-module", "yarbo-trimmer-module"],
  "yarbo-pro-leaf-trimmer": ["yarbo-lawn-mower-pro-module", "yarbo-leaf-blower-module", "yarbo-trimmer-module"],
  "yarbo-pro-snow-leaf": ["yarbo-lawn-mower-pro-module", "yarbo-leaf-blower-module", "yarbo-snow-blower-module"],
  "yarbo-pro-snow-leaf-trimmer": ["yarbo-lawn-mower-pro-module", "yarbo-leaf-blower-module", "yarbo-snow-blower-module", "yarbo-trimmer-module"],
};

function candidate(
  kind: SaleImportCandidate["kind"],
  slug: string,
  label: string,
  componentSignature: string[] = [],
): SaleImportCandidate {
  return {
    kind,
    id: `${slug}-id`,
    productId: kind === "product" ? `${slug}-id` : "yarbo-id",
    productSlug: "yarbo",
    brand: "Yarbo",
    label,
    slug,
    sku: null,
    aliases: [],
    componentSignature: [...componentSignature].sort(),
    y40PriceMode: kind === "package" ? "package" : null,
    currentDisplayMsrpCents: 100_000,
    currentSaleCents: null,
    publicStatus: kind === "package" && slug.includes("trimmer") ? "hidden" : "active",
  };
}

const candidates: SaleImportCandidate[] = [
  candidate("product", "yarbo", "Yarbo Core"),
  candidate("variant", "yarbo-y40", "Y40 Core"),
  candidate("variant", "yarbo-y40p", "Y40P Core"),
  candidate("option", "yarbo-snow-blower-module", "Snow Blower Module"),
  candidate("option", "yarbo-lawn-mower-pro-module", "Lawn Mower Pro Module"),
  candidate("option", "yarbo-leaf-blower-module", "Leaf Blower Module"),
  candidate("option", "yarbo-trimmer-module", "Trimmer Package"),
  ...Object.entries(optionComponents).map(([slug, components]) =>
    candidate(
      "package",
      slug,
      slug === "yarbo-pro-snow-leaf"
        ? "Yarbo Lawn Mower Pro + Snow Blower + Blower"
        : slug === "yarbo-pro-snow-leaf-trimmer"
          ? "Yarbo Lawn Mower Pro + Snow Blower + Blower + Trimmer Package"
          : sourceNames[expectedSlugs.indexOf(slug)].split("\n")[0],
      components,
    ),
  ),
];

function workbookBuffer(options: {
  title?: string;
  headers?: unknown[];
  names?: string[];
  mutateRows?: (rows: unknown[][]) => void;
} = {}) {
  const headers = options.headers ?? [
    "Product",
    "Y40 Standard MSRP in US\n(USD)",
    "Discount (USD)",
    "Y40 22 Sept-26 Sept\nY40 Flash Sale MSRP in US(USD)",
    "Dealer Price (USD)\n（Shipping included）",
  ];
  const rows = (options.names ?? sourceNames).map((name, index) => {
    const msrp = 1_000 + index * 10;
    const discount = index % 3 === 0 ? 0 : 100;
    return [name, msrp, discount, msrp - discount, 700 + index * 5];
  });
  options.mutateRows?.(rows);
  const worksheet = XLSX.utils.aoa_to_sheet([
    [options.title ?? "Yarbo US Pricing 2026"],
    headers,
    ...rows,
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Table 1");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

test("semantic headers distinguish MSRP, sale, dealer cost, discount, and product fields", () => {
  assert.equal(classifySaleImportHeader("Product")?.role, "product");
  assert.equal(classifySaleImportHeader("Y40 Standard MSRP in US\n(USD)")?.role, "msrp");
  assert.equal(classifySaleImportHeader("Y40 22 Sept-26 Sept\nY40 Flash Sale MSRP in US(USD)")?.role, "sale");
  assert.equal(classifySaleImportHeader("Dealer Price (USD)\n（Shipping included）")?.role, "dealer_cost");
  assert.equal(classifySaleImportHeader("Discount (USD)")?.role, "discount");
  assert.notEqual(classifySaleImportHeader("Dealer Price")?.role, "sale");
});

test("title row is preserved as evidence while row 2 is detected as the header and data begins at row 3", () => {
  const parsed = parseSaleImportWorkbook(workbookBuffer(), "Yarbo Dealer Price US (Y40 Flash Sale).xlsx");
  assert.equal(parsed.headerRowNumber, 2);
  assert.equal(parsed.rows.length, 19);
  assert.equal(parsed.rows[0].rowNumber, 3);
  assert.equal(parsed.rows.at(-1)?.rowNumber, 21);
  assert.equal(parsed.rows.some((row) => row.itemName?.includes("Yarbo US Pricing")), false);
  assert.equal(parsed.headerMapping.msrp, "Y40 Standard MSRP in US\n(USD)");
  assert.match(parsed.headerMapping.dealer_cost ?? "", /Shipping included/);
});

test("workbook metadata detects Yarbo, Y40, the label, and Chicago exclusive boundaries", () => {
  const parsed = parseSaleImportWorkbook(workbookBuffer(), "Yarbo Dealer Price US (Y40 Flash Sale).xlsx");
  assert.equal(parsed.detectedManufacturerBrand, "Yarbo");
  assert.equal(parsed.pricingScope, "y40");
  assert.equal(parsed.promotionLabel, "Y40 Flash Sale");
  assert.equal(parsed.promotionStartsAt, "2026-09-22T05:00:00.000Z");
  assert.equal(parsed.promotionEndsAt, "2026-09-27T05:00:00.000Z");

  const price = {
    regular_price_cents: 90_000,
    sale_price_cents: 80_000,
    sale_starts_at: parsed.promotionStartsAt,
    sale_ends_at: parsed.promotionEndsAt,
  };
  assert.equal(activeSalePriceCents(price, Date.parse("2026-09-22T04:59:59.999Z")), null);
  assert.equal(activeSalePriceCents(price, Date.parse(parsed.promotionStartsAt!)), 80_000);
  assert.equal(activeSalePriceCents(price, Date.parse("2026-09-27T04:59:59.999Z")), 80_000);
  assert.equal(activeSalePriceCents(price, Date.parse(parsed.promotionEndsAt!)), null);
  assert.equal(sellingPriceCents(price, true, Date.parse(parsed.promotionEndsAt!)), 90_000);
});

test("strong manufacturer mismatch blocks Lymow and Aftermarket without blocking matching Yarbo", () => {
  assert.doesNotThrow(() => assertSaleImportBrandMatches("Yarbo", "Yarbo"));
  assert.throws(
    () => assertSaleImportBrandMatches("Yarbo", "Lymow"),
    (error: unknown) => error instanceof SaleImportParseError && error.code === "MANUFACTURER_MISMATCH",
  );
  assert.throws(() => assertSaleImportBrandMatches("Yarbo", "Aftermarket"), /appears to be a Yarbo price sheet/);
  assert.doesNotThrow(() => assertSaleImportBrandMatches(null, "Lymow"));
});

test("all 19 Yarbo rows match deterministic authoritative targets without fuzzy auto-matching", () => {
  const parsed = parseSaleImportWorkbook(workbookBuffer(), "Yarbo Dealer Price US (Y40 Flash Sale).xlsx");
  const matched = matchSaleImportRows(parsed, candidates);
  assert.equal(matched.length, 19);
  assert.equal(matched.filter((row) => row.matchStatus === "matched").length, 19);
  assert.deepEqual(matched.map((row) => row.candidate?.slug), expectedSlugs);
  assert.equal(matched[0].candidate?.kind, "product");
  assert.equal(matched[0].candidate?.slug, "yarbo");
  assert.equal(matched[4].candidate?.kind, "option");
  assert.equal(matched[4].candidate?.slug, "yarbo-trimmer-module");
  assert.equal(matched[15].matchMethod, "exact_base_name");
  assert.equal(matched[17].matchMethod, "component_signature");
  assert.equal(matched[18].matchMethod, "component_signature");
});

test("Unicode punctuation, duplicate plus signs, missing parentheses, line breaks, and whitespace normalize safely", () => {
  assert.equal(normalizeSaleImportText("  Y40P\r\nCore（Pro）  "), "y40p core pro");
  const parsed = parseSaleImportWorkbook(workbookBuffer(), "Yarbo Dealer Price US (Y40 Flash Sale).xlsx");
  assert.deepEqual(parsed.rows[15].componentSignature, [
    "yarbo-lawn-mower-pro-module",
    "yarbo-snow-blower-module",
    "yarbo-trimmer-module",
  ]);
  assert.deepEqual(parsed.rows[17].componentSignature, [
    "yarbo-lawn-mower-pro-module",
    "yarbo-leaf-blower-module",
    "yarbo-snow-blower-module",
  ]);
});

test("fuzzy similarity produces suggestions only and never an automatic match", () => {
  const parsed = parseSaleImportWorkbook(
    workbookBuffer({ names: ["Yarbo Lawn Mower Pr Snow"] }),
    "Yarbo 2026 Y40 22 Sept-26 Sept Flash Sale.xlsx",
  );
  const matched = matchSaleImportRows(parsed, candidates);
  assert.equal(matched[0].matchStatus, "needs_review");
  assert.equal(matched[0].candidate, null);
  assert.ok(matched[0].suggestions.length > 0);
});

test("discount mismatch and invalid or fractional money remain blocked for review", () => {
  const mismatch = parseSaleImportWorkbook(
    workbookBuffer({ mutateRows: (rows) => { rows[0][2] = 10; rows[0][3] = 500; } }),
    "Yarbo Dealer Price US (Y40 Flash Sale).xlsx",
  );
  const mismatchRow = matchSaleImportRows(mismatch, candidates)[0];
  assert.equal(mismatchRow.matchStatus, "needs_review");
  assert.match(mismatchRow.row.validationErrors.join(" "), /does not equal/);

  const invalid = parseSaleImportWorkbook(
    workbookBuffer({ mutateRows: (rows) => { rows[0][1] = "10.999"; } }),
    "Yarbo Dealer Price US (Y40 Flash Sale).xlsx",
  );
  assert.equal(invalid.rows[0].msrpCents, null);
  assert.match(invalid.rows[0].validationErrors.join(" "), /valid dollar amount/);
  assert.ok(invalid.rows.slice(1).every((row) => Number.isInteger(row.msrpCents)));
});

test("missing, ambiguous, or yearless promotion structure fails safely", () => {
  const noHeaderSheet = XLSX.utils.aoa_to_sheet([["Yarbo Pricing 2026"], ["notes only"]]);
  const noHeaderBook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(noHeaderBook, noHeaderSheet, "Notes");
  assert.throws(
    () => parseSaleImportWorkbook(XLSX.write(noHeaderBook, { type: "buffer", bookType: "xlsx" }), "Yarbo.xlsx"),
    (error: unknown) => error instanceof SaleImportParseError && error.code === "NO_HEADER",
  );

  assert.throws(
    () => parseSaleImportWorkbook(
      workbookBuffer({
        headers: [
          "Product",
          "Y40 Standard MSRP (USD)",
          "Y40 Standard MSRP (USD)",
          "Y40 22 Sept-26 Sept Flash Sale MSRP (USD)",
          "Dealer Price (USD)",
        ],
      }),
      "Yarbo Y40 Flash Sale.xlsx",
    ),
    (error: unknown) => error instanceof SaleImportParseError && error.code === "AMBIGUOUS_HEADER",
  );

  assert.throws(
    () => parseSaleImportWorkbook(
      workbookBuffer({ title: "Yarbo US Pricing", headers: [
        "Product",
        "Y40 Standard MSRP in US (USD)",
        "Discount",
        "Y40 22 Sept-26 Sept Flash Sale MSRP",
        "Dealer Price",
      ] }),
      "Yarbo Y40 Flash Sale.xlsx",
    ),
    (error: unknown) => error instanceof SaleImportParseError && error.code === "MISSING_PROMOTION_YEAR",
  );
});

test("Y40 package matching requires a verified package-inheritance relationship", () => {
  const parsed = parseSaleImportWorkbook(
    workbookBuffer({ names: [sourceNames[8]] }),
    "Yarbo Dealer Price US (Y40 Flash Sale).xlsx",
  );
  const withoutRelationship = candidates.map((item) =>
    item.slug === "yarbo-leaf-blower-trimmer"
      ? { ...item, y40PriceMode: null }
      : item,
  );
  const matched = matchSaleImportRows(parsed, withoutRelationship);
  assert.equal(matched[0].candidate, null);
  assert.equal(matched[0].matchStatus, "needs_review");
});

test("Y40P scope allows the core variant but never maps packages onto Y40 base packages", () => {
  const parsed = parseSaleImportWorkbook(
    workbookBuffer({
      title: "Yarbo Y40P Pricing 2026",
      headers: [
        "Product",
        "Y40P Standard MSRP (USD)",
        "Discount (USD)",
        "Y40P 22 Sept-26 Sept Flash Sale MSRP (USD)",
        "Dealer Price (USD)",
      ],
      names: [
        "Y40P Core",
        "Yarbo Lawn Mower Pro (Core + Lawn Mower Pro Module)",
        "Snow Blower Module",
      ],
    }),
    "Yarbo Y40P Flash Sale.xlsx",
  );
  const matched = matchSaleImportRows(parsed, candidates);
  assert.equal(parsed.pricingScope, "y40p");
  assert.equal(matched[0].matchStatus, "matched");
  assert.equal(matched[0].candidate?.slug, "yarbo-y40p");
  assert.equal(matched[1].matchStatus, "needs_review");
  assert.equal(matched[1].candidate, null);
  assert.match(matched[1].row.validationErrors.join(" "), /not supported/);
  assert.equal(matched[2].matchStatus, "needs_review");
  assert.equal(matched[2].candidate, null);
  assert.match(matched[2].row.validationErrors.join(" "), /not supported/);
});

test("SKU collisions and exact-name collisions fail closed instead of falling through to looser matching", () => {
  const parsed = parseSaleImportWorkbook(workbookBuffer({ names: ["Snow Blower Module"] }), "Yarbo 2026 Y40 22 Sept-26 Sept Flash Sale.xlsx");
  const duplicate = { ...candidates.find((item) => item.slug === "yarbo-snow-blower-module")!, id: "duplicate" };
  const result = matchSaleImportRow(parsed.rows[0], [...candidates, duplicate], "y40");
  assert.equal(result.candidate, null);
  assert.equal(result.ambiguous, true);
});

test("overlapping Y40 Flash Sale and Y40P Early Access resolve from independent checkout rows", () => {
  const packageRow = {
    id: "package",
    product_id: "yarbo",
    package_slug: "yarbo-lawn-mower-pro",
    package_name: "Yarbo Lawn Mower Pro",
    description: null,
    public_status: "active",
    regular_price_cents: 590_000,
    sale_price_cents: 550_000,
    sale_starts_at: start,
    sale_ends_at: end,
  };
  const y40Relationship = {
    id: "package-y40",
    product_id: "yarbo",
    package_id: "package",
    core_variant_id: "y40",
    price_mode: "package" as const,
    public_status: "active",
    regular_price_cents: null,
    sale_price_cents: null,
    sale_starts_at: null,
    sale_ends_at: null,
    show_public_price: true,
    contact_for_pricing: false,
  };
  const y40pRelationship = {
    ...y40Relationship,
    id: "package-y40p",
    core_variant_id: "y40p",
    price_mode: "core_specific" as const,
    regular_price_cents: 779_900,
    sale_price_cents: 709_900,
    sale_starts_at: "2026-09-15T05:00:00.000Z",
    sale_ends_at: "2026-10-07T05:00:00.000Z",
  };
  const during = Date.parse("2026-09-25T17:00:00.000Z");

  const y40Source = yarboPackagePriceSource(packageRow, y40Relationship);
  const y40pSource = yarboPackagePriceSource(packageRow, y40pRelationship);
  assert.equal(y40Source, packageRow);
  assert.equal(y40pSource, y40pRelationship);
  assert.equal(operationalPriceCents(y40Source, during, true), 550_000);
  assert.equal(operationalPriceCents(y40pSource, during, true), 709_900);
  assert.equal(operationalPriceCents(y40Source, Date.parse(end), true), 590_000);
  assert.equal(operationalPriceCents(y40Source, during, false), 550_000);
});

test("temporary sale wins with Everyday Low Price on or off and ends back at the selected program price", () => {
  const row = {
    display_msrp_price_cents: 100_000,
    regular_price_cents: 90_000,
    sale_price_cents: 80_000,
    sale_starts_at: start,
    sale_ends_at: end,
  };
  const during = Date.parse("2026-09-23T12:00:00.000Z");
  const after = Date.parse(end);
  assert.equal(sellingPriceCents(row, true, during), 80_000);
  assert.equal(sellingPriceCents(row, false, during), 80_000);
  assert.equal(sellingPriceCents(row, true, after), 90_000);
  assert.equal(sellingPriceCents(row, false, after), 100_000);
});
