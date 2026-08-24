import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import ProductConfiguration from "../components/customer-paths/purchase/ProductConfiguration";
import ProductSelection from "../components/customer-paths/purchase/ProductSelection";
import ServiceSelection from "../components/customer-paths/purchase/ServiceSelection";
import { EquipmentCards } from "../components/equipment/EquipmentCatalog";
import { validatePricingPatch } from "../lib/admin-pricing/validation";
import { selectActivePriceSchedule, type ActivePriceSchedule } from "../lib/catalog/active-price-schedule";
import {
  buildAvailabilityIssues,
  catalogAvailabilityFromBoolean,
  catalogAvailabilityFromPublicStatus,
  catalogPackageIsAvailable,
  removeUnavailableBuildSelections,
} from "../lib/catalog/availability";
import { productBuildIsComplete } from "../lib/catalog/selection";
import type {
  CatalogOption,
  CatalogProduct,
  CatalogService,
  ProductBuildSelection,
} from "../lib/catalog/types";
import { validateCheckoutEligibility } from "../lib/checkout/eligibility";
import { parseCheckoutRequest } from "../lib/checkout/request-schema";

const source = (path: string) => readFileSync(path, "utf8");
const price = {
  publicStatus: "active" as const,
  isAvailable: true,
  regularPriceCents: 100_000,
  salePriceCents: null,
  currentPriceCents: 100_000,
  showPublicPrice: true,
  contactForPricing: false,
  promotionLabel: null,
  saleIsActive: false,
};

function option(overrides: Partial<CatalogOption> = {}): CatalogOption {
  return {
    id: "option",
    slug: "replacement-blade",
    name: "Replacement Blade",
    description: "Replacement blade.",
    optionGroupId: "options",
    isRequired: false,
    isIncluded: false,
    isRecommended: false,
    defaultQuantity: 0,
    minimumQuantity: 0,
    maximumQuantity: 2,
    sortOrder: 1,
    ...price,
    ...overrides,
  };
}

function product(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  const blade = option();
  return {
    id: "product",
    slug: "lymow-one-plus",
    brand: "Lymow",
    name: "Lymow One Plus",
    homepageSummary: "Autonomous mower.",
    fullDescription: "Autonomous mower details.",
    capabilityLevel: null,
    propertyScale: null,
    customerGuidance: null,
    brochureUrl: null,
    videoUrl: null,
    imageUrl: "/lymow.png",
    imageAlt: "Lymow One Plus",
    sortOrder: 1,
    salesMode: "self_service",
    page: null,
    media: [],
    variants: [{ id: "variant", slug: "lymow-one-plus-5a", sku: null, name: "5A configuration", description: null, sortOrder: 1, definingOptionIds: [], ...price }],
    optionGroups: [{ id: "options", slug: "accessories", name: "Accessories", description: null, selectionType: "quantity", isRequired: false, minimumSelections: 0, maximumSelections: null, sortOrder: 1, options: [blade] }],
    ungroupedOptions: [],
    packages: [{ id: "package", slug: "package", name: "Package", description: null, sortOrder: 1, items: [{ optionId: blade.id, quantity: 1, includedInPackagePrice: true, option: blade }], ...price }],
    ...price,
    ...overrides,
  };
}

const selection: ProductBuildSelection = {
  variantId: "variant",
  packageId: "package",
  optionQuantities: {},
};

test("admin availability patches map every pricing kind to its existing field", () => {
  for (const kind of ["products", "variants", "packages", "options", "services", "schedules"] as const) {
    assert.deepEqual(validatePricingPatch(kind, { public_status: "active" }), { ok: true, value: { public_status: "active" } });
    assert.deepEqual(validatePricingPatch(kind, { public_status: "unavailable" }), { ok: true, value: { public_status: "unavailable" } });
    assert.deepEqual(validatePricingPatch(kind, { public_status: "hidden" }), { ok: true, value: { public_status: "hidden" } });
    assert.deepEqual(validatePricingPatch(kind, { public_status: "coming_soon" }), { ok: true, value: { public_status: "coming_soon" } });
  }
  for (const kind of ["product-services", "service-payment-options"] as const) {
    assert.deepEqual(validatePricingPatch(kind, { is_available: true }), { ok: true, value: { is_available: true } });
    assert.deepEqual(validatePricingPatch(kind, { is_available: false }), { ok: true, value: { is_available: false } });
  }
});

