import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import ProductConfiguration from "../components/customer-paths/purchase/ProductConfiguration";
import { nextPackageSaleBoundaryDelay, yarboPackagesDuringSale, yarboSaleForCore, yarboPackageForCore, yarboPackageCard } from "../lib/catalog/yarbo-sale-packages";
import { yarboCorePrice } from "../lib/catalog/yarbo-core";
import { during, end, publicProduct, start } from "./helpers/yarbo-preorder-fixture";

function fixture() {
  const product = publicProduct();
  const regular = product.packages.find(item => item.slug === "yarbo-pro-snow")!;
  const sale = structuredClone(regular);
  sale.id = "bf";
  sale.slug = "yarbo-y40p-snow-lawn-early-black-friday-2026";
  sale.name = "Snow and Lawn Early Black Friday";
  Object.assign(sale, { regularPriceCents: null, promotionLabel: null, scheduledSaleLabel: null, saleIsActive: true, salePriceCents: 600000, currentPriceCents: 600000, saleStartsAt: start, saleEndsAt: end });
  for (const price of sale.corePrices!) Object.assign(price, { regularPriceCents: null, promotionLabel: null, scheduledSaleLabel: null, saleIsActive: true, salePriceCents: 600000, currentPriceCents: 600000, saleStartsAt: start, saleEndsAt: end });
  sale.items.push({ optionId: "gift", quantity: 1, includedInPackagePrice: true, option: null, component: { id: "gift", kind: "option", slug: "free-snow-pins", name: "Gift", isAvailable: true } });
  product.packages.push(sale);
  return { product, regular, sale };
}
const visible = (product: ReturnType<typeof publicProduct>, id: string, now = during) => yarboPackagesDuringSale(product, now).some(item => item.id === id);

