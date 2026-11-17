/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { builderAccessoryOptions, standaloneAccessoryOptions } from "../lib/catalog/customer-facing-options";
import { validateItem } from "../lib/accessories/validation";
import { validateCheckoutEligibility } from "../lib/checkout/eligibility";

const slugs = ["yarbo-4g-connect-kit-m-series", "yarbo-all-terrain-track-m-series", "mini-yarbo-core-3d-model-y-series", "mini-yarbo-snow-blower-3d-model-y-series", "mini-yarbo-lawn-mower-3d-model-y-series", "mini-yarbo-blower-3d-model-y-series", "future-unverified-accessory"];
const option = (slug: string, overrides = {}) => ({ id: slug, slug, name: slug, isAvailable: true, currentPriceCents: 10000, contactForPricing: false, accessoryListingEnabled: true, accessoryTab: "yarbo", accessoryActionType: "builder", showInBuilder: false, ...overrides });
const product = (options: any[]) => ({ slug: "yarbo", variants: [], optionGroups: [], ungroupedOptions: options }) as any;

test("standalone purchase opt-in does not imply machine compatibility, including future listings", () => {
  const p = product(slugs.map(slug => option(slug)));
  assert.equal(standaloneAccessoryOptions(p).length, slugs.length);
  assert.deepEqual(builderAccessoryOptions(p), []);
});
test("existing machine addons remain available in both purchase paths", () => {
  const p = product([option("yarbo-tow-hitch", { showInBuilder: true })]);
  assert.equal(standaloneAccessoryOptions(p).length, 1);
  assert.equal(builderAccessoryOptions(p).length, 1);
});
test("contact, hidden, unpriced and non-builder listings do not gain standalone checkout", () => {
  for (const overrides of [{ accessoryActionType: "contact" }, { accessoryActionType: "none" }, { accessoryActionType: "external" }, { accessoryListingEnabled: false }, { contactForPricing: true }, { currentPriceCents: null }]) {
    assert.deepEqual(standaloneAccessoryOptions(product([option("not-purchasable", overrides)])), []);
  }
});
test("admin permits explicitly priced standalone checkout with addons disabled", () => {
  const item = { tab: "yarbo", publicStatus: "active", name: "M Series Track", description: "", imageUrl: "", imageAlt: "", badge: "", manufacturer: "Yarbo", showInBuilder: false, sortOrder: 1, regularPrice: "169", salePrice: "152", promotionLabel: "", showPublicPrice: true, contactForPricing: false, actionType: "builder", actionLabel: "", actionUrl: "", priceText: "" };
  assert.equal(validateItem(item)?.showInBuilder, false);
  assert.equal(validateItem({ ...item, contactForPricing: true }), null);
  assert.equal(validateItem({ ...item, regularPrice: "", salePrice: "" }), null);
});
test("server rejects forged or stale standalone accessories submitted as machine addons", () => {
  const base = { public_status: "active", regular_price_cents: 10000, sale_price_cents: null, sale_starts_at: null, sale_ends_at: null };
  for (const slug of slugs) {
    const request = { selection: { productId: "p", variantId: null, packageId: null, purchaseMode: "individual-equipment", includeBaseProduct: true, options: [{ optionId: slug, quantity: 1 }] } } as any;
    const catalog = { product: { ...base, id: "p", slug: "yarbo", brand: "Yarbo", name: "Yarbo" }, variants: [], options: [{ ...base, id: slug, product_id: "p", option_slug: slug, name: slug, minimum_quantity: 0, maximum_quantity: 10, accessory_listing_enabled: true, accessory_tab: "yarbo", accessory_action_type: "builder", show_in_builder: false }], packages: [], variantOptions: [], packageItems: [] } as any;
    assert.throws(() => validateCheckoutEligibility(request, catalog), /Only approved Yarbo modules and builder accessories/);
  }
});
test("standalone resolver separates aftermarket opt-in while retaining price and service guards", () => {
  const source = readFileSync("lib/checkout/pricing-resolver.ts", "utf8");
  assert.match(source, /\(correctTab === "aftermarket" && option\.show_in_builder !== true\)/);
  assert.match(source, /correctTab !== "aftermarket" && option\.accessory_action_type !== "builder"/);
  assert.match(source, /"yarbo-4g-service"/);
  assert.match(source, /currentPrice\(applyActivePriceSchedule/);
});

test("real standalone server resolver accepts standalone hardware and rejects unavailable, contact and service rows", async () => {
  const { fixturePricingResolver } = await import("./helpers/standalone-pricing-resolver");
  const base = { public_status: "active", regular_price_cents: 16900, sale_price_cents: 15200, sale_starts_at: null, sale_ends_at: null, show_public_price: true, contact_for_pricing: false };
  const row = { ...base, id: "track", product_id: "p", option_slug: "yarbo-all-terrain-track-m-series", name: "M Series Track", minimum_quantity: 0, maximum_quantity: 10, accessory_listing_enabled: true, accessory_tab: "yarbo", accessory_action_type: "builder", show_in_builder: false };
  const request = { paymentMethod: "card", selection: { productId: "p", variantId: null, packageId: null, purchaseMode: "accessories", includeBaseProduct: false, options: [{ optionId: "track", quantity: 1 }] } } as any;
  const resolve = (overrides = {}) => fixturePricingResolver({ catalog_products: [{ ...base, id: "p", slug: "yarbo", name: "Yarbo" }], catalog_options: [{ ...row, ...overrides }], catalog_price_schedules: [] })(request);
  const result = await resolve();
  assert.equal(result.chargeableItems[0].unitAmountCents, 15200);
  assert.equal(result.totalCents, 15200);
  for (const overrides of [{ public_status: "hidden" }, { public_status: "unavailable" }, { accessory_action_type: "contact" }, { contact_for_pricing: true }, { option_slug: "yarbo-4g-service" }, { retired_at: "2026-11-17" }]) await assert.rejects(resolve(overrides));
});