test("invalid availability payloads are rejected without weakening special statuses", () => {
  assert.equal(validatePricingPatch("products", { public_status: "sold_out" }).ok, false);
  assert.equal(validatePricingPatch("product-services", { is_available: "yes" }).ok, false);
  assert.equal(validatePricingPatch("products", { public_status: "hidden" }).ok, true);
  assert.equal(validatePricingPatch("products", { public_status: "coming_soon" }).ok, true);
});

test("Pricing Management exposes distinct ON, OFF, and HIDDEN public-status controls", () => {
  const admin = source("app/admin/pricing/page.tsx");
  assert.match(admin, />Available</);
  assert.match(admin, />ON</);
  assert.match(admin, />OFF</);
  assert.match(admin, />HIDDEN</);
  assert.match(admin, /setAvailability\(item, "active"\)/);
  assert.match(admin, /setAvailability\(item, "unavailable"\)/);
  assert.match(admin, /setAvailability\(item, "hidden"\)/);
  assert.match(admin, /item\.availabilityField === "public_status"/);
  assert.match(admin, /aria-pressed=\{item\.availabilityStatus === "hidden"\}/);
  assert.match(admin, /item\.availabilityStatus === "hidden" \? "bg-red-700 text-white"/);
  assert.match(admin, /public_status: nextStatus/);
  assert.match(admin, /is_available: available/);
  assert.match(admin, /setItems\(previousItems\)/);
  assert.match(admin, /disabled=\{Boolean\(availabilitySavingKey\)\}/);
  assert.match(source("app/api/admin/pricing/[kind]/[id]/route.ts"), /isReviewAdmin/);
});

test("public availability normalization is explicit and hidden records stay excluded", () => {
  assert.deepEqual(catalogAvailabilityFromPublicStatus("active"), { isAvailable: true, publicStatus: "active" });
  assert.deepEqual(catalogAvailabilityFromPublicStatus("unavailable"), { isAvailable: false, publicStatus: "unavailable" });
  assert.deepEqual(catalogAvailabilityFromBoolean(false), { isAvailable: false, publicStatus: null });
  const loader = source("lib/catalog/load-public-catalog.ts");
  assert.match(loader, /PUBLIC_CATALOG_STATUSES/);
  assert.doesNotMatch(loader, /\.neq\("public_status", "hidden"\)/);
  assert.doesNotMatch(loader, /dealer_cost_cents|dealerCostCents/);
});

test("unavailable Featured Machines remain visible and informational", () => {
  const unavailable = product({ isAvailable: false, publicStatus: "unavailable" });
  const html = renderToStaticMarkup(<EquipmentCards products={[unavailable]} aftermarketEnabled={false} />);
  assert.match(html, /Lymow One Plus/);
  assert.match(html, /Unavailable/);
  assert.match(html, /View Details/);
  assert.doesNotMatch(html, /Build Your System/);
  assert.match(source("components/mobile/MobileHomepage.tsx"), /<EquipmentCatalog \/>/);
});

test("unavailable products cannot start a desktop or mobile build", () => {
  const unavailable = product({ isAvailable: false, publicStatus: "unavailable" });
  const html = renderToStaticMarkup(<ProductSelection products={[unavailable]} selectedProductId="" onSelectProduct={() => undefined} />);
  assert.match(html, /Unavailable/);
  assert.match(html, /disabled/);
  assert.equal(productBuildIsComplete(unavailable, selection), false);
});

test("product detail pages remain informational while purchase actions honor availability", () => {
  const page = source("app/equipment/[slug]/page.tsx");
  assert.match(page, /findCatalogProductBySlug/);
  assert.match(page, /isAvailable=\{product\.isAvailable\}/);
  assert.match(page, /!product\.isAvailable && <UnavailableBadge/);
  assert.match(page, /product\.isAvailable && <Link/);
  assert.match(source("components/equipment/ProductBuildCta.tsx"), /isAvailable \? <Link/);
});

