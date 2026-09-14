import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import ProductConfiguration from "../components/customer-paths/purchase/ProductConfiguration";
import YarboCoreComparison from "../components/equipment/YarboCoreComparison";
import YarboCorePrice from "../components/equipment/YarboCorePrice";
import { EquipmentCards } from "../components/equipment/EquipmentCatalog";
import { createPackageCorePriceAdminHandlers, validatePackageCorePricePatch, type PackageCorePriceAdminRow } from "../lib/admin-pricing/package-core-prices";
import { catalogAvailabilityFromPublicStatus } from "../lib/catalog/availability";
import { priceFromRow } from "../lib/catalog/public-price";
import { productBuildIsComplete, resolveBuildSelection } from "../lib/catalog/selection";
import type { CatalogOption, CatalogPackage, CatalogProduct, CatalogSpecification, CatalogVariant, ProductBuildSelection } from "../lib/catalog/types";
import { groupYarboPackages } from "../lib/catalog/yarbo";
import { yarboCoreCanBeSelected, yarboCorePrice } from "../lib/catalog/yarbo-core";
import { validateCheckoutEligibility, type CheckoutCatalog } from "../lib/checkout/eligibility";
import type { CheckoutRequest } from "../lib/checkout/types";
import { operationalPriceCents } from "../lib/checkout/operational-price";
import { yarboPackagePriceSource } from "../lib/checkout/yarbo-package-price";

const start = "2026-09-15T05:00:00.000Z";
const end = "2026-10-07T05:00:00.000Z";
const before = Date.parse("2026-09-14T12:00:00Z");
const during = Date.parse("2026-09-20T12:00:00Z");
const after = Date.parse("2026-10-08T12:00:00Z");

const promotionBoundaries = [
  ["one millisecond before start", Date.parse(start) - 1, false],
  ["exact start", Date.parse(start), true],
  ["during promotion", during, true],
  ["one millisecond before end", Date.parse(end) - 1, true],
  ["exact exclusive end", Date.parse(end), false],
  ["one millisecond after end", Date.parse(end) + 1, false],
] as const;

function assertPromotionBoundaries(row: Parameters<typeof priceFromRow>[0], msrp: number, sale: number) {
  for (const [label, at, isActive] of promotionBoundaries) {
    const expected = isActive ? sale : msrp;
    assert.equal(priceFromRow(row, at).currentPriceCents, expected, `public price: ${label}`);
    assert.equal(operationalPriceCents(row, at, true), expected, `checkout price: ${label}`);
  }
}

const mappings = [
  ["yarbo-snow-blower", "Snow Blower", 479900, 779900, 709900, ["snow"]],
  ["yarbo-lawn-mower-pro", "Lawn Mower Pro", 579900, 759900, 689900, ["mower"]],
  ["yarbo-leaf-blower", "Blower", 459900, 669900, 599900, ["blower"]],
  ["yarbo-snow-leaf", "Snow Blower + Blower", 579900, 889900, 809900, ["snow", "blower"]],
  ["yarbo-pro-snow", "Lawn Mower Pro + Snow Blower", 699900, 979900, 899900, ["mower", "snow"]],
  ["yarbo-pro-leaf", "Lawn Mower Pro + Blower", 679900, 869900, 789900, ["mower", "blower"]],
  ["yarbo-pro-snow-leaf", "Lawn Mower Pro + Snow Blower + Blower", 779900, 1089900, 999900, ["mower", "snow", "blower"]],
] as const;

const baseRow = (regular: number | null, sale: number | null = null) => ({
  display_msrp_price_cents: null,
  regular_price_cents: regular,
  sale_price_cents: sale,
  sale_starts_at: sale === null ? null : start,
  sale_ends_at: sale === null ? null : end,
  promotion_label: sale === null ? null : "Early Access",
  show_public_price: true,
  contact_for_pricing: false,
});

const optionSlug = { mower: "yarbo-lawn-mower-pro-module", snow: "yarbo-snow-blower-module", blower: "yarbo-leaf-blower-module" };
const modules = Object.entries(optionSlug).map(([key, slug]): CatalogOption => ({
  id: key, slug, name: key === "mower" ? "Lawn Mower Pro Module" : key === "snow" ? "Snow Blower Module" : "Blower Module",
  description: null, optionGroupId: null, isRequired: false, isIncluded: false, isRecommended: false,
  defaultQuantity: 0, minimumQuantity: 0, maximumQuantity: 1, sortOrder: 1,
  ...catalogAvailabilityFromPublicStatus("active"), ...priceFromRow(baseRow(100000), before),
}));

