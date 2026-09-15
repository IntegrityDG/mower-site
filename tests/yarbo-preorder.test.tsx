import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import ProductConfiguration from "../components/customer-paths/purchase/ProductConfiguration";
import PurchaseSummary from "../components/customer-paths/purchase/PurchaseSummary";
import YarboCoreComparison from "../components/equipment/YarboCoreComparison";
import { EquipmentCards } from "../components/equipment/EquipmentCatalog";
import { yarboCoreStatus } from "../components/equipment/YarboCorePrice";
import { catalogPurchaseState, catalogVariantAvailability, nextPreorderBoundaryDelay } from "../lib/catalog/preorder";
import { resolveBuildSelection, productBuildIsComplete } from "../lib/catalog/selection";
import { groupYarboPackages } from "../lib/catalog/yarbo";
import { yarboCoreCanBeSelected } from "../lib/catalog/yarbo-core";
import { resolveEquipmentCatalogPricing } from "../lib/checkout/equipment-pricing";
import { validateCheckoutEligibility } from "../lib/checkout/eligibility";
import { parseCheckoutRequest } from "../lib/checkout/request-schema";
import { safeProjection } from "../lib/checkout/order-projection";
import type { CheckoutRecord } from "../lib/checkout/order-repository";
import type { ProductBuildSelection } from "../lib/catalog/types";
import { buildCardCheckoutSession } from "../lib/stripe/checkout-session";
import { buildAchCheckoutSession } from "../lib/stripe/ach-checkout-session";
import { buildWireCheckoutSession } from "../lib/stripe/wire-checkout-session";
import { createPricingAdminHandlers } from "../lib/admin-pricing/handlers";
import { validatePricingPatch } from "../lib/admin-pricing/validation";
import type { PricingItem } from "../lib/admin-pricing/types";
import { checkoutCatalog, checkoutRequest, publicProduct, mappings, start, end, during } from "./helpers/yarbo-preorder-fixture";

const boundaries = [
  ["1 ms before start", Date.parse(start) - 1, false],
  ["exact start", Date.parse(start), true],
  ["during", during, true],
  ["1 ms before end", Date.parse(end) - 1, true],
  ["exact exclusive end", Date.parse(end), false],
  ["1 ms after end", Date.parse(end) + 1, false],
] as const;
const buildSelection = (variantId = "y40p", packageId = "yarbo-pro-snow"): ProductBuildSelection => ({
  variantId, packageId, optionQuantities: {}, purchaseMode: packageId ? "complete-system" : "individual-equipment", includeBaseProduct: !packageId,
});
const configHtml = (now: number, packageId = "yarbo-pro-snow") => renderToStaticMarkup(<ProductConfiguration
  product={publicProduct(now)} selection={buildSelection("y40p", packageId)}
  onSelectVariant={() => {}} onSelectPackage={() => {}} onSelectPurchaseMode={() => {}}
  onToggleBaseProduct={() => {}} onChangeOptionQuantity={() => {}} />);

for (const [label, now, allowed] of boundaries) {
  test(`preorder ${label}: canonical projection, Core selector, crafted server request, and price`, () => {
    const catalog = checkoutCatalog();
    const variant = catalog.variants[1];
    assert.equal(catalogPurchaseState(variant, now), allowed ? "preorder" : "coming_soon");
    const availability = catalogVariantAvailability(variant, now);
    assert.equal(availability.publicStatus, "coming_soon");
    assert.equal(availability.isAvailable, allowed);
    const product = publicProduct(now);
    assert.equal(yarboCoreStatus(product.variants[1]), allowed ? "Early Access / Pre-Order" : "Coming Soon");
    assert.equal(yarboCoreCanBeSelected(product, product.variants[1], product.packages[4]), allowed);
    assert.equal(productBuildIsComplete(product, buildSelection()), allowed);
    const html = configHtml(now);
    assert.equal(/<input(?=[^>]*value="y40p")(?=[^>]*disabled)[^>]*>/.test(html), !allowed);
    assert.equal((html.match(/name="yarbo-complete-core"/g) ?? []).length, 2);
    for (const [slug, , , , price] of mappings) {
      const request = checkoutRequest("y40p", slug);
      if (allowed) {
        assert.equal(validateCheckoutEligibility(request, catalog, now).variant?.id, "y40p");
        assert.equal(resolveEquipmentCatalogPricing(request, catalog, [], now).subtotalCents, price);
      } else {
        assert.throws(() => resolveEquipmentCatalogPricing(request, catalog, [], now), /Coming Soon/);
      }
    }
    if (allowed) assert.equal(resolveEquipmentCatalogPricing(checkoutRequest("y40p", null), catalog, [], now).subtotalCents, 499900);
    else assert.throws(() => resolveEquipmentCatalogPricing(checkoutRequest("y40p", null), catalog, [], now), /Coming Soon/);
  });
}