test("active equivalent BF uses original card and underlying BF ID, preserving original data", () => {
  const { product, regular, sale } = fixture();
  const before = structuredClone(product);
  assert.equal(visible(product, regular.id), true);
  assert.equal(visible(product, sale.id), false);
  assert.equal(yarboPackageForCore(product, regular, "y40", during).id, sale.id);
  assert.equal(visible(product, "yarbo-pro-leaf"), true);
  assert.deepEqual(product, before);
});
test("unmatched core stays visible, including a non-priced fallback relationship", () => {
  const { product, regular, sale } = fixture();
  sale.corePrices = sale.corePrices!.filter(price => price.coreVariantId === "y40p");
  assert.equal(visible(product, regular.id), true);
  assert.equal(yarboSaleForCore(product, regular, "y40", during), null);
  assert.equal(yarboSaleForCore(product, regular, "y40p", during)?.id, sale.id);
  sale.corePrices.push({ ...sale.corePrices[0], coreVariantId: "y40", currentPriceCents: null, showPublicPrice: false, contactForPricing: true, priceMode: "core_specific" });
  assert.equal(visible(product, regular.id), true);
  assert.equal(yarboSaleForCore(product, regular, "y40", during), null);
});
test("two model-specific BF offers together replace a dual-core regular package", () => {
  const { product, regular, sale } = fixture();
  const second = structuredClone(sale);
  second.id = "bf-y40";
  second.slug = "yarbo-y40-snow-lawn-early-black-friday-2026";
  sale.corePrices = sale.corePrices!.filter(price => price.coreVariantId === "y40p");
  second.corePrices = second.corePrices!.filter(price => price.coreVariantId === "y40");
  product.packages.push(second);
  assert.equal(yarboSaleForCore(product, regular, "y40", during)?.id, second.id);
});
test("before start and at exclusive expiry regular packages return, even if old snapshot says sale active", () => {
  const { product, regular } = fixture();
  assert.equal(yarboPackageForCore(product, regular, "y40", Date.parse(start) - 1).id, regular.id);
  assert.equal(yarboPackageForCore(product, regular, "y40", Date.parse(start)).id, "bf");
  assert.equal(yarboPackageForCore(product, regular, "y40", Date.parse(end) - 1).id, "bf");
  assert.equal(yarboPackageForCore(product, regular, "y40", Date.parse(end)).id, regular.id);
});
test("unavailable gift or package, contact-only price, inactive sale never hide regular package", () => {
  for (const mutate of [
    (sale: ReturnType<typeof fixture>["sale"]) => { sale.isAvailable = false; },
    (sale: ReturnType<typeof fixture>["sale"]) => { sale.items.at(-1)!.component!.isAvailable = false; },
    (sale: ReturnType<typeof fixture>["sale"]) => { sale.contactForPricing = true; },
    (sale: ReturnType<typeof fixture>["sale"]) => { sale.saleIsActive = false; },
  ]) {
    const { product, regular, sale } = fixture();
    mutate(sale);
    assert.equal(yarboSaleForCore(product, regular, "y40", during), null);
  }
});
test("module quantities, extra modules and unique regular extras prevent false matches", () => {
  for (const mutation of ["quantity", "extra-module", "regular-extra"] as const) {
    const { product, regular, sale } = fixture();
    if (mutation === "quantity") sale.items[0].quantity = 2;
    if (mutation === "extra-module") sale.items.push({ ...sale.items[0], option: { ...sale.items[0].option!, slug: "yarbo-leaf-blower-module" } });
    if (mutation === "regular-extra") regular.items.push({ ...sale.items.at(-1)!, component: { ...sale.items.at(-1)!.component!, slug: "unique-extra" } });
    assert.equal(yarboSaleForCore(product, regular, "y40", during), null);
  }
});
test("component identity works when no option snapshot exists; names do not control matching", () => {
  const { product, regular, sale } = fixture();
  sale.items = sale.items.map(item => item.option ? { ...item, component: { id: item.option.id, kind: "option" as const, name: "Renamed equipment", slug: item.option.slug, isAvailable: true }, option: null } : item);
  regular.name = "Unexpected label";
  assert.equal(yarboSaleForCore(product, regular, "y40", during)?.id, sale.id);
});
test("non-Yarbo catalogs and regular packages with their own sale remain untouched", () => {
  const { product, regular, sale } = fixture();
  sale.slug = "ordinary-sale";
  sale.regularPriceCents = 800000;
  for (const price of sale.corePrices!) price.regularPriceCents = 800000;
  assert.equal(visible(product, regular.id), true);
  assert.equal(visible(product, sale.id), true);
  assert.equal(yarboSaleForCore(product, regular, "y40", during), null);
  product.slug = "other-brand";
  assert.equal(yarboPackagesDuringSale(product, during), product.packages);
});
test("next boundary uses package and core schedules, and stops scheduling after expiry", () => {
  const { product } = fixture();
  assert.equal(nextPackageSaleBoundaryDelay(product, Date.parse(start) - 500), 550);
  assert.equal(nextPackageSaleBoundaryDelay(product, Date.parse(end) - 500), 550);
  assert.equal(nextPackageSaleBoundaryDelay(product, Date.parse(end)), null);
});
test("builder displays original title with BF offer and extras, explaining unchanged prior cart", () => {
  const { product, regular, sale } = fixture();
  // Render at the current instant, independently of the historical fixture period.
  for (const price of [sale, ...sale.corePrices!]) { price.saleStartsAt = "2020-01-01T00:00:00Z"; price.saleEndsAt = "2099-01-01T00:00:00Z"; }
  const html = renderToStaticMarkup(<ProductConfiguration product={product}
    selection={{ variantId: "y40", packageId: regular.id, purchaseMode: "complete-system", includeBaseProduct: false, optionQuantities: {} }}
    onSelectVariant={() => {}} onSelectPackage={() => {}} onSelectPurchaseMode={() => {}} onToggleBaseProduct={() => {}} onChangeOptionQuantity={() => {}} />);
  assert.match(html, /previous order selection has not been changed automatically/);
  assert.match(html, /Black Friday sale/);
  assert.match(html, /Gift/);
  assert.doesNotMatch(html, /Snow and Lawn Early Black Friday/);
  const buttons = html.match(/<button\b[\s\S]*?<\/button>/g) ?? [];
  assert.equal(buttons.some(button => button.includes(`>${regular.name}</h6>`)), true);
  assert.match(html, /Individual Yarbo Equipment/);
});


test("core switch resolves from existing BF card to correct sibling offer, with unmatched fallback", () => {
  const { product, regular, sale } = fixture();
  const second = structuredClone(sale);
  second.id = "bf-y40";
  sale.corePrices = sale.corePrices!.filter(price => price.coreVariantId === "y40p");
  second.corePrices = second.corePrices!.filter(price => price.coreVariantId === "y40");
  product.packages.push(second);
  const selected = yarboPackageForCore(product, regular, "y40", during);
  assert.equal(selected.id, second.id);
  assert.equal(yarboPackageCard(product, selected.id)?.id, regular.id);
  assert.equal(yarboPackageForCore(product, yarboPackageCard(product, selected.id)!, "y40p", during).id, sale.id);
  product.packages = product.packages.filter(item => item.id !== sale.id);
  assert.equal(yarboPackageForCore(product, yarboPackageCard(product, selected.id)!, "y40p", during).id, regular.id);
});