test("unavailable variants, options, and packages stay visible but disabled", () => {
  const unavailableOption = option({ isAvailable: false, publicStatus: "unavailable" });
  const catalog = product({
    variants: [{ ...product().variants[0], isAvailable: false, publicStatus: "unavailable" }],
    optionGroups: [{ ...product().optionGroups[0], options: [unavailableOption] }],
    packages: [{ ...product().packages[0], isAvailable: false, publicStatus: "unavailable", items: [{ optionId: unavailableOption.id, quantity: 1, includedInPackagePrice: true, option: unavailableOption }] }],
  });
  const html = renderToStaticMarkup(<ProductConfiguration product={catalog} selection={{ variantId: "", packageId: "", optionQuantities: {} }} onSelectVariant={() => undefined} onSelectPackage={() => undefined} onChangeOptionQuantity={() => undefined} onSelectPurchaseMode={() => undefined} onToggleBaseProduct={() => undefined} />);
  assert.match(html, /5A configuration/);
  assert.match(html, /Replacement Blade/);
  assert.match(html, /Package/);
  assert.ok((html.match(/Unavailable/g) ?? []).length >= 3);
  assert.ok((html.match(/disabled/g) ?? []).length >= 3);
});

test("package and stale build availability resolve hierarchically", () => {
  const unavailableOption = option({ isAvailable: false, publicStatus: "unavailable" });
  const catalogPackage = { ...product().packages[0], items: [{ optionId: unavailableOption.id, quantity: 1, includedInPackagePrice: true, option: unavailableOption }] };
  assert.equal(catalogPackageIsAvailable(catalogPackage), false);
  const staleProduct = product({ optionGroups: [{ ...product().optionGroups[0], options: [unavailableOption] }] });
  const issues = buildAvailabilityIssues(staleProduct, { variantId: "", packageId: "", optionQuantities: { [unavailableOption.id]: 1 } });
  assert.deepEqual(issues, [unavailableOption.name]);
  assert.equal(productBuildIsComplete(staleProduct, { variantId: "", packageId: "", optionQuantities: { [unavailableOption.id]: 1 } }), false);
  assert.deepEqual(removeUnavailableBuildSelections(staleProduct, { variantId: "", packageId: "", optionQuantities: { [unavailableOption.id]: 1 } }).optionQuantities, {});
});

test("services and service payment options render unavailable without selection controls", () => {
  const payment = { id: "payment", slug: "monthly", name: "Monthly", billingType: "monthly", seasonLengthMonths: null, savingsLabel: null, notes: null, sortOrder: 1, ...price, ...catalogAvailabilityFromBoolean(false) };
  const service: CatalogService = { id: "service", slug: "setup", name: "Setup Service", description: "Setup", category: "installation", billingType: "one_time", requiresLocalService: false, requiresPropertyReview: false, estimatedHours: null, maximumVisitHours: null, seasonLength: null, isRecommended: false, isRequired: false, sortOrder: 1, paymentOptions: [payment], ...price, ...catalogAvailabilityFromPublicStatus("unavailable") };
  const catalogProduct = Object.assign(product(), { services: [service] });
  const html = renderToStaticMarkup(<ServiceSelection product={catalogProduct} availableServices={[service]} selectedServices={[]} selectedState="Missouri" selectedRegion="Southeast" localServiceEligible onToggleService={() => undefined} onSelectPaymentOption={() => undefined} />);
  assert.match(html, /Setup Service/);
  assert.match(html, /Unavailable/);
  assert.match(html, /disabled/);
});

test("unavailable schedules never override base pricing", () => {
  const schedule: ActivePriceSchedule = { id: "schedule", product_id: "product", starts_at: "2026-08-01T00:00:00Z", ends_at: null, regular_price_cents: 1, sale_price_cents: null, public_status: "unavailable" };
  assert.equal(selectActivePriceSchedule([schedule], "product", "product", Date.parse("2026-08-15T00:00:00Z")), null);
});

