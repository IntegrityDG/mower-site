import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import AccessoryCatalog from "../components/equipment/AccessoryCatalog";
import type { AccessoryCatalogResponse, AccessoryItem } from "../lib/accessories/types";

const settings: AccessoryCatalogResponse["settings"] = {
  lymowEnabled: true, lymowLabel: "Lymow", yarboEnabled: true, yarboLabel: "Yarbo",
  pandagEnabled: false, pandagLabel: "Pandag", pandagMessage: "Contact for Parts and Pricing",
  aftermarketEnabled: false, aftermarketLabel: "Aftermarket", featuredAftermarketEnabled: false,
  featuredAftermarketImageUrl: null, featuredAftermarketImageAlt: null,
  featuredAftermarketHeading: null, featuredAftermarketDescription: null,
  featuredAftermarketIdsExclusive: false, aftermarketDisclaimer: "Disclaimer",
};

function item(index: number, tab: AccessoryItem["tab"] = "lymow"): AccessoryItem {
  return {
    id: String(index), slug: `accessory-${index}`, tab, name: `${tab} Accessory ${index}`,
    description: `Replacement part ${index} for autonomous mowing.`, imageUrl: "/logo.png",
    imageAlt: null, badge: null, idsExclusive: false, manufacturer: tab,
    regularPriceCents: 2999, salePriceCents: null, currentPriceCents: 2999,
    promotionLabel: null, showPublicPrice: true, contactForPricing: false,
    showInBuilder: true, actionType: "builder", actionLabel: null, actionUrl: null,
    priceText: null, sortOrder: index, publicStatus: "active", isIncluded: false,
    isRecommended: false, variantRelationships: [], packageRelationships: [],
    compatibilityLabels: ["Lymow One Plus 5A"],
  };
}

test("initial server HTML contains real accessory cards, descriptions, prices, and compatibility", () => {
  const html = renderToStaticMarkup(<AccessoryCatalog initialData={{ settings, items: [item(1)] }} />);
  assert.match(html, /<h2[^>]*>lymow Accessory 1<\/h2>/);
  assert.match(html, /Replacement part 1 for autonomous mowing/);
  assert.match(html, /\$30/);
  assert.match(html, /Compatible with: Lymow One Plus 5A/);
  assert.doesNotMatch(html, /Loading accessories\.\.\./);
});

test("initial server HTML keeps the brand tabs and six-card pagination", () => {
  const items = [...Array.from({ length: 7 }, (_, index) => item(index + 1)), item(8, "yarbo")];
  const html = renderToStaticMarkup(<AccessoryCatalog initialData={{ settings, items }} />);
  assert.match(html, /role="tab" aria-selected="true"[^>]*>Lymow<\/button>/);
  assert.match(html, /role="tab" aria-selected="false"[^>]*>Yarbo<\/button>/);
  assert.equal((html.match(/<article\b/g) ?? []).length, 6);
  assert.match(html, /Page 1 of 2/);
  assert.doesNotMatch(html, /lymow Accessory 7|yarbo Accessory 8/);
});

test("public page uses the existing filtered server loader and fails on loader errors", () => {
  const page = readFileSync("app/equipment/accessories/page.tsx", "utf8");
  const loader = readFileSync("lib/accessories/server.ts", "utf8");
  assert.match(page, /await readAccessoryCatalog\(false\)/);
  assert.match(page, /<AccessoryCatalog initialData=\{initialData\}/);
  assert.doesNotMatch(page, /catch\s*\(/);
  assert.match(loader, /accessory_listing_enabled && row\.public_status !== "hidden"/);
  assert.ok(loader.includes('if (!admin) items = items.filter((item) => item.visible && settings[`${item.tab}Enabled`]);'));
  assert.match(loader, /links\.filter\(\(link\) => link\.relationship_type !== "excluded"\)/);
});
