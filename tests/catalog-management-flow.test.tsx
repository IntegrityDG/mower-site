import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import ProductConfiguration from "../components/customer-paths/purchase/ProductConfiguration";
import ProductSelection from "../components/customer-paths/purchase/ProductSelection";
import { productRequestedByBuildSearch } from "../components/customer-paths/purchase/NationwidePurchaseFlow";
import { EquipmentCards } from "../components/equipment/EquipmentCatalog";
import { catalogPackageIsAvailable } from "../lib/catalog/availability";
import { packageComponentName, publicPackageComponentIsAvailable } from "../lib/catalog/package-components";
import { productBuildIsComplete, resolveBuildSelection } from "../lib/catalog/selection";
import { findCatalogProductBySlug } from "../lib/catalog/product-routing";
import { priceFromRow } from "../lib/catalog/public-price";
import { managedProductStartingPrice } from "../lib/catalog/starting-price";
import { isSelfServiceProduct, salesModeForCatalogProduct } from "../lib/catalog/sales-mode";
import { yarboCorePrice } from "../lib/catalog/yarbo-core";
import { checkoutSubmissionKind } from "../lib/checkout/handoff";
import { resolveEquipmentCatalogPricing } from "../lib/checkout/equipment-pricing";
import { resolveCheckoutPackageComponents, type CheckoutCatalog } from "../lib/checkout/eligibility";
import { parseCheckoutRequest } from "../lib/checkout/request-schema";
import { safeProjection } from "../lib/checkout/order-projection";
import { applyCatalogSnapshots } from "../lib/custom-invoices/catalog-snapshot";
import type { CheckoutRequest } from "../lib/checkout/types";
import { checkoutCatalog, checkoutRequest, during, publicProduct, priceRow } from "./helpers/yarbo-preorder-fixture";

const saleStart = "2026-10-06T05:00:00.000Z";
const saleEnd = "2026-10-13T05:00:00.000Z";
const saleNow = Date.parse(saleStart);

function bundleFixture(): CheckoutCatalog {
  const base = priceRow(100_000);
  return {
    product: { ...base, id: "machine", slug: "new-machine", brand: "New Brand", name: "New Machine", public_status: "active", admin_managed: true },
    variants: [], options: [], variantOptions: [], corePrices: [],
    packages: [{ ...base, id: "bundle", product_id: "machine", package_slug: "mixed-bundle", package_name: "Machine + Batteries", description: "Intentional package discount", public_status: "active", admin_managed: true, regular_price_cents: 50_000 }],
    packageItems: [
      { id: "machine-link", package_id: "bundle", option_id: null, component_product_id: "machine", quantity: 1, included_in_package_price: true },
      { id: "battery-link", package_id: "bundle", option_id: "battery", quantity: 2, included_in_package_price: true },
      { id: "attachment-link", package_id: "bundle", option_id: null, component_variant_id: "attachment", quantity: 1, included_in_package_price: true },
    ],
    componentProducts: [{ ...base, id: "battery-parent", slug: "battery-brand", brand: "Other Brand", name: "Battery Platform", public_status: "active" }],
    componentOptions: [{ ...base, id: "battery", product_id: "battery-parent", option_slug: "battery", name: "Battery", description: "Battery description", public_status: "active", minimum_quantity: 0, maximum_quantity: 5 }],
    componentVariants: [{ ...base, id: "attachment", product_id: "battery-parent", variant_slug: "attachment", name: "Attachment", description: "Attachment configuration", sku: "ATTACHMENT-1", public_status: "active" }],
  };
}

function bundleRequest(): CheckoutRequest {
  return { ...checkoutRequest(), selection: { productId: "machine", variantId: null, purchaseMode: "standard", packageId: "bundle", options: [], includeBaseProduct: false } };
}

