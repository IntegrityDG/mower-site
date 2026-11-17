import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import ProductConfiguration from "../components/customer-paths/purchase/ProductConfiguration";
import LymowConfigurationChoices, { selectLymowConfiguration } from "../components/customer-paths/purchase/LymowConfigurationChoices";
import { catalogBrowseOptions } from "../components/equipment/EquipmentCatalog";
import MachineOfferSummary from "../components/equipment/MachineOfferSummary";
import PurchaseSummary from "../components/customer-paths/purchase/PurchaseSummary";
import { resolveBuildSelection } from "../lib/catalog/selection";
import type { CatalogOption, CatalogProduct, ProductBuildSelection } from "../lib/catalog/types";

const price = (cents: number) => ({ regularPriceCents: cents, salePriceCents: null, currentPriceCents: cents, showPublicPrice: true, contactForPricing: false, promotionLabel: null, saleIsActive: false });
function fixture(): CatalogProduct {
  const option = (id: string, slug: string, name: string): CatalogOption => ({ ...price(10000), id, slug, name, description: null, optionGroupId: null, isRequired: false, isIncluded: false, isRecommended: false, defaultQuantity: 0, minimumQuantity: 0, maximumQuantity: 1, sortOrder: 1, isAvailable: true, publicStatus: "active" });
  const kit = option("kit", "lymow-one-plus-enhanced-discharge-kit", "Enhanced Grass Discharge Kit");
  const variants = (["5a", "10a"] as const).map((id, index) => ({ ...price(239900 + index * 10000), id, slug: `lymow-one-plus-${id}`, name: `${id.toUpperCase()} Configuration`, sku: null, description: `${id.toUpperCase()} mower with matching charger`, sortOrder: index, definingOptionIds: [`charger-${id}`], isAvailable: true, publicStatus: "active" as const }));
  return { ...price(239900), id: "lymow", slug: "lymow-one-plus", brand: "Lymow", name: "Lymow One Plus", homepageSummary: null, fullDescription: null, capabilityLevel: null, propertyScale: null, customerGuidance: null, brochureUrl: null, videoUrl: null, imageUrl: "/test.webp", imageAlt: "Lymow", sortOrder: 1, salesMode: "self_service", isAvailable: true, publicStatus: "active", page: null, media: [], variants,
    hasManagedPackages: true, optionGroups: [], ungroupedOptions: [kit, option("other", "other", "Other accessory")],
    packages: variants.map((variant, i) => ({ ...price(245300 + i * 10000), id: `pkg-${variant.id}`, slug: `lymow-one-plus-${variant.id}-enhanced-discharge`, name: `${variant.name} + Enhanced Grass Discharge Kit`, description: "Mower and one enhanced discharge kit. No separate kit charge.", sortOrder: i, adminManaged: true, isAvailable: true, publicStatus: "active", items: [
      { optionId: "", quantity: 1, includedInPackagePrice: true, option: null, component: { kind: "variant", id: variant.id, slug: variant.slug, name: variant.name, isAvailable: true } },
      { optionId: kit.id, quantity: 1, includedInPackagePrice: true, option: kit, component: { kind: "option", id: kit.id, slug: kit.slug, name: kit.name, isAvailable: true } },
    ] })) };
}
const selection: ProductBuildSelection = { variantId: "5a", packageId: "", optionQuantities: {} };
const callbacks = { onSelectVariant() {}, onSelectPackage() {}, onChangeOptionQuantity() {}, onSelectPurchaseMode() {}, onToggleBaseProduct() {} };

test("generic Lymow configuration has four choices, with enhanced packages shown only once", () => {
  const html = renderToStaticMarkup(<ProductConfiguration product={fixture()} selection={selection} {...callbacks} />);
  assert.equal((html.match(/<h5[^>]*>5A Mower Only<\/h5>/g) ?? []).length, 1);
  assert.equal((html.match(/<h5[^>]*>10A Mower Only<\/h5>/g) ?? []).length, 1);
  assert.equal((html.match(/<h5[^>]*>5A \+ Enhanced Grass Discharge Kit<\/h5>/g) ?? []).length, 1);
  assert.equal((html.match(/<h5[^>]*>10A \+ Enhanced Grass Discharge Kit<\/h5>/g) ?? []).length, 1);
  assert.doesNotMatch(html, /Choose one complete package/);
  assert.match(html, /\$2,399/); assert.match(html, /\$2,553/);
});

