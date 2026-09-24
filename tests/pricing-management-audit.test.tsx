import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createPricingAdminHandlers } from "../lib/admin-pricing/handlers";
import { createPackageCorePriceAdminHandlers, type PackageCorePriceAdminRow } from "../lib/admin-pricing/package-core-prices";
import type { PricingItem, PricingKind } from "../lib/admin-pricing/types";
import { centralDateTimeInputToIso, isoToLocalDateTimeInput } from "../lib/admin-pricing/datetime-local";
import { activeSalePriceCents, sellingPriceDecision } from "../lib/pricing-program/policy";
import { priceWindowState } from "../lib/pricing-program/window";
import { priceFromRow, scheduledPublicPrice } from "../lib/catalog/public-price";
import { resolveEquipmentCatalogPricing } from "../lib/checkout/equipment-pricing";
import type { CheckoutCatalog } from "../lib/checkout/eligibility";
import type { CheckoutRequest } from "../lib/checkout/types";
import { checkoutCatalog as yarboCatalog, checkoutRequest as yarboRequest, during as yarboDuring } from "./helpers/yarbo-preorder-fixture";

const id = "11111111-1111-4111-8111-111111111111";
const version = "2026-09-23T12:00:00.000Z";
const start = "2026-09-20T05:00:00.000Z";
const end = "2026-09-30T05:00:00.000Z";
const now = Date.parse("2026-09-23T12:00:00.000Z");
const priceRow = (regular = 300_000) => ({
  display_msrp_price_cents: regular + 20_000,
  regular_price_cents: regular,
  sale_price_cents: null as number | null,
  sale_starts_at: null as string | null,
  sale_ends_at: null as string | null,
  promotion_label: null as string | null,
  show_public_price: true,
  contact_for_pricing: false,
  public_status: "active",
  updated_at: version,
});

const adminItem = (kind: PricingKind, row: ReturnType<typeof priceRow>): PricingItem => ({
  id,
  kind,
  category: "Equipment",
  name: "Controlled test item",
  slug: "controlled-test",
  brand: "Test",
  productName: null,
  publicStatus: "active",
  availabilityField: "public_status",
  availabilityStatus: "active",
  isAvailable: true,
  quoteOnly: false,
  targetLabel: null,
  values: row,
  effectivePriceCents: row.regular_price_cents,
  activeScheduleName: null,
  updatedAt: row.updated_at,
  dealerCostCents: null,
  normalDealerCostCents: null,
  promotionalDealerCostCents: null,
  promotionalDealerCostStartsAt: null,
  promotionalDealerCostEndsAt: null,
  idsPriceMessage: { message: null, imagePath: null, isPublic: false },
  salePriceMessage: { message: null, imagePath: null, isPublic: false },
});