test("mixed-brand product, variant, and option quantities remain included at one independent package price", () => {
  const catalog = bundleFixture();
  const snapshot = resolveEquipmentCatalogPricing(bundleRequest(), catalog, [], during);
  assert.equal(snapshot.chargeableItems.length, 1);
  assert.equal(snapshot.chargeableItems[0].itemType, "package");
  assert.equal(snapshot.totalCents, 50_000);
  assert.deepEqual(snapshot.includedPackageComponents.map((item) => [item.componentSourceType, item.name, item.quantity, item.unitAmountCents]), [
    ["product", "New Machine", 1, 0], ["option", "Battery", 2, 0], ["variant", "Attachment", 1, 0],
  ]);
  assert.equal(snapshot.includedPackageComponents[2].sku, "ATTACHMENT-1");
  assert.equal(snapshot.catalogSources.some((source) => source.table === "catalog_products" && source.id === "machine"), true);
  assert.equal(snapshot.catalogSources.some((source) => source.table === "catalog_product_variants" && source.id === "attachment"), true);
  assert.equal(JSON.stringify(snapshot).includes("dealer"), false);
  catalog.componentOptions![0].regular_price_cents = 999_999;
  assert.equal(resolveEquipmentCatalogPricing(bundleRequest(), catalog, [], during).totalCents, 50_000);
});

test("package snapshots retain names and quantities after components change or retire", () => {
  const catalog = bundleFixture();
  const snapshot = resolveEquipmentCatalogPricing(bundleRequest(), catalog, [], during);
  catalog.componentOptions![0].name = "Replacement Battery";
  catalog.componentOptions![0].retired_at = "2026-10-01T00:00:00Z";
  assert.deepEqual(safeProjection({ snapshot } as never).items.map((item) => [item.name, item.quantity]), [
    ["Machine + Batteries", 1], ["New Machine", 1], ["Battery", 2], ["Attachment", 1],
  ]);
  assert.throws(() => resolveEquipmentCatalogPricing(bundleRequest(), catalog, [], during), /unavailable/);
});

test("generalized packages reject missing references, inactive parents, invalid quantities, duplicate identities, and quote-only components", () => {
  for (const mutate of [
    (catalog: CheckoutCatalog) => { catalog.componentOptions = []; },
    (catalog: CheckoutCatalog) => { catalog.componentProducts![0].retired_at = "2026-10-01T00:00:00Z"; },
    (catalog: CheckoutCatalog) => { catalog.packageItems[0].quantity = 0; },
    (catalog: CheckoutCatalog) => { catalog.packageItems[0].option_id = "battery"; },
    (catalog: CheckoutCatalog) => { catalog.packageItems.push({ ...catalog.packageItems[1], id: "duplicate" }); },
    (catalog: CheckoutCatalog) => { catalog.componentProducts![0].brand = "Pandag"; },
  ]) {
    const catalog = bundleFixture();
    mutate(catalog);
    assert.throws(() => resolveEquipmentCatalogPricing(bundleRequest(), catalog, [], during));
  }
});

test("a missing hidden component keeps the public package unavailable instead of becoming an empty valid package", () => {
  assert.equal(catalogPackageIsAvailable({ isAvailable: true, items: [{ optionId: "hidden", quantity: 2, includedInPackagePrice: true, option: null, component: null }] }), false);
  const catalog = bundleFixture();
  catalog.componentOptions![0].public_status = "hidden";
  assert.throws(() => resolveEquipmentCatalogPricing(bundleRequest(), catalog, [], during), /unavailable/);
});

test("public bundles with quote-only Pandag parents remain unavailable even when the stale component is active and priced", () => {
  for (const parentIdentity of [{ slug: "pandag-g1", brand: "Other Brand" }, { slug: "legacy-commercial-machine", brand: "PANDAG" }]) {
    const catalog = bundleFixture();
    Object.assign(catalog.componentProducts![0], parentIdentity);
    const available = publicPackageComponentIsAvailable(true, catalog.componentProducts![0]);
    assert.equal(available, false);
    const product = { ...publicProduct(), id: "machine", slug: "ids-catalog-bundles", name: "Catalog Bundles", brand: "IDS", adminManaged: false, hasManagedPackages: true, variants: [], optionGroups: [], ungroupedOptions: [],
      packages: [{ ...publicProduct().packages[0], id: "bundle", name: "Stale Commercial Bundle", adminManaged: true, corePrices: undefined,
        items: [{ optionId: "battery", quantity: 1, includedInPackagePrice: true, option: null, component: { kind: "option" as const, id: "battery", slug: "battery", name: "Battery", isAvailable: available } }] }] };
    assert.equal(catalogPackageIsAvailable(product.packages[0]), false);
    assert.equal(productBuildIsComplete(product, { variantId: "", packageId: "bundle", optionQuantities: {} }), false);
    const html = renderToStaticMarkup(<ProductConfiguration product={product} selection={{ variantId: "", packageId: "", optionQuantities: {} }} onSelectVariant={() => undefined} onSelectPackage={() => undefined} onChangeOptionQuantity={() => undefined} onSelectPurchaseMode={() => undefined} onToggleBaseProduct={() => undefined} />);
    assert.match(html, /disabled=""[^>]*[\s\S]*Stale Commercial Bundle/);
    assert.match(html, /Unavailable/);
    assert.throws(() => resolveEquipmentCatalogPricing(bundleRequest(), catalog, [], during), /quote-only/);
  }
  assert.equal(publicPackageComponentIsAvailable(true, { slug: "ordinary-product", brand: "New Brand", public_status: "active" }), true);
});