function spec(slug: string, label: string, value: string): CatalogSpecification {
  return { slug, label, category: "performance", dataType: "text", canonicalUnit: null, numericValue: null,
    textValue: value, booleanValue: null, textValues: null, displayValue: value, sortOrder: 1 };
}
function core(id: "y40" | "y40p", status: "active" | "coming_soon" = id === "y40" ? "active" : "coming_soon"): CatalogVariant {
  const premium = id === "y40p";
  return {
    id, slug: `yarbo-${id}`, sku: null, name: premium ? "Y40P Core" : "Y40 Core", description: premium ? "Premium next-generation Core" : "Proven current Core",
    sortOrder: premium ? 2 : 1, definingOptionIds: [], ...catalogAvailabilityFromPublicStatus(status),
    ...priceFromRow(baseRow(premium ? 559900 : null, premium ? 499900 : null), before),
    specifications: { applications: [], power: [spec("yarbo_drive_system", "Drive system", premium ? "Dual Hub Motors; gearbox-free drivetrain" : "Dual Drive Motors")],
      performance: [
        spec("yarbo_max_drive_speed", "Maximum drive speed", premium ? "1.2 m/s" : "0.65 m/s"),
        spec("yarbo_mowing_per_charge", "Lawn mowing per charge", premium ? "Up to 0.3 acre" : "Up to 0.25 acre"),
        spec("yarbo_daily_mowing", "Daily mowing", premium ? "Up to 2 acres/day" : "Up to 1.7 acres/day"),
        spec("yarbo_weekly_coverage", "Weekly mowing coverage", premium ? "Up to 7 acres" : "Up to 6 acres"),
        spec("yarbo_snow_per_charge", "Snow clearing per charge", premium ? "Up to 7,000 sq ft" : "Up to 6,000 sq ft"),
        spec("yarbo_efficiency", "Overall efficiency", premium ? "Approximately 15% higher" : "Reference"),
        spec("yarbo_max_climb", "Maximum climb", "Up to 70% (35 degrees)"),
        spec("yarbo_operating_noise", "Operating noise", "Approximately 60 dB"),
      ], battery: [], cuttingHeight: [], physical: [] },
  };
}

function fixture(status: "coming_soon" | "active" = "coming_soon") {
  const packages: CatalogPackage[] = mappings.map(([slug, name, y40, msrp, sale, parts]) => ({
    id: slug, slug, name, description: null, sortOrder: 1,
    items: parts.map((part) => ({ optionId: part, quantity: 1, includedInPackagePrice: true, option: modules.find((module) => module.id === part)! })),
    ...catalogAvailabilityFromPublicStatus("active"), ...priceFromRow(baseRow(y40), before),
    corePrices: [
      { id: `${slug}-y40`, coreVariantId: "y40", priceMode: "package", ...catalogAvailabilityFromPublicStatus("active"), ...priceFromRow(baseRow(y40), before) },
      { id: `${slug}-y40p`, coreVariantId: "y40p", priceMode: "core_specific", ...catalogAvailabilityFromPublicStatus("active"), ...priceFromRow(baseRow(msrp, sale), before) },
    ],
  }));
  const product: CatalogProduct = {
    id: "yarbo", slug: "yarbo", brand: "Yarbo", name: "Yarbo Core", homepageSummary: null, fullDescription: null,
    capabilityLevel: null, propertyScale: null, customerGuidance: null, brochureUrl: null, videoUrl: null,
    imageUrl: "/yarbo.png", imageAlt: "Yarbo", sortOrder: 1, salesMode: "self_service", page: null, media: [],
    variants: [core("y40"), core("y40p", status)], optionGroups: [], ungroupedOptions: modules, packages,
    ...catalogAvailabilityFromPublicStatus("active"), ...priceFromRow(baseRow(374900), before),
  };
  return product;
}

const selection = (variantId: string, packageId: string = mappings[4][0]): ProductBuildSelection => ({
  variantId, packageId, purchaseMode: "complete-system", includeBaseProduct: false, optionQuantities: {},
});
const renderConfiguration = (product: CatalogProduct, selected = selection("y40")) => renderToStaticMarkup(<ProductConfiguration
  product={product} selection={selected} onSelectVariant={() => {}} onSelectPackage={() => {}}
  onSelectPurchaseMode={() => {}} onToggleBaseProduct={() => {}} onChangeOptionQuantity={() => {}} />);