for (const id of ["5a", "10a"]) {
  test(`${id} pinned configuration shows only its two choices and preserves exact selection`, () => {
    const product = fixture();
    const pinned = { ...product, variants: product.variants.filter(variant => variant.id === id) };
    const next = selectLymowConfiguration(product, selection, id, `pkg-${id}`, id)!;
    assert.equal(next.variantId, id); assert.equal(next.packageId, `pkg-${id}`);
    assert.equal(next.includeBaseProduct, false);
    const html = renderToStaticMarkup(<LymowConfigurationChoices product={pinned} selection={next} onSelectVariant={() => {}} onSelectPackage={() => {}} />);
    assert.equal((html.match(/<button /g) ?? []).length, 2);
    assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1);
    assert.doesNotMatch(html, new RegExp(`<h5[^>]*>${id === "5a" ? "10A" : "5A"}`));
    assert.equal(selectLymowConfiguration(product, next, id === "5a" ? "10a" : "5a", "", id), null);
  });
}

test("enhanced to mower-only clears package and kit; switching charger configuration cannot retain old bundle", () => {
  const product = fixture();
  const start = { ...selection, purchaseMode: "complete-system" as const, optionQuantities: { kit: 1, other: 1 } };
  const enhanced = selectLymowConfiguration(product, start, "5a", "pkg-5a")!;
  assert.deepEqual(enhanced.optionQuantities, { other: 1 });
  assert.equal(enhanced.purchaseMode, undefined);
  const plain = selectLymowConfiguration(product, enhanced, "5a")!;
  assert.equal(plain.packageId, ""); assert.equal(plain.variantId, "5a");
  const switched = selectLymowConfiguration(product, enhanced, "10a")!;
  assert.equal(switched.packageId, ""); assert.equal(switched.variantId, "10a");
  assert.equal(selectLymowConfiguration(product, enhanced, "10a", "pkg-5a"), null);
});

test("unavailable or malformed bundles cannot be selected; unavailable valid choice remains visible", () => {
  const product = fixture(); product.packages[0].isAvailable = false;
  assert.equal(selectLymowConfiguration(product, selection, "5a", "pkg-5a"), null);
  const html = renderToStaticMarkup(<LymowConfigurationChoices product={product} selection={selection} onSelectVariant={() => {}} onSelectPackage={() => {}} />);
  assert.match(html, /5A \+ Enhanced Grass Discharge Kit/); assert.match(html, /disabled=""/);
  product.packages[0].isAvailable = true; product.packages[0].items[1].quantity = 2;
  assert.equal(selectLymowConfiguration(product, selection, "5a", "pkg-5a"), null);
});

test("enhanced review charges exactly the package once and lists both included components", () => {
  const product = fixture();
  const next = selectLymowConfiguration(product, selection, "10a", "pkg-10a")!;
  const build = resolveBuildSelection(product, next);
  assert.equal(build.equipmentTotalCents, 255300);
  assert.equal(build.priceItems.length, 1);
  assert.equal(build.packageIncludedItems.length, 2);
  const html = renderToStaticMarkup(<PurchaseSummary selectedProduct={product} buildSelection={next} purchaseMethodLabel="Card" submissionKind="card" submitStatus="idle" submitError="" onSubmit={() => {}}
    customerInformation={{ fullName: "Buyer", email: "buyer@example.com", phone: "", shippingAddress: "1 Main", shippingZip: "65201", shippingState: "MO", shippingRegion: "Boone", referrerName: "", referrerEmail: "" }} />);
  assert.match(html, /10A Configuration/); assert.match(html, /Enhanced Grass Discharge Kit/); assert.match(html, /\$2,553/);
  assert.doesNotMatch(html, /\$2,499/);
});

test("other managed packages keep their existing package section", () => {
  const product = fixture(); product.packages.push({ ...product.packages[0], id: "other-pkg", slug: "custom-lymow-bundle", name: "Other Lymow Bundle" });
  const html = renderToStaticMarkup(<ProductConfiguration product={product} selection={selection} {...callbacks} />);
  assert.match(html, /Choose one complete package/); assert.match(html, /Other Lymow Bundle/);
});

test("Our Machines lists the same four live Lymow prices without advertising an unavailable kit", () => {
  const product = fixture();
  const render = () => renderToStaticMarkup(<MachineOfferSummary product={product} />);
  const html = render();
  for (const price of ["$2,399", "$2,453", "$2,499", "$2,553"]) assert.ok(html.includes(price), price);
  assert.equal((html.match(/Mower only/g) ?? []).length, 2);
  product.packages[0].items[1].component!.isAvailable = false;
  assert.doesNotMatch(render(), /\$2,453/);
});

test("the bundle-only kit stays in both package cards but never appears as an optional charge", () => {
  const product = fixture();
  const html = renderToStaticMarkup(<ProductConfiguration product={product} selection={selection} {...callbacks} />);
  assert.match(html, /5A \+ Enhanced Grass Discharge Kit/);
  assert.match(html, /10A \+ Enhanced Grass Discharge Kit/);
  assert.doesNotMatch(html, /Increase Enhanced Grass Discharge Kit quantity/);
  assert.ok(!catalogBrowseOptions([product]).some(({ option }) => option.slug === "lymow-one-plus-enhanced-discharge-kit"));
  assert.ok(catalogBrowseOptions([product]).some(({ option }) => option.slug === "other"));
});