test("new Pandag product identities use the existing quote-only sales channel before customer selection or checkout", () => {
  const created = { ...publicProduct(), id: "new-pandag", slug: "new-pandag-model", brand: "Pandag", name: "New Pandag Product", adminManaged: true,
    salesMode: salesModeForCatalogProduct({ slug: "new-pandag-model", brand: "Pandag" }) };
  assert.equal(created.salesMode, "quote_only");
  assert.equal(salesModeForCatalogProduct({ slug: "pandag-g1", brand: "Pandag" }), "quote_only");
  assert.equal(salesModeForCatalogProduct({ slug: "new-machine", brand: "Other Brand" }), "self_service");
  assert.equal(isSelfServiceProduct(created), false);
  assert.equal(productRequestedByBuildSearch({ products: [created], generatedAt: "" }, "?product=new-pandag-model"), null);
  assert.equal(checkoutSubmissionKind(created, "pay-in-full"), "quote");
  const html = renderToStaticMarkup(<ProductSelection products={[created].filter(isSelfServiceProduct)} selectedProductId="" onSelectProduct={() => undefined} />);
  assert.doesNotMatch(html, /Select New Pandag Product/);
});

test("new managed packages work under an existing accessories parent without enabling its standalone checkout", () => {
  const catalog = bundleFixture();
  catalog.product.admin_managed = false;
  catalog.product.slug = "ids-aftermarket";
  assert.equal(resolveEquipmentCatalogPricing(bundleRequest(), catalog, [], during).subtotalCents, 50_000);
  const request = bundleRequest();
  request.selection.packageId = null;
  assert.throws(() => resolveEquipmentCatalogPricing(request, catalog, [], during), /quote-only/);
});

test("accessory-only bundles use the generic family selector and their own public price without adding a Yarbo Core", () => {
  const catalog = bundleFixture();
  catalog.product.admin_managed = false;
  catalog.product.slug = "ids-catalog-bundles";
  catalog.product.name = "Catalog Bundles";
  catalog.product.show_public_price = false;
  catalog.product.contact_for_pricing = true;
  catalog.product.regular_price_cents = null;
  catalog.packageItems = [catalog.packageItems[1]];
  const snapshot = resolveEquipmentCatalogPricing(bundleRequest(), catalog, [], during);
  assert.equal(snapshot.variant, null);
  assert.equal(snapshot.chargeableItems.length, 1);
  assert.equal(snapshot.chargeableItems[0].sourceId, "bundle");
  assert.deepEqual(snapshot.includedPackageComponents.map((item) => [item.name, item.quantity]), [["Battery", 2]]);
  const product = { ...publicProduct(), id: "machine", slug: "ids-catalog-bundles", name: "Catalog Bundles", brand: "IDS", adminManaged: false, hasManagedPackages: true, variants: [], optionGroups: [], ungroupedOptions: [], regularPriceCents: null, currentPriceCents: null, showPublicPrice: false, contactForPricing: true,
    packages: [{ ...publicProduct().packages[0], id: "bundle", name: "Two Batteries", adminManaged: true, corePrices: undefined, regularPriceCents: 50_000, currentPriceCents: 50_000,
      items: [{ optionId: "battery", quantity: 2, includedInPackagePrice: true, option: null, component: { kind: "option" as const, id: "battery", slug: "battery", name: "Battery", isAvailable: true } }] }] };
  assert.equal(managedProductStartingPrice(product)?.currentPriceCents, 50_000);
  assert.equal(checkoutSubmissionKind(product, "pay-in-full"), "card");
  const selectionHtml = renderToStaticMarkup(<ProductSelection products={[product]} selectedProductId="" onSelectProduct={() => undefined} />);
  assert.match(selectionHtml, /Select Catalog Bundles/);
  const configurationHtml = renderToStaticMarkup(<ProductConfiguration product={product} selection={{ variantId: "", packageId: "bundle", optionQuantities: {} }} onSelectVariant={() => undefined} onSelectPackage={() => undefined} onChangeOptionQuantity={() => undefined} onSelectPurchaseMode={() => undefined} onToggleBaseProduct={() => undefined} />);
  assert.match(configurationHtml, /Battery x 2/);
  assert.doesNotMatch(configurationHtml, /Choose your Core|Y40P|Core Platform/);
  assert.match(renderToStaticMarkup(<EquipmentCards products={[product]} aftermarketEnabled={false} />), /\$500/);
  product.packages[0].isAvailable = false;
  assert.equal(managedProductStartingPrice(product), null);
});

