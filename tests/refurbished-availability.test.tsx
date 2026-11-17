import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import ProductSelection from "../components/customer-paths/purchase/ProductSelection";
import GenericProductDetail from "../components/equipment/GenericProductDetail";
import { productRequestedByBuildSearch } from "../components/customer-paths/purchase/NationwidePurchaseFlow";
import { productRequiresAvailabilityCheck, salesModeForCatalogProduct, isSelfServiceProduct } from "../lib/catalog/sales-mode";
import { validateCheckoutEligibility, resolveCheckoutPackageComponents, type CheckoutCatalog } from "../lib/checkout/eligibility";
import { checkoutSubmissionKind } from "../lib/checkout/handoff";
import { publicProduct, checkoutRequest, priceRow } from "./helpers/yarbo-preorder-fixture";
import type { CatalogResponse } from "../lib/catalog/types";
const slugs = ["yarbo-refurbished-y40-snow-blower-lawn-mower", "yarbo-refurbished-y40-snow-blower", "yarbo-refurbished-y40-lawn-mower", "yarbo-refurbished-core"];
const make = (slug: string) => ({ ...publicProduct(), id: slug, slug, name: slug, brand: "Yarbo", adminManaged: true, variants: [], packages: [], optionGroups: [], ungroupedOptions: [], currentPriceCents: 239900, regularPriceCents: 239900, salesMode: salesModeForCatalogProduct({ slug }) });

test("only four designated refurbished systems require availability checks; PAC-MAN and accessories are unaffected", () => {
  slugs.forEach(slug => { assert.equal(productRequiresAvailabilityCheck({ slug }), true); assert.equal(isSelfServiceProduct(make(slug)), false); });
  ["yarbo-pac-man-snow-blower-gen-2", "yarbo-pac-man-snow-blower-gen-2-mower-pro", "yarbo-refurbished-battery", "yarbo", "lymow-one-plus"].forEach(slug => assert.equal(productRequiresAvailabilityCheck({ slug }), false));
});
test("refurbished stay in Yarbo lineup with public prices and contact CTA, not select controls", () => {
  const products = [publicProduct(), ...slugs.map(make), make("yarbo-pac-man-snow-blower-gen-2")];
  const html = renderToStaticMarkup(<ProductSelection products={products} selectedProductId={products[0].id} onSelectProduct={() => {}} />);
  assert.equal((html.match(/>Check Availability</g) ?? []).length, 4);
  assert.match(html, /\$2,399/);
  assert.match(html, /Y Series/);
  assert.doesNotMatch(html, />M Series<|>C Series</);
  slugs.forEach(slug => assert.doesNotMatch(html, new RegExp(`Select ${slug}`)));
  assert.match(html, /Select yarbo-pac-man-snow-blower-gen-2/);
  assert.match(html, /href="\/contact"/);
});
test("refurbished detail retains price/photos and replaces purchase links including header", () => {
  const html = renderToStaticMarkup(<GenericProductDetail product={make(slugs[3])} />);
  assert.match(html, /\$2,399/);
  assert.equal((html.match(/>Check Availability</g) ?? []).length, 2);
  assert.doesNotMatch(html, /Build Your System|Request Pricing &amp; Information/);
});
test("stale public salesMode and forged direct requests cannot purchase any designated system", () => {
  for (const slug of slugs) {
    const product = {...make(slug), salesMode: "self_service" as const};
    assert.equal(isSelfServiceProduct(product), false);
    assert.equal(productRequestedByBuildSearch({ products: [product], generatedAt: new Date().toISOString() } as CatalogResponse, `?product=${slug}`), null);
    for (const payment of ["pay-in-full", "ach"] as const) assert.equal(checkoutSubmissionKind(product, payment), "quote");
    const row = {...priceRow(239900), id: product.id, slug, brand: "Yarbo", name: slug, admin_managed: true, public_status: "active"};
    const catalog: CheckoutCatalog = {product: row, variants: [], options: [], packages: [], packageItems: [], variantOptions: []};
    const request = {...checkoutRequest(), selection: {productId: row.id, variantId: null, packageId: null, options: [], purchaseMode: "standard" as const, includeBaseProduct: true}};
    assert.throws(() => validateCheckoutEligibility(request, catalog), /quote-only/);
    catalog.componentProducts = [row];
    catalog.product = {...row, id: "other", slug: "other-machine"};
    catalog.packageItems = [{id: "link", package_id: "bundle", option_id: null, component_product_id: row.id, quantity: 1, included_in_package_price: true}];
    assert.throws(() => resolveCheckoutPackageComponents(catalog, "bundle"), /quote-only/);
  }
});