test("product and variant sale boundaries trigger refresh too", () => {
  const { product } = fixture();
  product.saleEndsAt = new Date(during + 100).toISOString();
  product.variants[0].saleEndsAt = new Date(during + 50).toISOString();
  assert.equal(nextPackageSaleBoundaryDelay(product, during), 100);
});

test("a sale with an unmatched core remains separately reachable", () => {
  const { product, regular, sale } = fixture();
  regular.corePrices = regular.corePrices!.filter(price => price.coreVariantId === "y40");
  assert.equal(yarboSaleForCore(product, regular, "y40p", during), null);
  assert.equal(visible(product, sale.id), true);
});

test("distinct new base equipment remains its own purchasable card", () => {
  const { product, sale } = fixture();
  sale.items[0].quantity = 2;
  assert.equal(visible(product, sale.id), true);
});

test("future sale-only offers fold into original cards without holiday or year slug conventions", () => {
  const { product, regular, sale } = fixture();
  sale.slug = "spring-event-custom-offer";
  sale.name = "Spring promotion";
  for (const price of [sale, ...sale.corePrices!]) {
    price.saleStartsAt = "2030-03-01T00:00:00Z";
    price.saleEndsAt = "2030-04-01T00:00:00Z";
  }
  const now = Date.parse("2030-03-15T00:00:00Z");
  assert.equal(yarboPackageForCore(product, regular, "y40", now).id, sale.id);
  assert.equal(visible(product, sale.id, now), false);
});

test("expired paired sale cards stay hidden and ordinary ID is restored on fresh selection", () => {
  const { product, regular, sale } = fixture();
  const now = Date.parse(end);
  assert.equal(visible(product, sale.id, now), false);
  assert.equal(visible(product, regular.id, now), true);
  assert.equal(yarboPackageForCore(product, regular, "y40", now).id, regular.id);
  assert.equal(yarboPackageCard(product, sale.id)?.id, regular.id);
  // Same result with a fresh API snapshot after cutoff.
  for (const price of [sale, ...sale.corePrices!]) {
    price.saleIsActive = false;
    price.currentPriceCents = null;
    price.salePhase = "ended";
  }
  assert.equal(visible(product, sale.id, now), false);
  assert.equal(yarboPackageForCore(product, regular, "y40", now).id, regular.id);
});

test("distinct sale-only setup remains until cutoff, then hides instead of showing an unpriced dead card", () => {
  const { product, sale } = fixture();
  sale.items[0].quantity = 2;
  assert.equal(visible(product, sale.id), true);
  assert.equal(visible(product, sale.id, Date.parse(end)), false);
});

test("missing or invalid promotion-only windows do not replace ordinary packages", () => {
  for (const date of [null, "bad-date"]) {
    const { product, regular, sale } = fixture();
    for (const price of [sale, ...sale.corePrices!]) price.saleEndsAt = date;
    assert.equal(yarboSaleForCore(product, regular, "y40", during), null);
  }
});

test("manufacturer sale supersedes only the matching active IDS promotion, which can resume after cutoff", () => {
  const { product, regular } = fixture();
  const core = product.variants.find(item => item.id === "y40")!;
  const priorPromotion = { context: "ids" as const, message: "Included IDS maintenance kit", imageUrl: null };
  const ordinaryPrice = yarboCorePrice(product, core, regular)!;
  ordinaryPrice.publicPromotion = priorPromotion;
  const other = product.packages.find(item => item.id === "yarbo-pro-leaf")!;
  assert.ok(other);
  assert.notDeepEqual(yarboCorePrice(product, core, yarboPackageForCore(product, regular, core.id, during))?.publicPromotion, priorPromotion);
  assert.equal(yarboPackageForCore(product, other, core.id, during).id, other.id);
  assert.deepEqual(yarboCorePrice(product, core, yarboPackageForCore(product, regular, core.id, Date.parse(end)))?.publicPromotion, priorPromotion);
});
