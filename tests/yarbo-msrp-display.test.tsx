import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import ProductConfiguration from "../components/customer-paths/purchase/ProductConfiguration";
import YarboCorePrice, { yarboCoreStatus } from "../components/equipment/YarboCorePrice";
import YarboPriceDisplay from "../components/equipment/YarboPriceDisplay";
import { priceFromRow, type PublicPriceRow } from "../lib/catalog/public-price";
import { productBuildIsComplete, resolveBuildSelection } from "../lib/catalog/selection";
import { yarboCorePrice } from "../lib/catalog/yarbo-core";
import type { ProductBuildSelection } from "../lib/catalog/types";
import { during, end, publicProduct, start } from "./helpers/yarbo-preorder-fixture";

const fallSale: PublicPriceRow = {
  display_msrp_price_cents: 889900,
  regular_price_cents: null,
  sale_price_cents: 839900,
  sale_starts_at: start,
  sale_ends_at: end,
  promotion_label: "Fall Sale",
  show_public_price: true,
  contact_for_pricing: false,
};

function renderPrice(patch: Partial<PublicPriceRow> = {}, now = during) {
  return renderToStaticMarkup(<YarboCorePrice
    core={publicProduct(now).variants[1]}
    price={priceFromRow({ ...fallSale, ...patch }, now, false)}
  />);
}

for (const [name, msrp, sale, expectedMsrp, expectedSale] of [
  ["Lawn Mower Pro + Trimmer", 889900, 839900, "$8,899", "$8,399"],
  ["Lawn Mower Pro", 759900, 719900, "$7,599", "$7,199"],
] as const) {
  test(`Y40P ${name} renders manufacturer MSRP and Fall Sale with Everyday unset`, () => {
    const row = Object.freeze({ ...fallSale, display_msrp_price_cents: msrp, sale_price_cents: sale });
    const price = Object.freeze(priceFromRow(row, during, false));
    const before = structuredClone(price);
    const html = renderToStaticMarkup(<YarboCorePrice core={publicProduct().variants[1]} price={price} />);
    assert.ok(html.includes(`Y40P MSRP</p><p class="text-xl font-black text-slate-600 line-through">${expectedMsrp}</p>`));
    assert.ok(html.includes(`Fall Sale price</p><p class="text-xl font-black text-emerald-700">${expectedSale}</p>`));
    assert.doesNotMatch(html, /Contact for pricing/);
    assert.equal(price.regularPriceCents, null);
    assert.equal(row.regular_price_cents, null);
    assert.deepEqual(price, before, "display is a pure render of the supplied pricing object");
  });
}

test("Y40P MSRP never uses a different IDS Everyday price", () => {
  const html = renderPrice({ regular_price_cents: 859900 });
  assert.match(html, /Y40P MSRP<\/p><p[^>]*>\$8,899<\/p>/);
  assert.doesNotMatch(html, /\$8,599/);
});

test("missing Y40P MSRP omits its label and retains the active sale", () => {
  const html = renderPrice({ display_msrp_price_cents: null, regular_price_cents: 859900 });
  assert.doesNotMatch(html, /MSRP|Contact for pricing|\$8,599/);
  assert.match(html, /Fall Sale price<\/p><p[^>]*>\$8,399<\/p>/);
  const legacyPrice = priceFromRow(fallSale, during, false);
  delete legacyPrice.displayMsrpPriceCents;
  const legacyHtml = renderToStaticMarkup(<YarboCorePrice core={publicProduct().variants[1]} price={legacyPrice} />);
  assert.doesNotMatch(legacyHtml, /MSRP|Contact for pricing|NaN/);
  assert.match(legacyHtml, /\$8,399/);
});

test("without MSRP or an offer, Y40P displays the resolved price without labeling it MSRP", () => {
  const html = renderPrice({ display_msrp_price_cents: null, regular_price_cents: 859900, sale_price_cents: null });
  assert.match(html, /\$8,599/);
  assert.doesNotMatch(html, /MSRP|Contact for pricing/);
  assert.match(renderPrice({ display_msrp_price_cents: null, sale_price_cents: null }), /Contact for pricing/);
});