test("one set of seven catalog packages retains every approved Y40 price and exposes the matching Y40P price", () => {
  const product = fixture();
  assert.equal(product.packages.length, 7);
  assert.equal(new Set(product.packages.map((item) => item.id)).size, 7);
  assert.equal(groupYarboPackages(product.packages).flatMap((group) => group.packages).length, 7);
  for (const [slug, , y40, msrp, sale] of mappings) {
    const catalogPackage = product.packages.find((item) => item.slug === slug)!;
    assert.equal(yarboCorePrice(product, product.variants[0], catalogPackage)?.currentPriceCents, y40);
    const premium = yarboCorePrice(product, product.variants[1], catalogPackage)!;
    assert.equal(premium.regularPriceCents, msrp);
    assert.equal(premium.salePriceCents, sale);
    const html = renderToStaticMarkup(<YarboCorePrice core={product.variants[1]} price={premium} />);
    assert.match(html, new RegExp((msrp / 100).toLocaleString("en-US")));
    assert.match(html, new RegExp((sale / 100).toLocaleString("en-US")));
    assert.match(html, /Early Access/);
    assert.doesNotMatch(html, /dealer|margin|cost/i);
  }
});

test("builder uses one radio group, keeps the selected package modules, and prevents a Coming Soon Core", () => {
  const product = fixture();
  const html = renderConfiguration(product);
  assert.match(html, /name="yarbo-complete-core"/);
  assert.equal((html.match(/name="yarbo-complete-core"/g) ?? []).length, 2);
  assert.match(html, /Y40P Core/);
  assert.match(html, /Coming Soon/);
  assert.match(html, /<input(?=[^>]*value="y40p")(?=[^>]*disabled)[^>]*>/);
  assert.match(html, /<input(?=[^>]*value="y40")(?=[^>]*checked)[^>]*>/);
  assert.equal(resolveBuildSelection(product, selection("y40")).packageIncludedItems.length, 2);
  assert.equal(productBuildIsComplete(product, selection("y40")), true);
  assert.equal(productBuildIsComplete(product, selection("y40p")), false);
  assert.equal(yarboCoreCanBeSelected(product, product.variants[1], product.packages[4]), false);

  const active = fixture("active");
  assert.equal(yarboCoreCanBeSelected(active, active.variants[1], active.packages[4]), true);
  assert.equal(productBuildIsComplete(active, selection("y40p")), true);
  assert.match(renderConfiguration(active, selection("y40p")), /<input(?=[^>]*value="y40p")(?=[^>]*checked)[^>]*>/);
  assert.equal(resolveBuildSelection(active, selection("y40p")).equipmentTotalCents, 979900);
});

test("Core-only selection and comparison preserve exact Core identity and source-qualified specifications", () => {
  const product = fixture("active");
  const individual: ProductBuildSelection = { variantId: "y40p", packageId: "", purchaseMode: "individual-equipment", includeBaseProduct: true, optionQuantities: { snow: 1 } };
  assert.equal(resolveBuildSelection(product, individual).priceItems[0].name, "Y40P Core");
  assert.equal(resolveBuildSelection(product, individual).priceItems.length, 2);
  assert.equal(resolveBuildSelection(product, individual).equipmentTotalCents, 659900);
  const html = renderToStaticMarkup(<YarboCoreComparison product={fixture()} />);
  for (const value of ["Dual Drive Motors", "gearbox-free drivetrain", "0.65 m/s", "1.2 m/s", "0.25 acre", "0.3 acre", "1.7 acres", "2 acres", "6 acres", "7 acres", "6,000 sq ft", "7,000 sq ft", "Approximately 15% higher", "70% (35 degrees)", "Approximately 60 dB"]) assert.ok(html.includes(value), value);
  assert.match(html, /proven Y-Series Core/i);
  assert.match(html, /premium next-generation Core/i);
});

test("equipment discovery status follows the catalog when Y40P becomes available", () => {
  const pending = renderToStaticMarkup(<EquipmentCards products={[fixture()]} aftermarketEnabled={false} />);
  const available = renderToStaticMarkup(<EquipmentCards products={[fixture("active")]} aftermarketEnabled={false} />);
  assert.match(pending, /Y40P: Coming Soon/);
  assert.match(available, /Y40P: Available/);
  assert.doesNotMatch(available, /Y40P: Coming Soon/);
});