async function saveThroughAdmin(kind: PricingKind, row: ReturnType<typeof priceRow>, patch: Record<string, unknown>) {
  let current = { ...row };
  const handlers = createPricingAdminHandlers({
    isAdmin: async () => true,
    read: async () => ({ items: [adminItem(kind, current)] }),
    readValues: async () => current,
    update: async (_kind, _id, values) => {
      current = { ...current, ...values, updated_at: "2026-09-23T12:01:00.000Z" };
      return adminItem(kind, current);
    },
  });
  const response = await handlers.PATCH(new Request(`http://local/api/admin/pricing/${kind}/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...patch, expectedUpdatedAt: version }),
  }), { params: Promise.resolve({ kind, id }) });
  assert.equal(response.status, 200, await response.text());
  return current;
}

test("one price-window policy is start-inclusive and end-exclusive", () => {
  const row = { ...priceRow(), sale_price_cents: 250_000, sale_starts_at: start, sale_ends_at: end };
  assert.equal(activeSalePriceCents(row, Date.parse(start) - 1), null);
  assert.equal(activeSalePriceCents(row, Date.parse(start)), 250_000);
  assert.equal(activeSalePriceCents(row, Date.parse(end) - 1), 250_000);
  assert.equal(activeSalePriceCents(row, Date.parse(end)), null);
  assert.equal(priceWindowState(true, { startsAt: start, endsAt: end }, Date.parse(end)), "ended");
});

test("an active schedule uses the same exclusive end and falls back exactly at the boundary", () => {
  const base = priceRow();
  const schedule = { id: "schedule", schedule_name: "Flash", product_id: id, starts_at: start, ends_at: end, regular_price_cents: 280_000, sale_price_cents: 240_000, promotion_label: "Flash", show_public_price: true, contact_for_pricing: false, public_status: "active" };
  assert.equal(scheduledPublicPrice(base, [schedule], "product", id, Date.parse(end) - 1).price.currentPriceCents, 240_000);
  const atEnd = scheduledPublicPrice(base, [schedule], "product", id, Date.parse(end));
  assert.equal(atEnd.schedule, null);
  assert.equal(atEnd.price.currentPriceCents, 300_000);
});

test("Central Time sale inputs round-trip across standard and daylight time and reject skipped wall time", () => {
  assert.equal(isoToLocalDateTimeInput("2026-01-15T18:30:00.000Z"), "2026-01-15T12:30");
  assert.equal(centralDateTimeInputToIso("2026-01-15T12:30"), "2026-01-15T18:30:00.000Z");
  assert.equal(isoToLocalDateTimeInput("2026-07-15T18:30:00.000Z"), "2026-07-15T13:30");
  assert.equal(centralDateTimeInputToIso("2026-07-15T13:30"), "2026-07-15T18:30:00.000Z");
  assert.equal(centralDateTimeInputToIso("2026-03-08T02:30"), null);
});

test("stale manual pricing saves are rejected with conflict instead of overwriting", async () => {
  const row = priceRow();
  const handlers = createPricingAdminHandlers({
    isAdmin: async () => true,
    read: async () => ({ items: [] }),
    readValues: async () => row,
    update: async () => { throw new Error("must not update"); },
  });
  const response = await handlers.PATCH(new Request(`http://local/api/admin/pricing/products/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ regular_price_cents: 1, expectedUpdatedAt: "2026-09-22T00:00:00.000Z" }),
  }), { params: Promise.resolve({ kind: "products", id }) });
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /changed after you opened/);
});

test("Lymow variant manual sale reaches the public resolver and exact checkout amount", async () => {
  const saved = await saveThroughAdmin("variants", priceRow(284_900), { sale_price_cents: 259_900, sale_starts_at: start, sale_ends_at: end, promotion_label: "Controlled sale" });
  assert.equal(priceFromRow(saved, now).currentPriceCents, 259_900);
  const base = { public_status: "active", regular_price_cents: 0, sale_price_cents: null, sale_starts_at: null, sale_ends_at: null };
  const catalog: CheckoutCatalog = {
    product: { ...base, id: "lymow", slug: "lymow-one-plus", brand: "Lymow", name: "Lymow One Plus" },
    variants: [{ ...saved, id, product_id: "lymow", variant_slug: "lymow-one-plus-5a", name: "5A Configuration", description: null, sku: "LYMOW-5A" }],
    options: [{ ...base, id: "charger", product_id: "lymow", option_slug: "lymow-5a-charger", name: "5A Charger", description: null, minimum_quantity: 0, maximum_quantity: 1 }],
    packages: [],
    variantOptions: [{ id: "defines", variant_id: id, option_id: "charger", relationship_type: "defines_variant" }],
    packageItems: [],
  };
  const request = { requestId: id, paymentMethod: "card", selection: { productId: "lymow", variantId: id, purchaseMode: "standard", packageId: null, options: [], includeBaseProduct: false }, customer: { name: "Test", email: null, phone: null }, shippingAddress: { line1: "1 Test", line2: null, city: "Columbia", state: "MO", postalCode: "65201", country: "US" } } as CheckoutRequest;
  assert.equal(resolveEquipmentCatalogPricing(request, catalog, [], now).subtotalCents, 259_900);
});

test("Y40 package manual sale changes Y40 public and checkout pricing without changing Y40P", async () => {
  const saved = await saveThroughAdmin("packages", priceRow(479_900), { sale_price_cents: 449_900, sale_starts_at: start, sale_ends_at: end });
  assert.equal(priceFromRow(saved, now).currentPriceCents, 449_900);
  const catalog = yarboCatalog();
  Object.assign(catalog.packages[0], saved);
  const y40pBefore = catalog.corePrices?.find(row => row.package_id === catalog.packages[0].id && row.price_mode === "core_specific")?.sale_price_cents;
  assert.equal(resolveEquipmentCatalogPricing(yarboRequest("y40", catalog.packages[0].id), catalog, [], now).subtotalCents, 449_900);
  assert.equal(catalog.corePrices?.find(row => row.package_id === catalog.packages[0].id && row.price_mode === "core_specific")?.sale_price_cents, y40pBefore);
});