test("Coming Soon with an active sale and preorder OFF stays blocked", () => {
  const catalog = checkoutCatalog(false);
  assert.equal(catalogPurchaseState(catalog.variants[1], during), "coming_soon");
  assert.throws(() => resolveEquipmentCatalogPricing(checkoutRequest(), catalog, [], during), /Coming Soon/);
  const product = publicProduct(during, false);
  assert.equal(yarboCoreCanBeSelected(product, product.variants[1], product.packages[4]), false);
});

test("authorization fails closed for missing, invalid, unbounded, or reversed windows and hidden/unavailable status", () => {
  const variant = checkoutCatalog().variants[1];
  for (const patch of [
    { sale_starts_at: null }, { sale_ends_at: null }, { sale_starts_at: "invalid" }, { sale_ends_at: "invalid" },
    { sale_starts_at: end, sale_ends_at: start }, { sale_starts_at: start, sale_ends_at: start },
    { public_status: "hidden" }, { public_status: "unavailable" },
  ]) assert.notEqual(catalogPurchaseState({ ...variant, ...patch }, during), "preorder");
});

test("Y40 checkout names, Core price, seven package prices, and normal availability are unchanged at every boundary", () => {
  for (const [, now] of boundaries) {
    const catalog = checkoutCatalog();
    for (const [slug, name, price] of mappings) {
      const snapshot = resolveEquipmentCatalogPricing(checkoutRequest("y40", slug), catalog, [], now);
      assert.equal(snapshot.subtotalCents, price);
      assert.equal(snapshot.chargeableItems[0].name, `Y40 Core + ${name}`);
      assert.equal(snapshot.preorder, undefined);
      assert.deepEqual(snapshot.warnings, []);
    }
    const core = resolveEquipmentCatalogPricing(checkoutRequest("y40", null), catalog, [], now);
    assert.equal(core.subtotalCents, 374900);
    assert.equal(core.chargeableItems[0].name, "Y40 Core");
  }
});

test("one package collection retains all modules, exact Core row totals, and distinct preorder badges", () => {
  const product = publicProduct();
  assert.equal(product.packages.length, 7);
  assert.equal(groupYarboPackages(product.packages).flatMap((group) => group.packages).length, 7);
  assert.equal(new Set(product.packages.map((item) => item.id)).size, 7);
  const html = configHtml(during);
  assert.match(html, /Early Access \/ Pre-Order/);
  assert.match(html, /bg-violet-100/);
  assert.doesNotMatch(html, /In Stock/);
  for (const [slug, , , , price, parts] of mappings) {
    const build = resolveBuildSelection(product, buildSelection("y40p", slug));
    assert.equal(build.equipmentTotalCents, price);
    assert.deepEqual(build.packageIncludedItems.map((item) => item.optionId), [...parts]);
  }
});

test("Core-only builder and prepayment review show the selected Y40P price and notice", () => {
  assert.match(configHtml(during, ""), /name="yarbo-individual-core"/);
  assert.doesNotMatch(configHtml(during, ""), /<input(?=[^>]*value="y40p")(?=[^>]*disabled)[^>]*>/);
  assert.match(configHtml(Date.parse(end), ""), /<input(?=[^>]*value="y40p")(?=[^>]*disabled)[^>]*>/);
  for (const packageId of ["yarbo-pro-snow", ""]) {
    const html = renderToStaticMarkup(<PurchaseSummary selectedProduct={publicProduct()} buildSelection={buildSelection("y40p", packageId)}
      purchaseMethodLabel="Card" submissionKind="card" submitStatus="idle" submitError="" onSubmit={() => {}}
      customerInformation={{ fullName: "Buyer", email: "buyer@example.com", phone: "", shippingAddress: "1 Main", shippingZip: "65201", shippingState: "MO", shippingRegion: "Boone", referrerName: "", referrerEmail: "" }} />);
    assert.match(html, /Y40P Core/);
    assert.match(html, /Early Access \/ Pre-Order/);
    assert.match(html, /October 6, 2026/);
    assert.match(html, /Fulfillment timing is subject to manufacturer availability/);
    assert.match(html, packageId ? /\$8,999/ : /\$4,999/);
  }
});