function checkoutCatalog(status: "coming_soon" | "active" = "coming_soon"): CheckoutCatalog {
  const p = (id: string, regular: number, sale: number | null = null) => ({ id, public_status: "active", regular_price_cents: regular, sale_price_cents: sale, sale_starts_at: sale === null ? null : start, sale_ends_at: sale === null ? null : end });
  const options = modules.map((module) => ({ ...p(module.id, 100000), product_id: "yarbo", option_slug: module.slug, name: module.name, description: null, minimum_quantity: 0, maximum_quantity: 1 }));
  return {
    product: { ...p("yarbo", 374900), slug: "yarbo", brand: "Yarbo", name: "Yarbo Core" },
    variants: [
      { ...p("y40", 0), product_id: "yarbo", variant_slug: "yarbo-y40", name: "Y40 Core", description: null, sku: null },
      { ...p("y40p", 559900, 499900), public_status: status, product_id: "yarbo", variant_slug: "yarbo-y40p", name: "Y40P Core", description: null, sku: null },
    ],
    options,
    packages: mappings.map(([slug, name, y40]) => ({ ...p(slug, y40), product_id: "yarbo", package_slug: slug, package_name: name, description: null })),
    variantOptions: ["y40", "y40p"].flatMap((coreId) => options.map((option) => ({ id: `${coreId}-${option.id}`, variant_id: coreId, option_id: option.id, relationship_type: "compatible" }))),
    packageItems: mappings.flatMap(([slug, , , , , parts]) => parts.map((part) => ({ id: `${slug}-${part}`, package_id: slug, option_id: part, quantity: 1, included_in_package_price: true }))),
    corePrices: mappings.flatMap(([slug, , , msrp, sale]) => [
      { ...p(`${slug}-y40`, 0), product_id: "yarbo", package_id: slug, core_variant_id: "y40", price_mode: "package" as const, regular_price_cents: null, show_public_price: true, contact_for_pricing: false },
      { ...p(`${slug}-y40p`, msrp, sale), product_id: "yarbo", package_id: slug, core_variant_id: "y40p", price_mode: "core_specific" as const, show_public_price: true, contact_for_pricing: false },
    ]),
  };
}
const checkoutRequest = (coreId: string, packageId: string = mappings[4][0]) => ({
  selection: { productId: "yarbo", variantId: coreId, packageId, purchaseMode: "complete-system", includeBaseProduct: false, options: [] },
}) as unknown as CheckoutRequest;

test("server checkout rejects forged Coming Soon requests and invalid package/Core relationships", () => {
  const pending = checkoutCatalog();
  assert.throws(() => validateCheckoutEligibility(checkoutRequest("y40p"), pending), /Coming Soon/);
  assert.equal(validateCheckoutEligibility(checkoutRequest("y40"), pending).variant?.name, "Y40 Core");
  const active = checkoutCatalog("active");
  assert.equal(validateCheckoutEligibility(checkoutRequest("y40p"), active).variant?.name, "Y40P Core");
  assert.throws(() => validateCheckoutEligibility(checkoutRequest("y40p"), { ...active, corePrices: active.corePrices?.filter((row) => !(row.package_id === mappings[4][0] && row.core_variant_id === "y40p")) }), /combination is not available/);
  assert.throws(() => validateCheckoutEligibility(checkoutRequest("y40p"), { ...active, corePrices: active.corePrices?.map((row) => row.core_variant_id === "y40p" ? { ...row, price_mode: "package" as const } : row) }), /combination is not available/);
  assert.throws(() => validateCheckoutEligibility(checkoutRequest(""), active), /Choose one Yarbo Core/);
});

test("server price source is the exact package/Core row and its scheduled sale, independent of availability", () => {
  const active = checkoutCatalog("active");
  for (const [slug, , y40, msrp, sale] of mappings) {
    const y40Choice = validateCheckoutEligibility(checkoutRequest("y40", slug), active);
    const premiumChoice = validateCheckoutEligibility(checkoutRequest("y40p", slug), active);
    assert.equal(y40Choice.selectedPackage?.regular_price_cents, y40);
    assert.equal(premiumChoice.corePrice?.regular_price_cents, msrp);
    assert.equal(yarboPackagePriceSource(y40Choice.selectedPackage!, y40Choice.corePrice), y40Choice.selectedPackage);
    assert.equal(yarboPackagePriceSource(premiumChoice.selectedPackage!, premiumChoice.corePrice), premiumChoice.corePrice);
    assert.equal(operationalPriceCents(yarboPackagePriceSource(y40Choice.selectedPackage!, y40Choice.corePrice), during, true), y40);
    assert.equal(operationalPriceCents(premiumChoice.corePrice!, during, true), sale);
    assert.equal(operationalPriceCents(premiumChoice.corePrice!, before, true), msrp);
    assert.equal(operationalPriceCents(premiumChoice.corePrice!, after, true), msrp);
  }
  const pending = checkoutCatalog();
  assert.equal(operationalPriceCents(pending.corePrices![1], during, true), 709900);
  assert.throws(() => validateCheckoutEligibility(checkoutRequest("y40p", mappings[0][0]), pending), /Coming Soon/);
});