test("checkout rejects unavailable products, variants, options, packages, components, and parents", () => {
  const base = { public_status: "active", regular_price_cents: 100_000, sale_price_cents: null, sale_starts_at: null, sale_ends_at: null };
  const checkoutProduct = { ...base, id: "p", slug: "lymow-one-plus", brand: "Lymow", name: "Lymow One Plus" };
  const variant = { ...base, id: "v", product_id: "p", variant_slug: "lymow-one-plus-5a", name: "5A configuration", description: null, sku: null };
  const charger = { ...base, id: "charger", product_id: "p", option_slug: "lymow-5a-charger", name: "5A Charger", description: null, minimum_quantity: 0, maximum_quantity: 1 };
  const blade = { ...base, id: "blade", product_id: "p", option_slug: "blade", name: "Blade", description: null, minimum_quantity: 0, maximum_quantity: 1, accessory_listing_enabled: true, accessory_tab: "lymow", show_in_builder: true, accessory_action_type: "builder", contact_for_pricing: false };
  const request = { selection: { productId: "p", variantId: "v", purchaseMode: "standard", packageId: null, options: [{ optionId: "blade", quantity: 1 }], includeBaseProduct: false } } as never;
  const catalog = { product: checkoutProduct, variants: [variant], options: [charger, blade], packages: [], variantOptions: [{ id: "link", variant_id: "v", option_id: "charger", relationship_type: "defines_variant" }], packageItems: [] };
  assert.doesNotThrow(() => validateCheckoutEligibility(request, catalog));
  for (const inactiveCatalog of [
    { ...catalog, product: { ...checkoutProduct, public_status: "unavailable" } },
    { ...catalog, variants: [{ ...variant, public_status: "unavailable" }] },
    { ...catalog, options: [charger, { ...blade, public_status: "unavailable" }] },
    { ...catalog, options: [{ ...charger, public_status: "unavailable" }, blade] },
  ]) {
    assert.throws(() => validateCheckoutEligibility(request, inactiveCatalog), /currently unavailable/);
  }
  const yarboProduct = { ...checkoutProduct, slug: "yarbo", brand: "Yarbo", name: "Yarbo" };
  const yarboModule = { ...blade, id: "module", option_slug: "yarbo-mower-module", name: "Mower Module", accessory_listing_enabled: false, accessory_tab: null, show_in_builder: false, accessory_action_type: null };
  const catalogPackage = { ...base, id: "pkg", product_id: "p", package_slug: "yarbo-package", package_name: "Yarbo Package", description: null };
  const packageRequest = { selection: { productId: "p", variantId: null, purchaseMode: "complete-system", packageId: "pkg", options: [], includeBaseProduct: false } } as never;
  const packageCatalog = { product: yarboProduct, variants: [], options: [yarboModule], packages: [catalogPackage], variantOptions: [], packageItems: [{ id: "package-item", package_id: "pkg", option_id: "module", quantity: 1, included_in_package_price: true }] };
  assert.doesNotThrow(() => validateCheckoutEligibility(packageRequest, packageCatalog));
  assert.throws(() => validateCheckoutEligibility(packageRequest, { ...packageCatalog, packages: [{ ...catalogPackage, public_status: "unavailable" }] }), /currently unavailable/);
  assert.throws(() => validateCheckoutEligibility(packageRequest, { ...packageCatalog, options: [{ ...yarboModule, public_status: "unavailable" }] }), /currently unavailable/);
  const resolver = source("lib/checkout/pricing-resolver.ts");
  assert.match(resolver, /getSupabaseServiceClient/);
  assert.match(resolver, /catalog_package_items/);
  assert.match(resolver, /catalog_price_schedules/);
});

test("manipulated service selections remain outside the existing checkout contract", () => {
  const payload = { requestId: "11111111-1111-4111-8111-111111111111", paymentMethod: "card", selection: { productId: "11111111-1111-4111-8111-111111111111", variantId: null, purchaseMode: "standard", packageId: null, options: [], includeBaseProduct: false, services: [{ serviceId: "x" }] }, customer: { name: "Test Customer", email: "test@example.com", phone: null }, referral: null, shippingAddress: { line1: "1 Main", line2: null, city: "Town", state: "MO", postalCode: "63701", country: "US" } };
  assert.throws(() => parseCheckoutRequest(payload), /Invalid or unknown selection properties/);
});

test("pricing precedence, dealer cost privacy, and payment master switches stay isolated", () => {
  assert.doesNotMatch(source("lib/catalog/availability.ts"), /regularPrice|salePrice|dealer|paymentMethod/);
  assert.doesNotMatch(source("lib/catalog/load-public-catalog.ts"), /catalog_private|dealer_cost/);
  assert.doesNotMatch(source("app/admin/pricing/page.tsx"), /checkout_payment_method_settings|paymentMethodIs/);
});
