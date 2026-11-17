import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import ProductSelection from "../components/customer-paths/purchase/ProductSelection";
import { purchaseGroups, purchaseGroupForSelection } from "../lib/catalog/purchase-groups";
import type { CatalogProduct } from "../lib/catalog/types";

function product(slug: string, brand: string, overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return { id: `id-${slug}`, slug, brand, name: slug, adminManaged: true,
    imageUrl: `/${slug}.png`, imageAlt: slug, isAvailable: true,
    currentPriceCents: 239900, variants: [], packages: [], options: [],
    ...overrides } as CatalogProduct;
}
const yarbo = product("yarbo", "Yarbo");
const lymow = product("lymow-one-plus", "Lymow");
const specials = ["refurbished-core", "refurbished-lawn", "refurbished-snow", "refurbished-snow-lawn", "pac-man-snow", "pac-man-pro"].map((name) => product(`yarbo-${name}`, "Yarbo"));
const catalog = [lymow, yarbo, ...specials];
const render = (products: CatalogProduct[], selectedProductId = "") => renderToStaticMarkup(<ProductSelection products={products} selectedProductId={selectedProductId} onSelectProduct={() => {}} />);

test("six specials are grouped under one Yarbo brand, never copied or repriced", () => {
  const groups = purchaseGroups(catalog);
  assert.deepEqual(groups.map((group) => group.name), ["Lymow", "Yarbo"]);
  assert.deepEqual(groups[1].products, [yarbo, ...specials]);
  groups[1].products.forEach((entry, index) => assert.strictEqual(entry, [yarbo, ...specials][index]));
});
test("first screen shows brands and accessories, not individual Yarbo packages", () => {
  const html = render(catalog);
  assert.match(html, />Select Yarbo</);
  assert.match(html, />Select Lymow</);
  assert.match(html, />Select Accessories &amp; Parts</);
  assert.equal((html.match(/<article/g) ?? []).length, 3);
  for (const entry of specials) assert.doesNotMatch(html, new RegExp(entry.name));
});
test("direct-linked and back-selected children render their brand lineup with original images and selected identity", () => {
  for (const selected of specials) {
    const html = render(catalog, selected.id);
    assert.match(html, /Choose your Yarbo equipment/);
    assert.match(html, /Back to brands/);
    assert.match(html, /Build a Yarbo System/);
    assert.match(html, new RegExp(selected.imageUrl!));
    assert.equal((html.match(/>Selected</g) ?? []).length, 1);
    assert.equal(purchaseGroupForSelection(purchaseGroups(catalog), selected.id)?.id, "yarbo");
  }
});
test("future listings join their brand by trimmed case-insensitive brand, not product name", () => {
  const future = product("entirely-new-model", "  yArBo  ");
  assert.deepEqual(purchaseGroups([...catalog, future])[1].products, [yarbo, ...specials, future]);
});
test("future Lymow products receive a nested Lymow lineup", () => {
  const newer = product("new-lymow-model", "Lymow");
  assert.equal(purchaseGroupForSelection(purchaseGroups([lymow, newer]), newer.id)?.name, "Lymow");
});
test("new brands and orphan products remain discoverable", () => {
  const other = product("future-robot", "Future Brand");
  const other2 = product("future-robot-two", "Future Brand");
  const groups = purchaseGroups([specials[0], other, other2]);
  assert.deepEqual(groups.map((entry) => entry.name), ["Yarbo", "Future Brand"]);
  assert.match(render([other, other2]), />Select Future Brand</);
});
test("available children keep their brand selectable when its canonical product is unavailable", () => {
  const html = render([{ ...yarbo, isAvailable: false }, ...specials]);
  assert.doesNotMatch(html, /disabled=""/);
  const childHtml = render([{ ...yarbo, isAvailable: false }, ...specials], specials[0].id);
  assert.equal((childHtml.match(/disabled=""/g) ?? []).length, 1);
});
test("Pandag remains excluded and accessories preselection remains top-level", () => {
  assert.equal(purchaseGroups([product("pandag-g1", "Pandag")]).length, 0);
  const html = render(catalog, "accessories");
  assert.match(html, /What would you like to purchase/);
  assert.equal((html.match(/>Selected</g) ?? []).length, 1);
});