test("Y40P package/Core manual sale changes Y40P public and checkout pricing without changing Y40", async () => {
  const catalog = yarboCatalog();
  const packageId = catalog.packages[0].id;
  const core = catalog.corePrices!.find(row => row.package_id === packageId && row.price_mode === "core_specific")!;
  let current = { ...core, id, updated_at: version };
  const handlers = createPackageCorePriceAdminHandlers({
    isAdmin: async () => true,
    read: async () => [],
    readValues: async () => current,
    update: async (_id, patch) => {
      current = { ...current, ...patch, updated_at: "2026-09-23T12:01:00.000Z" };
      return { id: current.id, packageId, packageName: "Snow Blower", coreVariantId: current.core_variant_id, coreName: "Y40P Core", coreStatus: "coming_soon", priceMode: "core_specific", regularPriceCents: current.regular_price_cents, salePriceCents: current.sale_price_cents, saleStartsAt: current.sale_starts_at, saleEndsAt: current.sale_ends_at, promotionLabel: null, showPublicPrice: current.show_public_price, contactForPricing: current.contact_for_pricing, publicStatus: current.public_status, updatedAt: current.updated_at } as PackageCorePriceAdminRow;
    },
  });
  const response = await handlers.PATCH(new Request(`http://local/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ sale_price_cents: 699_900, sale_starts_at: start, sale_ends_at: end, expectedUpdatedAt: version }) }), { params: Promise.resolve({ id }) });
  assert.equal(response.status, 200, await response.text());
  const y40Before = catalog.packages[0].regular_price_cents;
  Object.assign(core, current);
  assert.equal(priceFromRow({ display_msrp_price_cents: null, promotion_label: null, ...core }, now).currentPriceCents, 699_900);
  assert.equal(resolveEquipmentCatalogPricing(yarboRequest("y40p", packageId), catalog, [], yarboDuring).subtotalCents, 699_900);
  assert.equal(catalog.packages[0].regular_price_cents, y40Before);
});

test("pricing program precedence remains sale, then IDS, then MSRP", () => {
  const base = priceRow(300_000);
  assert.deepEqual(sellingPriceDecision(base, true, now).source, "ids_everyday");
  assert.deepEqual(sellingPriceDecision(base, false, now).source, "manufacturer_msrp");
  const sale = { ...base, sale_price_cents: 250_000, sale_starts_at: start, sale_ends_at: end };
  assert.equal(sellingPriceDecision(sale, true, now).priceCents, 250_000);
  assert.equal(sellingPriceDecision(sale, false, now).priceCents, 250_000);
});

test("pricing UI is workspace-driven, brand-authoritative, and lazy about item promotion editors", () => {
  const page = readFileSync("app/admin/pricing/page.tsx", "utf8");
  const server = readFileSync("lib/admin-pricing/server.ts", "utf8");
  for (const label of ["Pricing Menu", "Manual Price Changes", "Services & Deployment", "Manufacturer Price Sheets", "Sales / Price Schedules", "Pricing Program Settings", "Current customer price", "Proposed customer price", "Central Time"]) assert.match(page, new RegExp(label));
  assert.match(page, /aria-expanded=\{menuOpen\}/);
  assert.match(page, /event\.key === "Escape"/);
  assert.match(page, /editing && [\s\S]*PricingPromotionEditor/);
  assert.doesNotMatch(page, /productName\?\.split\(" "\)\[0\]/);
  assert.match(server, /productBrands/);
  assert.match(server, /maps\.productBrands\.get/);
});

test("pricing audit migration is private, append-only, and covers every price authority", () => {
  const sql = readFileSync("supabase/migrations/20260923234229_pricing_change_audit.sql", "utf8");
  assert.match(sql, /catalog_private\.catalog_pricing_change_audit/);
  assert.match(sql, /force row level security/i);
  assert.match(sql, /revoke all .* public, anon, authenticated, service_role/i);
  for (const target of ["catalog_products", "catalog_product_variants", "catalog_packages", "catalog_package_core_prices", "catalog_options", "catalog_services", "catalog_service_payment_options", "catalog_product_services", "catalog_price_schedules", "catalog_pricing_settings"]) assert.match(sql, new RegExp(target));
  assert.doesNotMatch(sql, /grant .*update|grant .*delete/i);
});
