import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import ProductConfiguration from "../components/customer-paths/purchase/ProductConfiguration";
import PurchaseSummary from "../components/customer-paths/purchase/PurchaseSummary";
import { EquipmentSelectionReview, AccessoryOnlyReview } from "../components/customer-paths/purchase/NationwidePurchaseFlow";
import GenericProductDetail from "../components/equipment/GenericProductDetail";
import { yarboIncludedEquipment, yarboOrderIncludesCore } from "../lib/catalog/yarbo";
import { yarboSaleExtraNames } from "../lib/catalog/yarbo-sale-packages";
import { resolveBuildSelection } from "../lib/catalog/selection";
import { publicProduct } from "./helpers/yarbo-preorder-fixture";
import type { CatalogPackageItem, CatalogProduct, ProductBuildSelection } from "../lib/catalog/types";

const select = (core: string, packageId = ""): ProductBuildSelection => ({
  variantId: core, packageId, purchaseMode: packageId ? "complete-system" : "individual-equipment",
  includeBaseProduct: !packageId, optionQuantities: {},
});
const navItem: CatalogPackageItem = { optionId: "dc", quantity: 1, includedInPackagePrice: true, option: null,
  component: { id: "dc", slug: "yarbo-data-center", kind: "option", name: "Data Center", isAvailable: true } };
const cfg = (product: CatalogProduct, selection: ProductBuildSelection) => renderToStaticMarkup(<ProductConfiguration product={product} selection={selection} onSelectVariant={() => {}} onSelectPackage={() => {}} onSelectPurchaseMode={() => {}} onToggleBaseProduct={() => {}} onChangeOptionQuantity={() => {}} />);
const summary = (product: CatalogProduct, selection: ProductBuildSelection) => renderToStaticMarkup(<PurchaseSummary selectedProduct={product} buildSelection={selection} purchaseMethodLabel="Card" submissionKind="card" submitStatus="idle" submitError="" onSubmit={() => {}} customerInformation={{ fullName: "Buyer", email: "buyer@example.com", phone: "", shippingAddress: "1 Main", shippingZip: "65201", shippingState: "MO", shippingRegion: "Boone", referrerName: "", referrerEmail: "" }} />);
const review = (product: CatalogProduct, selection: ProductBuildSelection) => renderToStaticMarkup(<EquipmentSelectionReview selectedProduct={product} buildSelection={selection} />);
const hasIncludedNavigation = (html: string) => {
  assert.match(html, /Data Center/);
  assert.match(html, /Pro antennas/);
  assert.match(html, /no additional charge/);
};

for (const core of ["y40", "y40p"]) {
  for (const packageId of ["", "yarbo-pro-snow"]) {
    test(core + " " + (packageId || "Core-only") + " builder and reviews disclose included navigation without repricing", () => {
      const product = publicProduct();
      const selection = select(core, packageId);
      const before = structuredClone(product);
      const total = resolveBuildSelection(product, selection).equipmentTotalCents;
      hasIncludedNavigation(cfg(product, selection));
      hasIncludedNavigation(review(product, selection));
      hasIncludedNavigation(summary(product, selection));
      assert.equal(resolveBuildSelection(product, selection).equipmentTotalCents, total);
      assert.deepEqual(product, before);
    });
  }
}

for (const slug of ["yarbo-pac-man-snow-blower-gen-2", "yarbo-pac-man-snow-blower-gen-2-mower-pro"]) {
  test(slug + " generic page, builder and reviews carry same Core inclusions", () => {
    const product = { ...publicProduct(), slug, id: slug, name: "PAC-MAN system", packages: [], variants: [], adminManaged: true };
    const selection = { ...select(""), purchaseMode: undefined, includeBaseProduct: false };
    assert.equal(yarboOrderIncludesCore(product, selection), true);
    hasIncludedNavigation(renderToStaticMarkup(<GenericProductDetail product={product} />));
    hasIncludedNavigation(cfg(product, selection));
    hasIncludedNavigation(review(product, selection));
    hasIncludedNavigation(summary(product, selection));
  });
}

test("module-only and accessory-only orders do not promise included Core equipment", () => {
  const product = publicProduct();
  const selection = { ...select("y40"), includeBaseProduct: false, optionQuantities: { snow: 1 } };
  assert.equal(yarboOrderIncludesCore(product, selection), false);
  assert.doesNotMatch(review(product, selection), /Included with your Yarbo Core/);
  assert.doesNotMatch(summary(product, selection), /Included with your Yarbo Core/);
  assert.doesNotMatch(renderToStaticMarkup(<AccessoryOnlyReview choices={[]} quantities={{}} />), /Data Center|Pro antennas/);
  assert.equal(yarboOrderIncludesCore({ ...product, slug: "yarbo-new-unknown-product" }, select("")), false);
  assert.equal(yarboOrderIncludesCore({ ...product, slug: "lymow-one-plus" }, select("")), false);
});

test("structured Data Center package row appears once and is not called an extra gift", () => {
  const product = publicProduct();
  const regular = product.packages[0];
  const sale = { ...regular, items: [...regular.items, navItem] };
  const names = yarboIncludedEquipment(sale.items);
  assert.deepEqual(names.filter(name => name.includes("Data Center")), ["Yarbo Data Center"]);
  assert.deepEqual(names.filter(name => name.includes("Pro antennas")), ["Pro antennas"]);
  assert.ok(!yarboSaleExtraNames(regular, sale).some(name => name.includes("Data Center")));
  product.packages[0] = sale;
  for (const html of [review(product, select("y40", sale.id)), summary(product, select("y40", sale.id))]) {
    assert.equal((html.match(/<li[^>]*>Yarbo Data Center<\/li>/g) ?? []).length, 1);
    assert.doesNotMatch(html, /<p[^>]*>Data Center<\/p>/);
  }
});