test("Y40P Core-only Early Access uses an exclusive end for public and checkout prices", () => {
  assertPromotionBoundaries(baseRow(559900, 499900), 559900, 499900);
  assert.equal(core("y40p").publicStatus, "coming_soon");
  assert.throws(() => validateCheckoutEligibility(checkoutRequest("y40p"), checkoutCatalog()), /Coming Soon/);
});

test("all seven Y40P package/Core rows use the same exclusive-end price resolution", () => {
  const catalog = checkoutCatalog("active");
  for (const [slug, , , msrp, sale] of mappings) {
    const selection = validateCheckoutEligibility(checkoutRequest("y40p", slug), catalog);
    const source = yarboPackagePriceSource(selection.selectedPackage!, selection.corePrice);
    assert.equal(source, selection.corePrice, `${slug}: Core-specific price source`);
    assert.equal(source.sale_starts_at, start, `${slug}: start`);
    assert.equal(source.sale_ends_at, end, `${slug}: end`);
    assertPromotionBoundaries({ ...baseRow(msrp, sale), ...source }, msrp, sale);
  }
});

test("public promotion timing and hidden-price handling are catalog-driven", () => {
  const row = baseRow(559900, 499900);
  assert.equal(priceFromRow(row, before).salePhase, "upcoming");
  assert.equal(priceFromRow(row, during).currentPriceCents, 499900);
  assert.equal(priceFromRow(row, after).currentPriceCents, 559900);
  assert.match(renderToStaticMarkup(<YarboCorePrice core={core("y40p")} price={priceFromRow(row, before)} />), /Early Access/);
  const hidden = renderToStaticMarkup(<YarboCorePrice core={core("y40p")} price={priceFromRow({ ...row, show_public_price: false }, before)} />);
  assert.match(hidden, /Contact for pricing/);
  assert.doesNotMatch(hidden, /5,599|4,999/);
});

const adminId = "11111111-1111-4111-8111-111111111111";
const adminRow: PackageCorePriceAdminRow = { id: adminId, packageId: "pkg", packageName: "Snow Blower", coreVariantId: "core", coreName: "Y40P Core", coreStatus: "coming_soon", priceMode: "core_specific", regularPriceCents: 779900, salePriceCents: 709900, saleStartsAt: start, saleEndsAt: end, promotionLabel: "Early Access", showPublicPrice: true, contactForPricing: false, publicStatus: "active" };
const adminValues = { regular_price_cents: 779900, sale_price_cents: 709900, sale_starts_at: start, sale_ends_at: end, promotion_label: "Early Access" };

test("package/Core pricing admin denies unauthenticated reads and writes", async () => {
  let wrote = false;
  const handlers = createPackageCorePriceAdminHandlers({ isAdmin: async () => false, read: async () => [adminRow], readValues: async () => adminValues, update: async () => { wrote = true; return adminRow; } });
  assert.equal((await handlers.GET()).status, 401);
  assert.equal((await handlers.PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ regular_price_cents: 1 }) }), { params: Promise.resolve({ id: adminId }) })).status, 401);
  assert.equal(wrote, false);
});

test("admin validates exact Core price and promotion fields and cannot edit inherited Y40 relationship", async () => {
  assert.equal(validatePackageCorePricePatch({ dealer_cost_cents: 1 }, adminValues).ok, false);
  assert.equal(validatePackageCorePricePatch({ regular_price_cents: null }, adminValues).ok, false);
  assert.equal(validatePackageCorePricePatch({ sale_ends_at: start }, adminValues).ok, false);
  let saved: Record<string, unknown> | null = null;
  const handlers = createPackageCorePriceAdminHandlers({ isAdmin: async () => true, read: async () => [adminRow], readValues: async (id) => id === adminId ? adminValues : null, update: async (_id, patch) => { saved = patch; return adminRow; } });
  const patch = (body: unknown, id = adminId) => handlers.PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
  assert.equal((await patch({ dealer_cost_cents: 1 })).status, 422);
  assert.equal((await patch({ regular_price_cents: 800000 })).status, 200);
  assert.deepEqual(saved, { regular_price_cents: 800000 });
  assert.equal((await patch({ regular_price_cents: 1 }, "22222222-2222-4222-8222-222222222222")).status, 404);
});