for (const patch of [{ contact_for_pricing: true }, { show_public_price: false }]) {
  test(`Y40P honors price visibility: ${JSON.stringify(patch)}`, () => {
    const html = renderPrice(patch);
    assert.match(html, /Contact for pricing/);
    assert.doesNotMatch(html, /MSRP|\$8,899|\$8,399|Fall Sale/);
  });
}

test("Y40 continues to render exactly the shared Yarbo price display", () => {
  for (const now of [Date.parse(start) - 1, during, Date.parse(end)]) {
    for (const patch of [{}, { show_public_price: false }, { contact_for_pricing: true }]) {
      const price = priceFromRow({ ...fallSale, ...patch }, now, false);
      assert.equal(
        renderToStaticMarkup(<YarboCorePrice core={publicProduct(now).variants[0]} price={price} />),
        renderToStaticMarkup(<YarboPriceDisplay item={price} priceClassName="text-xl font-black text-emerald-700" />),
      );
    }
  }
});

test("Y40P sale dates, scheduled label, strikethrough, and exclusive end stay unchanged", () => {
  for (const [now, active, offer] of [
    [Date.parse(start) - 1, false, true],
    [Date.parse(start), true, true],
    [Date.parse(end) - 1, true, true],
    [Date.parse(end), false, false],
  ] as const) {
    const html = renderPrice({}, now);
    assert.match(html, /Y40P MSRP<\/p><p[^>]*>\$8,899<\/p>/);
    assert.equal(html.includes("line-through"), active);
    assert.equal(html.includes("Sep 15, 2026–Oct 6, 2026"), offer);
    assert.equal(html.includes("$8,399"), offer);
    assert.equal(html.includes("Fall Sale — scheduled"), offer && !active);
    assert.doesNotMatch(html, /Contact for pricing/);
  }
});

test("Fall Sale MSRP display preserves one package selection, Core choice, and preorder state", () => {
  const product = publicProduct();
  const catalogPackage = product.packages.find((item) => item.slug === "yarbo-lawn-mower-pro")!;
  Object.assign(catalogPackage.corePrices![1], priceFromRow({
    ...fallSale, display_msrp_price_cents: 759900, sale_price_cents: 719900,
  }, during, false));
  const before = structuredClone(product);
  for (const variantId of ["y40", "y40p"]) {
    const selection: ProductBuildSelection = {
      variantId, packageId: catalogPackage.id, purchaseMode: "complete-system",
      includeBaseProduct: false, optionQuantities: {},
    };
    const html = renderToStaticMarkup(<ProductConfiguration
      product={product} selection={selection} onSelectVariant={() => {}} onSelectPackage={() => {}}
      onSelectPurchaseMode={() => {}} onToggleBaseProduct={() => {}} onChangeOptionQuantity={() => {}}
    />);
    assert.equal((html.match(/name="yarbo-complete-core"/g) ?? []).length, 2);
    assert.match(html, new RegExp(`<input(?=[^>]*name="yarbo-complete-core")(?=[^>]*value="${variantId}")(?=[^>]*checked)[^>]*>`));
    const selectedPackages = (html.match(/<button[^>]*aria-pressed="true"[^>]*>[\s\S]*?<\/button>/g) ?? [])
      .filter((button) => button.includes("Y40P MSRP"));
    assert.equal(selectedPackages.length, 1);
    assert.match(html, /Early Access \/ Pre-Order/);
    assert.match(html, /Y40P MSRP<\/p><p[^>]*>\$7,599<\/p>/);
    assert.equal(productBuildIsComplete(product, selection), true);
    assert.equal(resolveBuildSelection(product, selection).packageIncludedItems.length, 1);
    assert.equal(resolveBuildSelection(product, selection).equipmentTotalCents, variantId === "y40p" ? 719900 : 579900);
  }
  assert.equal(yarboCoreStatus(product.variants[1]), "Early Access / Pre-Order");
  assert.equal(yarboCorePrice(product, product.variants[1], catalogPackage)?.regularPriceCents, null);
  assert.deepEqual(product, before, "rendering preserves catalog pricing and package/Core records");
});