test("known variant incompatibility and unavailable defining equipment remain enforced in a mixed bundle", () => {
  const catalog = bundleFixture();
  catalog.variantOptions.push({ id: "excluded", variant_id: "attachment", option_id: "battery", relationship_type: "excluded" });
  assert.throws(() => resolveCheckoutPackageComponents(catalog, "bundle", during), /incompatible/);
  catalog.variantOptions[0].relationship_type = "defines_variant";
  catalog.componentOptions![0].public_status = "unavailable";
  assert.throws(() => resolveCheckoutPackageComponents(catalog, "bundle", during), /unavailable/);
});

test("Y40P package sale works with blank Everyday, shared MSRP fallback, and exclusive expiration", () => {
  const catalog = checkoutCatalog();
  const variant = catalog.variants[1];
  Object.assign(variant, { sale_starts_at: saleStart, sale_ends_at: saleEnd });
  const pair = catalog.corePrices!.find((row) => row.package_id === "yarbo-pro-snow" && row.core_variant_id === "y40p")!;
  Object.assign(pair, { display_msrp_price_cents: 979_900, regular_price_cents: null, sale_price_cents: 929_900, sale_starts_at: saleStart, sale_ends_at: saleEnd });
  assert.equal(resolveEquipmentCatalogPricing(checkoutRequest(), catalog, [], saleNow).subtotalCents, 929_900);
  assert.equal(resolveEquipmentCatalogPricing(checkoutRequest(), catalog, [], Date.parse(saleEnd) - 1).subtotalCents, 929_900);
  variant.public_status = "active";
  assert.throws(() => resolveEquipmentCatalogPricing(checkoutRequest(), catalog, [], Date.parse(saleEnd)), /valid current price/);
  assert.equal(resolveEquipmentCatalogPricing(checkoutRequest(), catalog, [], Date.parse(saleEnd), false).subtotalCents, 979_900);
  const publicPrice = priceFromRow({ ...priceRow(null), ...pair }, Date.parse(saleEnd), false);
  assert.equal(publicPrice.currentPriceCents, 979_900);
});

test("Yarbo generalized package components cannot insert either physical Core or charge included components twice", () => {
  for (const component of [
    { component_product_id: "yarbo", component_variant_id: null },
    { component_product_id: null, component_variant_id: "y40" },
    { component_product_id: null, component_variant_id: "y40p" },
  ]) {
    const catalog = checkoutCatalog();
    catalog.packageItems.push({ id: "physical-core", package_id: "yarbo-pro-snow", option_id: null, quantity: 1, included_in_package_price: true, ...component });
    assert.throws(() => resolveEquipmentCatalogPricing(checkoutRequest(), catalog, [], during), /Core separately/);
  }
  const catalog = checkoutCatalog();
  const snapshot = resolveEquipmentCatalogPricing(checkoutRequest(), catalog, [], during);
  assert.equal(snapshot.chargeableItems.filter((item) => item.itemType === "package").length, 1);
  assert.equal(snapshot.chargeableItems.some((item) => item.itemType === "variant"), false);
});

test("one public Yarbo package keeps both Core contexts without duplicating package identity", () => {
  const product = publicProduct();
  const ids = product.packages.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const item of product.packages) {
    assert.equal(item.corePrices?.length, 2);
    for (const core of product.variants) assert.notEqual(yarboCorePrice(product, core, item), null);
  }
  const html = renderToStaticMarkup(<ProductConfiguration product={product} selection={{ variantId: "y40", packageId: "", optionQuantities: {}, purchaseMode: "complete-system" }} onSelectVariant={() => undefined} onSelectPackage={() => undefined} onChangeOptionQuantity={() => undefined} onSelectPurchaseMode={() => undefined} onToggleBaseProduct={() => undefined} />);
  assert.ok(html.indexOf("Choose one complete package") < html.indexOf("Choose your Core"));
});

