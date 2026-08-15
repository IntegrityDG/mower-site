import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import ProductConfiguration from "../components/customer-paths/purchase/ProductConfiguration";
import ProductDetailsModal from "../components/customer-paths/purchase/ProductDetailsModal";
import { catalogBrowseOptions } from "../components/equipment/EquipmentCatalog";
import { customerFacingGroupOptions, customerFacingProductOptions } from "../lib/catalog/customer-facing-options";
import { productBuildIsComplete, resolveBuildSelection } from "../lib/catalog/selection";
import type { CatalogOption, CatalogProduct, CatalogVariant, ProductBuildSelection } from "../lib/catalog/types";

const price = { isAvailable: true, publicStatus: "active" as const, regularPriceCents: 10000, salePriceCents: null, currentPriceCents: 10000, showPublicPrice: true, contactForPricing: false, promotionLabel: null, saleIsActive: false };
function option(id: string, slug: string, name: string): CatalogOption { return { id, slug, name, description: `${name} description`, optionGroupId: "group", isRequired: false, isIncluded: false, isRecommended: false, defaultQuantity: 0, minimumQuantity: 0, maximumQuantity: 1, sortOrder: 1, ...price }; }
function variant(id: string, slug: string, definingOptionIds: string[]): CatalogVariant { return { id, slug, sku: null, name: slug, description: null, sortOrder: 1, definingOptionIds, ...price }; }
function product(overrides: Partial<CatalogProduct> = {}): CatalogProduct { return { id: "product", slug: "lymow-one-plus", brand: "Lymow", name: "Lymow One Plus", homepageSummary: null, fullDescription: null, capabilityLevel: null, propertyScale: null, customerGuidance: null, brochureUrl: null, videoUrl: null, imageUrl: "/lymow.png", imageAlt: "Lymow", sortOrder: 1, salesMode: "self_service", page: null, media: [], variants: [], optionGroups: [], ungroupedOptions: [], packages: [], ...price, ...overrides }; }

const charger5 = option("charger-5", "lymow-5a-charger", "5A Charger Configuration");
const charger10 = option("charger-10", "lymow-10a-charger", "10A Charger Configuration");
const replacementBlade = option("blade", "lymow-straight-blade-2", "Replacement Blade");
const chargerGroup = { id: "group", slug: "lymow-charger-config", name: "Charger Configuration", description: null, selectionType: "single" as const, isRequired: true, minimumSelections: 1, maximumSelections: 1, sortOrder: 1, options: [charger5, charger10] };
const accessoryGroup = { ...chargerGroup, id: "accessories", slug: "replacement-parts", name: "Replacement Parts", isRequired: false, minimumSelections: 0, options: [replacementBlade] };
const lymow = product({ variants: [variant("variant-5", "lymow-one-plus-5a", [charger5.id]), variant("variant-10", "lymow-one-plus-10a", [charger10.id])], optionGroups: [chargerGroup, accessoryGroup] });
const preMigrationLymow = product({ variants: [variant("variant-5", "lymow-one-plus-5a", []), variant("variant-10", "lymow-one-plus-10a", [])], optionGroups: [{ ...chargerGroup, options: [] }, accessoryGroup] });
const transitionalLymow = product({ variants: [variant("variant-5", "lymow-one-plus-5a", []), variant("variant-10", "lymow-one-plus-10a", [])], optionGroups: [chargerGroup, accessoryGroup] });

test("pre-migration empty required charger group creates no customer selection requirement", () => {
  const selection: ProductBuildSelection = { variantId: "variant-5", packageId: "", optionQuantities: {} };
  assert.equal(productBuildIsComplete(preMigrationLymow, selection), true);
  assert.deepEqual(customerFacingProductOptions(preMigrationLymow).map((item) => item.id), [replacementBlade.id]);
  assert.deepEqual(customerFacingGroupOptions(preMigrationLymow, preMigrationLymow.optionGroups[0]), []);
  assert.deepEqual(catalogBrowseOptions([preMigrationLymow]).map(({ option: item }) => item.id), [replacementBlade.id]);
  const modal = renderToStaticMarkup(<ProductDetailsModal product={preMigrationLymow} onClose={() => {}} onSelect={() => {}} isSelected={false} />);
  assert.match(modal, />1<\/p><p[^>]*>Options/);
  assert.doesNotMatch(modal, /Charger Configuration|5A Charger|10A Charger/);
  const configuration = renderToStaticMarkup(<ProductConfiguration product={preMigrationLymow} selection={selection} onSelectVariant={() => {}} onSelectPackage={() => {}} onChangeOptionQuantity={() => {}} onSelectPurchaseMode={() => {}} onToggleBaseProduct={() => {}} />);
  assert.doesNotMatch(configuration, /Charger Configuration|5A Charger|10A Charger/);
  assert.match(configuration, /Replacement Blade/);
});

test("temporary guard hides charger mirrors when public relationship IDs are unavailable", () => {
  assert.deepEqual(customerFacingProductOptions(transitionalLymow).map((item) => item.id), [replacementBlade.id]);
  assert.deepEqual(customerFacingGroupOptions(transitionalLymow, chargerGroup), []);
  assert.deepEqual(catalogBrowseOptions([transitionalLymow]).map(({ option: item }) => item.id), [replacementBlade.id]);
  const build = resolveBuildSelection(transitionalLymow, { variantId: "variant-5", packageId: "", optionQuantities: { [charger5.id]: 1 } });
  assert.deepEqual(build.selectedOptions, []);
});

test("active defines_variant options stay internal across shared customer-facing semantics", () => {
  assert.deepEqual(customerFacingProductOptions(lymow).map((item) => item.id), [replacementBlade.id]);
  assert.deepEqual(customerFacingGroupOptions(lymow, chargerGroup), []);
  assert.deepEqual(catalogBrowseOptions([lymow]).map(({ option: item }) => item.id), [replacementBlade.id]);
  assert.deepEqual(lymow.variants.flatMap((item) => item.definingOptionIds), [charger5.id, charger10.id]);
});

test("details count and configuration rendering exclude defining options but retain ordinary options", () => {
  const modal = renderToStaticMarkup(<ProductDetailsModal product={lymow} onClose={() => {}} onSelect={() => {}} isSelected={false} />);
  assert.match(modal, />1<\/p><p[^>]*>Options/);
  assert.doesNotMatch(modal, /5A Charger Configuration|10A Charger Configuration/);
  const selection: ProductBuildSelection = { variantId: "variant-5", packageId: "", optionQuantities: {} };
  const configuration = renderToStaticMarkup(<ProductConfiguration product={lymow} selection={selection} onSelectVariant={() => {}} onSelectPackage={() => {}} onChangeOptionQuantity={() => {}} onSelectPurchaseMode={() => {}} onToggleBaseProduct={() => {}} />);
  assert.doesNotMatch(configuration, /Charger Configuration|5A Charger|10A Charger/);
  assert.match(configuration, /Replacement Blade/);
});

test("ordinary non-defining Yarbo options remain customer-facing", () => {
  const mowerModule = option("yarbo-module", "yarbo-mower-module", "Mower Module");
  const yarbo = product({ id: "yarbo", slug: "yarbo", brand: "Yarbo", name: "Yarbo", variants: [], optionGroups: [{ ...accessoryGroup, options: [mowerModule] }] });
  assert.deepEqual(customerFacingProductOptions(yarbo).map((item) => item.id), [mowerModule.id]);
});