test("comparison and storefront show preorder identity without stock or shipment promises", () => {
  const html = renderToStaticMarkup(<YarboCoreComparison product={publicProduct()} />);
  assert.match(html, /Early Access \/ Pre-Order/);
  assert.match(html, /October 6, 2026/);
  assert.doesNotMatch(html, /In Stock|ships on|delivery date/i);
  const cards = renderToStaticMarkup(<EquipmentCards products={[publicProduct()]} aftermarketEnabled={false} />);
  assert.match(cards, /Y40P: Early Access \/ Pre-Order/);
});

test("forged checkout cannot bypass parent status, Core mapping, package/module status, compatibility, or server price", () => {
  const mutations = [
    (c: ReturnType<typeof checkoutCatalog>) => { c.product.public_status = "unavailable"; },
    (c: ReturnType<typeof checkoutCatalog>) => { c.variants[1].product_id = "another"; },
    (c: ReturnType<typeof checkoutCatalog>) => { c.variants[1].preorder_enabled = false; },
    (c: ReturnType<typeof checkoutCatalog>) => { c.packages[4].public_status = "unavailable"; },
    (c: ReturnType<typeof checkoutCatalog>) => { c.options[0].public_status = "unavailable"; },
    (c: ReturnType<typeof checkoutCatalog>) => { c.corePrices = []; },
    (c: ReturnType<typeof checkoutCatalog>) => { c.corePrices![9].public_status = "unavailable"; },
    (c: ReturnType<typeof checkoutCatalog>) => { c.corePrices![9].regular_price_cents = null; c.corePrices![9].sale_price_cents = null; },
    (c: ReturnType<typeof checkoutCatalog>) => { c.corePrices![9].contact_for_pricing = true; },
    (c: ReturnType<typeof checkoutCatalog>) => { c.variantOptions = []; },
    (c: ReturnType<typeof checkoutCatalog>) => { c.variants[1].regular_price_cents = null; c.variants[1].sale_price_cents = null; },
  ];
  mutations.forEach((mutate, i) => {
    const catalog = checkoutCatalog(); mutate(catalog);
    const request = i === mutations.length - 1 ? checkoutRequest("y40p", null) : checkoutRequest();
    assert.throws(() => resolveEquipmentCatalogPricing(request, catalog, [], during), (error: unknown) => error instanceof Error, `mutation ${i}`);
  });
});

test("required Core component status and presence remain enforced during preorder", () => {
  const catalog = checkoutCatalog();
  catalog.variantOptions.push({ id: "required", variant_id: "y40p", option_id: "trimmer", relationship_type: "required" });
  assert.throws(() => resolveEquipmentCatalogPricing(checkoutRequest(), catalog, [], during), /unavailable/);
  catalog.options[3].public_status = "active";
  assert.throws(() => resolveEquipmentCatalogPricing(checkoutRequest(), catalog, [], during), /required Core component is missing/);
});

test("price schedules and stale client projections never extend preorder authorization", () => {
  const schedule = { id: "future-sale", variant_id: "y40p", starts_at: start, ends_at: null, regular_price_cents: 559900, sale_price_cents: 499900, public_status: "active" };
  assert.throws(() => resolveEquipmentCatalogPricing(checkoutRequest("y40p", null), checkoutCatalog(), [schedule], Date.parse(end)), /Coming Soon/);
  assert.equal(publicProduct(during).variants[1].isAvailable, true);
  assert.throws(() => resolveEquipmentCatalogPricing(checkoutRequest(), checkoutCatalog(), [], Date.parse(end)), /Coming Soon/);
});

test("client price and preorder-state manipulation is rejected by the request allowlist", () => {
  const request = checkoutRequest();
  const valid = { ...request, selection: { ...request.selection, productId: randomUUID(), variantId: randomUUID(), packageId: randomUUID() } };
  assert.doesNotThrow(() => parseCheckoutRequest(valid));
  for (const field of ["price", "totalCents", "preorder_enabled", "purchaseState"]) {
    assert.throws(() => parseCheckoutRequest({ ...valid, [field]: 1 }), /unknown/);
    assert.throws(() => parseCheckoutRequest({ ...valid, selection: { ...valid.selection, [field]: 1 } }), /unknown/);
  }
});

