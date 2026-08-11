import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import EverydayPriceDisplay from "../components/equipment/EverydayPriceDisplay";
import { scheduledPublicPrice, type PublicPriceRow } from "../lib/catalog/public-price";
import { operationalPriceCents } from "../lib/checkout/operational-price";
import { CATALOG_PRICING_FIELDS, mergePreservedPricing, translateLegacyUndatedPricing } from "../scripts/import-catalog";

const now = Date.parse("2026-08-10T12:00:00Z");
const operational = (overrides: Partial<PublicPriceRow> = {}): PublicPriceRow => ({
  display_msrp_price_cents: 299900,
  regular_price_cents: 279900,
  sale_price_cents: null,
  sale_starts_at: null,
  sale_ends_at: null,
  promotion_label: null,
  show_public_price: true,
  contact_for_pricing: false,
  ...overrides,
});

test("checkout never uses manufacturer comparison price and rejects its absence as an operational fallback", () => {
  assert.equal(operationalPriceCents(operational(), now), 279900);
  assert.equal(operationalPriceCents(operational({ regular_price_cents: null }), now), null);
});

test("checkout operational precedence covers active, expired, and future temporary sales", () => {
  assert.equal(operationalPriceCents(operational({ sale_price_cents: 269800, sale_starts_at: "2026-08-01T00:00:00Z", sale_ends_at: "2026-08-20T00:00:00Z" }), now), 269800);
  assert.equal(operationalPriceCents(operational({ sale_price_cents: 269800, sale_starts_at: "2026-07-01T00:00:00Z", sale_ends_at: "2026-08-09T00:00:00Z" }), now), 279900);
  assert.equal(operationalPriceCents(operational({ sale_price_cents: 269800, sale_starts_at: "2026-08-11T00:00:00Z" }), now), 279900);
});

test("public display renders comparison, IDS everyday, and active temporary sale levels", () => {
  const price = scheduledPublicPrice(operational({ sale_price_cents: 269800, sale_starts_at: "2026-08-01T00:00:00Z", sale_ends_at: "2026-08-20T00:00:00Z", promotion_label: "Launch Sale" }), [], "product", "p", now).price;
  const html = renderToStaticMarkup(React.createElement(EverydayPriceDisplay, { item: price, comparisonLabel: "Lymow Everyday Price" }));
  assert.match(html, /Lymow Everyday Price/); assert.match(html, /\$2,999/);
  assert.match(html, /IDS Everyday Price/); assert.match(html, /\$2,799/);
  assert.match(html, /Launch Sale/); assert.match(html, /\$2,698/);
});

test("expired public sale returns to IDS everyday display", () => {
  const price = scheduledPublicPrice(operational({ sale_price_cents: 269800, sale_starts_at: "2026-07-01T00:00:00Z", sale_ends_at: "2026-08-09T00:00:00Z" }), [], "product", "p", now).price;
  const html = renderToStaticMarkup(React.createElement(EverydayPriceDisplay, { item: price, comparisonLabel: "Lymow Everyday Price" }));
  assert.match(html, /\$2,999/); assert.match(html, /\$2,799/); assert.doesNotMatch(html, /\$2,698/);
});

test("active schedule overrides operational price without erasing base comparison MSRP", () => {
  const result = scheduledPublicPrice(operational(), [{ id:"schedule", schedule_name:"Launch", product_id:"p", starts_at:"2026-08-01T00:00:00Z", ends_at:null, regular_price_cents:259900, sale_price_cents:null, public_status:"active" }], "product", "p", now);
  assert.equal(result.price.currentPriceCents, 259900);
  assert.equal(result.price.displayMsrpPriceCents, 299900);
});

test("legacy undated prices translate to the required Lymow and Yarbo three-tier values", () => {
  for (const [name, msrp, everyday] of [["Lymow 5A",299900,279900],["Lymow 10A",319900,299900],["Yarbo Core",399900,374900]] as const) {
    const row = translateLegacyUndatedPricing({ name, regular_price_cents:msrp, sale_price_cents:everyday, sale_starts_at:null, sale_ends_at:null });
    assert.deepEqual([row.display_msrp_price_cents,row.regular_price_cents,row.sale_price_cents],[msrp,everyday,null]);
  }
});

test("normal importer preservation keeps all Admin-managed three-tier values", () => {
  const incoming = [{ slug:"item", display_msrp_price_cents:300, regular_price_cents:200, sale_price_cents:100 }];
  const stored = [{ slug:"item", display_msrp_price_cents:900, regular_price_cents:800, sale_price_cents:700 }];
  const [result] = mergePreservedPricing(incoming, stored, ["slug"], CATALOG_PRICING_FIELDS, false, "catalog_products", { warn:()=>undefined, log:()=>undefined });
  assert.deepEqual([result.display_msrp_price_cents,result.regular_price_cents,result.sale_price_cents],[900,800,700]);
});

test("migration adds constrained comparison columns and converts only undated sales", () => {
  const sql = readFileSync("supabase/migrations/20260811002042_add_three_tier_pricing.sql", "utf8");
  for (const table of ["catalog_products","catalog_product_variants","catalog_options","catalog_packages","catalog_services","catalog_service_payment_options"]) assert.match(sql, new RegExp(`alter table public\\.${table}[\\s\\S]*?add column display_msrp_price_cents`));
  assert.match(sql, /add column override_display_msrp_price_cents/);
  assert.equal((sql.match(/and sale_starts_at is null/g) ?? []).length, 5);
  assert.equal((sql.match(/and sale_ends_at is null/g) ?? []).length, 5);
  assert.doesNotMatch(sql, /alter table public\.catalog_price_schedules[\s\S]*display_msrp/);
});

test("pricing resolver contains no display MSRP checkout fallback", () => {
  const source = readFileSync("lib/checkout/pricing-resolver.ts", "utf8");
  assert.doesNotMatch(source, /display_msrp_price_cents/);
  assert.match(source, /operationalPriceCents/);
});

test("admin pricing labels explain the three tiers and accessories keep IDS terminology", () => {
  const pricingAdmin = readFileSync("app/admin/pricing/page.tsx", "utf8");
  assert.match(pricingAdmin, /Manufacturer \/ Comparison Price/);
  assert.match(pricingAdmin, /IDS Everyday Price/);
  assert.match(pricingAdmin, /Temporary Sale Price/);
  assert.match(pricingAdmin, /Scheduled IDS Price/);
  assert.match(pricingAdmin, /Scheduled Sale Price/);
  assert.match(pricingAdmin, /display-only and is never charged/);
  const accessoryAdmin = readFileSync("app/admin/accessories/page.tsx", "utf8");
  assert.match(accessoryAdmin, /IDS Everyday Price \(dollars\)/);
  assert.match(accessoryAdmin, /Temporary Sale Price \(dollars\)/);
});
