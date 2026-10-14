import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import YarboCorePrice, { yarboCoreStatus } from "../components/equipment/YarboCorePrice";
import YarboPriceDisplay from "../components/equipment/YarboPriceDisplay";
import ProductConfiguration from "../components/customer-paths/purchase/ProductConfiguration";
import { priceFromRow, type PublicPriceRow } from "../lib/catalog/public-price";
import { productBuildIsComplete, resolveBuildSelection } from "../lib/catalog/selection";
import { publicProduct } from "./helpers/yarbo-preorder-fixture";

const start = "2026-10-14T05:00:00.000Z";
const end = "2026-11-01T04:59:00.000Z";
const before = Date.parse(start) - 1;
const row: PublicPriceRow = {
  display_msrp_price_cents: 920500, regular_price_cents: 859900, sale_price_cents: 839900,
  sale_starts_at: start, sale_ends_at: end, promotion_label: "YARBO ESSENTIALS PACKAGE!!",
  show_public_price: true, contact_for_pricing: false,
};
const pro = publicProduct().variants[1];
function render(now = before, patch: Partial<PublicPriceRow> = {}, program = true) {
  const price = priceFromRow({ ...row, ...patch }, now, program);
  return { price, html: renderToStaticMarkup(<YarboCorePrice core={pro} price={price} />) };
}
function current(html: string) {
  return html.match(/<div data-testid="y40p-current-price">([\s\S]*?)<\/div>/)?.[1]
    ?? html.match(/<p data-testid="y40p-current-price"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? "";
}

test("Essentials upcoming sale keeps $8,599 current and presents $8,399 separately", () => {
  const { price, html } = render();
  assert.equal(price.salePhase, "upcoming");
  assert.equal(price.currentPriceCents, 859900);
  assert.match(html, /Y40P MSRP<\/p><p[^>]*>\$9,205/);
  assert.match(current(html), /IDS Everyday Low Price/);
  assert.match(current(html), /text-xl font-black text-emerald-700">\$8,599/);
  assert.doesNotMatch(current(html), /\$8,399/);
  assert.match(html, /data-testid="y40p-upcoming-sale"[\s\S]*?Upcoming sale[\s\S]*?text-base font-semibold">\$8,399/);
  assert.match(html, /YARBO ESSENTIALS PACKAGE!! — scheduled/);
  assert.match(html, /Oct 14, 2026–Oct 31, 2026/);
  assert.doesNotMatch(html, /line-through/);
});

test("active sale starts inclusively, preserves MSRP comparison styling, and shows resolved $8,399", () => {
  for (const now of [Date.parse(start), Date.parse(end) - 1]) {
    const { price, html } = render(now, { promotion_label: "Fall Sale" });
    assert.equal(price.salePhase, "active");
    assert.match(html, /Y40P MSRP<\/p><p class="text-xl font-black text-slate-600 line-through">\$9,205/);
    assert.match(current(html), /Fall Sale price[\s\S]*?\$8,399/);
    assert.doesNotMatch(html, /Upcoming sale|scheduled|\$8,599/);
  }
});

test("ended sale stops at its exclusive end and returns to resolved Everyday pricing", () => {
  const { price, html } = render(Date.parse(end));
  assert.equal(price.salePhase, "ended");
  assert.equal(price.currentPriceCents, 859900);
  assert.match(current(html), /IDS Everyday Low Price[\s\S]*?\$8,599/);
  assert.doesNotMatch(html, /Upcoming sale|\$8,399|line-through/);
});

test("upcoming sale with null Everyday uses the shared MSRP fallback only when the resolver permits it", () => {
  const { price, html } = render(before, { regular_price_cents: null }, false);
  assert.equal(price.currentPriceCents, 920500);
  assert.match(current(html), /\$9,205/);
  assert.match(html, /Upcoming sale[\s\S]*?\$8,399/);
  const unpriced = render(before, { regular_price_cents: null }, true);
  assert.equal(unpriced.price.currentPriceCents, null);
  assert.match(current(unpriced.html), /Contact for pricing/);
  assert.doesNotMatch(current(unpriced.html), /\$9,205|\$8,399/);
});

test("MSRP fallback after the sale and no-price fallback retain the shared pricing policy", () => {
  assert.match(current(render(Date.parse(end), { regular_price_cents: null }, false).html), /\$9,205/);
  assert.match(current(render(Date.parse(end), { regular_price_cents: null, display_msrp_price_cents: null }, false).html), /Contact for pricing/);
});

for (const patch of [{ contact_for_pricing: true }, { show_public_price: false }]) {
  test(`public suppression applies to current, MSRP, and upcoming amounts: ${JSON.stringify(patch)}`, () => {
    for (const now of [before, Date.parse(start), Date.parse(end)]) {
      const { html } = render(now, patch);
      assert.match(html, /Contact for pricing/);
      assert.doesNotMatch(html, /\$9,205|\$8,599|\$8,399|Upcoming sale/);
    }
  });
}

test("Y40 remains exactly the shared Yarbo price presentation in all sale phases", () => {
  const core = publicProduct().variants[0];
  for (const now of [before, Date.parse(start), Date.parse(end)]) {
    const price = priceFromRow(row, now);
    assert.equal(renderToStaticMarkup(<YarboCorePrice core={core} price={price} />),
      renderToStaticMarkup(<YarboPriceDisplay item={price} priceClassName="text-xl font-black text-emerald-700" />));
  }
});

test("upcoming price display preserves one package, Core selection, checkout amount, and preorder state", () => {
  const product = publicProduct();
  const pkg = product.packages[0];
  Object.assign(pkg.corePrices![1], priceFromRow(row, before));
  const original = structuredClone(product);
  const selection = { variantId: product.variants[1].id, packageId: pkg.id, purchaseMode: "complete-system" as const, includeBaseProduct: false, optionQuantities: {} };
  const html = renderToStaticMarkup(<ProductConfiguration product={product} selection={selection} onSelectVariant={() => {}} onSelectPackage={() => {}} onChangeOptionQuantity={() => {}} onSelectPurchaseMode={() => {}} onToggleBaseProduct={() => {}} />);
  assert.equal(productBuildIsComplete(product, selection), true);
  assert.equal(resolveBuildSelection(product, selection).equipmentTotalCents, 859900);
  assert.equal((html.match(/name="yarbo-complete-core"/g) ?? []).length, 2);
  assert.match(html, /Early Access \/ Pre-Order/);
  assert.equal(yarboCoreStatus(product.variants[1]), "Early Access / Pre-Order");
  assert.match(html, /\$8,599/);
  assert.match(html, /Upcoming sale/);
  assert.deepEqual(product, original);
});