test("immutable order snapshot and customer confirmation retain preorder identity after expiration", () => {
  const snapshot = resolveEquipmentCatalogPricing(checkoutRequest(), checkoutCatalog(), [], during);
  assert.equal(snapshot.variant?.name, "Y40P Core");
  assert.equal(snapshot.chargeableItems[0].name, "Y40P Core + Lawn Mower Pro + Snow Blower — Early Access Pre-Order");
  assert.equal(snapshot.preorder?.endsAt, end);
  assert.ok(Object.isFrozen(snapshot));
  const saved = JSON.parse(JSON.stringify(snapshot));
  const projection = safeProjection({ snapshot: saved } as CheckoutRecord);
  assert.match(projection.preorderNotice!, /Y40P Core Early Access pre-order/);
  assert.match(projection.preorderNotice!, /manufacturer inventory becomes available/);
  assert.match(projection.items[0].name, /Early Access Pre-Order/);
  assert.equal("catalogSources" in projection, false);
  assert.match(readFileSync("app/checkout/success/page.tsx", "utf8"), /view\.preorderNotice/);
  assert.match(readFileSync("lib/notifications/payment-notifications.ts", "utf8"), /item\.name/);
});

for (const method of ["card", "ach_debit", "wire_transfer"] as const) {
  test(`${method} Stripe handoff uses the server amount and customer-safe preorder line name`, () => {
    const request = { ...checkoutRequest(), paymentMethod: method };
    const snapshot = resolveEquipmentCatalogPricing(request, checkoutCatalog(), [], during);
    const input = { snapshot, orderId: "order", attemptId: "attempt", publicReference: "IDS-X", customerEmail: null,
      appBaseUrl: "https://example.com", signingSecret: "secret", returnPath: "/equipment/yarbo", cancelExpiresAt: Date.parse(end), stripeCustomerId: "cus_Test123" };
    const session = method === "card" ? buildCardCheckoutSession(input) : method === "ach_debit" ? buildAchCheckoutSession(input) : buildWireCheckoutSession(input);
    const line = session.line_items![0] as { price_data: { unit_amount: number; product_data: { name: string; description: string } } };
    assert.equal(line.price_data.unit_amount, snapshot.totalCents);
    assert.match(line.price_data.product_data.name, /Y40P Core.*Early Access Pre-Order/);
    assert.match(line.price_data.product_data.description, /manufacturer inventory/);
    assert.doesNotMatch(JSON.stringify(session), /dealer_cost|margin|private_notes/);
  });
}

test("module-only checkout stays independent of expired Core preorder and Trimmer stays unavailable", () => {
  const request = checkoutRequest("y40p", null);
  request.selection.variantId = null; request.selection.includeBaseProduct = false;
  request.selection.options = [{ optionId: "mower", quantity: 1 }];
  const snapshot = resolveEquipmentCatalogPricing(request, checkoutCatalog(), [], Date.parse(end));
  assert.equal(snapshot.subtotalCents, 100000);
  assert.equal(snapshot.variant, null);
  assert.equal(snapshot.preorder, undefined);
  assert.match(snapshot.warnings[0], /Core is not included/);
  request.selection.options = [{ optionId: "trimmer", quantity: 1 }];
  assert.throws(() => resolveEquipmentCatalogPricing(request, checkoutCatalog(), [], during), /unavailable/);
  assert.equal(publicProduct().ungroupedOptions.find((option) => option.id === "trimmer")?.isAvailable, false);
});

test("open builder refresh delay follows the catalog authorization start and exclusive end", () => {
  const catalog = { products: [publicProduct()], generatedAt: new Date(during).toISOString() };
  assert.equal(nextPreorderBoundaryDelay(catalog), Date.parse(end) - during);
  assert.equal(nextPreorderBoundaryDelay(catalog, Date.parse(start) - 1), 1);
  assert.equal(nextPreorderBoundaryDelay(catalog, Date.parse(end) - 1), 1);
  assert.equal(nextPreorderBoundaryDelay(catalog, Date.parse(end)), null);
});

test("admin preorder mutation is variant-only, boolean-only, authenticated, and updates only authorization", async () => {
  assert.deepEqual(validatePricingPatch("variants", { preorder_enabled: true }), { ok: true, value: { preorder_enabled: true } });
  assert.equal(validatePricingPatch("variants", { preorder_enabled: "true" }).ok, false);
  assert.equal(validatePricingPatch("products", { preorder_enabled: true }).ok, false);
  let saved: Record<string, unknown> | null = null;
  let admin = false;
  const handlers = createPricingAdminHandlers({ isAdmin: async () => admin, read: async () => ({ items: [] }),
    readValues: async () => ({ sale_starts_at: start, sale_ends_at: end }),
    update: async (_kind, _id, values) => { saved = values; return { values } as PricingItem; } });
  const context = { params: Promise.resolve({ kind: "variants", id: randomUUID() }) };
  const request = () => new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ preorder_enabled: false }) });
  assert.equal((await handlers.PATCH(request(), context)).status, 401); assert.equal(saved, null);
  admin = true;
  assert.equal((await handlers.PATCH(request(), context)).status, 200);
  assert.deepEqual(saved, { preorder_enabled: false });
});