test("new managed package UI shows each component quantity and completes without a separate variant", () => {
  const product = { ...publicProduct(), id: "machine", slug: "new-machine", name: "New Machine", brand: "New Brand", adminManaged: true, variants: [], packages: [{ ...publicProduct().packages[0], id: "bundle", name: "Machine + Batteries", adminManaged: true,
    items: [{ optionId: "", quantity: 1, includedInPackagePrice: true, option: null, component: { kind: "product" as const, id: "machine", slug: "new-machine", name: "New Machine", isAvailable: true } }, { optionId: "battery", quantity: 2, includedInPackagePrice: true, option: null, component: { kind: "option" as const, id: "battery", slug: "battery", name: "Battery", isAvailable: true } }], corePrices: undefined }] };
  const selection = { variantId: "", packageId: "bundle", optionQuantities: {} };
  assert.equal(catalogPackageIsAvailable(product.packages[0]), true);
  assert.equal(productBuildIsComplete(product, selection), true);
  assert.equal(resolveBuildSelection(product, selection).priceItems.length, 1);
  assert.equal(packageComponentName(product.packages[0].items[1]), "Battery");
  const html = renderToStaticMarkup(<ProductConfiguration product={product} selection={selection} onSelectVariant={() => undefined} onSelectPackage={() => undefined} onChangeOptionQuantity={() => undefined} onSelectPurchaseMode={() => undefined} onToggleBaseProduct={() => undefined} />);
  assert.match(html, /Battery x 2/);
  assert.match(html, /Use individual configuration/);
  assert.equal(checkoutSubmissionKind(product, "pay-in-full"), "card");
  assert.equal(findCatalogProductBySlug({ products: [product], generatedAt: "" }, product.slug), product);
  assert.equal(findCatalogProductBySlug({ products: [{ ...product, adminManaged: false }], generatedAt: "" }, product.slug), null);
});

test("new standalone managed products use one authoritative product or variant price", () => {
  const catalog = bundleFixture();
  const request = bundleRequest();
  request.selection.packageId = null;
  assert.equal(resolveEquipmentCatalogPricing(request, catalog, [], during).subtotalCents, 100_000);
  catalog.variants = [{ ...catalog.componentVariants![0], id: "configuration", product_id: "machine", regular_price_cents: 75_000 }];
  request.selection.variantId = "configuration";
  const snapshot = resolveEquipmentCatalogPricing(request, catalog, [], during);
  assert.equal(snapshot.subtotalCents, 75_000);
  assert.equal(snapshot.chargeableItems.length, 1);
  catalog.product.retired_at = "2026-10-01T00:00:00Z";
  assert.throws(() => resolveEquipmentCatalogPricing(request, catalog, [], during), /unavailable/);
});

test("checkout request shape stays unchanged and client component/price/private-cost injection remains rejected", () => {
  const request = bundleRequest();
  const uuid = "11111111-1111-4111-8111-111111111111";
  request.selection.productId = uuid;
  request.selection.packageId = uuid;
  assert.doesNotThrow(() => parseCheckoutRequest(request));
  for (const field of ["components", "componentSourceType", "dealerCostCents", "priceCents"]) assert.throws(() => parseCheckoutRequest({ ...request, selection: { ...request.selection, [field]: [] } }), /unknown selection/);
});

test("Custom Invoice preserves selected package/Core reference, component description, and negotiated snapshot price", () => {
  const draft = { items: [{ sourceType: "package", catalogId: "package", catalogParentId: "y40p", unitPriceCents: 460_000, quantity: 1 }] };
  const result = applyCatalogSnapshots(draft as never, [{ id: "package", sourceType: "package", name: "Y40P / Machine + Batteries", description: "Included equipment: 2 × Battery.", sku: "Y40P", priceCents: 499_900, status: "active", purchaseState: "preorder", parentId: "y40p", parentName: "Y40P", availabilityWarning: true }]);
  assert.equal(result.items[0].catalogParentId, "y40p");
  assert.equal(result.items[0].unitPriceCents, 460_000);
  assert.equal(result.items[0].secondaryDescription, "Included equipment: 2 × Battery.");
});
