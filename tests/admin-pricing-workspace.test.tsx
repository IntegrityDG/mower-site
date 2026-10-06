import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "node:fs";
import PricingCatalogCard from "../components/admin/PricingCatalogCard";
import CatalogManagement, { componentReferenceTotal } from "../components/admin/CatalogManagement";
import { corePriceDraft, corePricePreview, isPairedYarboPackage, packageContextItem } from "../components/admin/YarboPricingWorkspace";
import type { PricingItem } from "../lib/admin-pricing/types";
import type { PackageCorePriceAdminRow } from "../lib/admin-pricing/package-core-prices";
import type { ManagedCatalogItem } from "../lib/catalog-management/types";

const item: PricingItem = {
  id: "package", kind: "packages", category: "Yarbo Package", name: "Mower + Snow Blower", slug: "mower-snow", brand: "Yarbo", productName: "Yarbo", publicStatus: "active", availabilityField: "public_status", availabilityStatus: "active", isAvailable: true, quoteOnly: false, targetLabel: null,
  values: { display_msrp_price_cents: 899900, regular_price_cents: null, sale_price_cents: 799900 }, effectivePriceCents: 699900, effectiveSourceLabel: "Y40 Package · active schedule", effectiveExplanation: "Active schedule controls the checkout amount.", saleState: "active", activeScheduleName: "Schedule", dealerCostCents: 400000, normalDealerCostCents: 400000, promotionalDealerCostCents: null, promotionalDealerCostStartsAt: null, promotionalDealerCostEndsAt: null, idsPriceMessage: { message: null, imagePath: null, isPublic: false }, salePriceMessage: { message: null, imagePath: null, isPublic: false },
};
const context = (coreName: string, salePriceCents: number, cost: number): PackageCorePriceAdminRow => ({ id: coreName, packageId: item.id, packageName: item.name, coreVariantId: coreName, coreName, coreStatus: "active", priceMode: coreName === "Y40" ? "package" : "core_specific", displayMsrpPriceCents: 999900, regularPriceCents: null, salePriceCents, saleStartsAt: "2026-10-01T05:00:00Z", saleEndsAt: "2026-11-01T05:00:00Z", promotionLabel: "Fall sale", showPublicPrice: true, contactForPricing: false, publicStatus: "active", effectivePriceCents: salePriceCents, dealerCostCents: cost, normalDealerCostCents: cost, effectiveAvailabilityStatus: "active", isAvailable: true, saleState: "active", sourceLabel: `${coreName} Package authority`, explanation: "Shared resolver checked the Core and package." });

test("compact card displays the resolved customer amount, separate blank IDS amount, and private cost without profit blocks", () => {
  const html = renderToStaticMarkup(createElement(PricingCatalogCard, { item, onEdit: () => undefined, onDelete: () => undefined }));
  assert.match(html, /Current customer price<\/p><p[^>]*>\$6,999\.00/);
  assert.match(html, /Y40 Package · active schedule/);
  assert.match(html, /IDS Everyday Price<\/dt><dd[^>]*>Not set/);
  assert.match(html, /Dealer Cost — PRIVATE \/ IDS INTERNAL ONLY/);
  assert.match(html, /\$4,000\.00/);
  assert.match(html, />Edit<\/button>/); assert.match(html, />Delete<\/button>/);
  assert.doesNotMatch(html, /Gross Profit|Gross Margin/);
});

test("package cards retain one logical identity while showing independent Core prices and dealer costs", () => {
  const y40 = packageContextItem(item, context("Y40", 699900, 400000));
  const y40p = packageContextItem(item, context("Y40P", 899900, 600000));
  assert.equal(y40.id, y40p.id); assert.equal(y40.slug, y40p.slug);
  assert.equal(y40.effectivePriceCents, 699900); assert.equal(y40p.effectivePriceCents, 899900);
  assert.equal(y40.dealerCostCents, 400000); assert.equal(y40p.dealerCostCents, 600000);
  assert.equal(y40.values.regular_price_cents, null); assert.equal(y40p.values.regular_price_cents, null);
  y40.values.sale_price_cents = 1;
  assert.equal(y40p.values.sale_price_cents, 899900); assert.equal(item.values.sale_price_cents, 799900);
});

test("package card uses effective component/Core availability and suppresses absent resolved price", () => {
  const row = { ...context("Y40P", 899900, 600000), effectivePriceCents: null, effectiveAvailabilityStatus: "unavailable", isAvailable: false, availabilityExplanation: "A component was retired." };
  const card = packageContextItem(item,row);
  assert.equal(card.effectivePriceCents,null); assert.equal(card.isAvailable,false); assert.equal(card.availabilityStatus,"unavailable");
  assert.match(card.effectiveExplanation ?? "", /A component was retired/);
  const blocked = renderToStaticMarkup(createElement(PricingCatalogCard, { item: { ...item, isAvailable: false }, onEdit: () => undefined }));
  assert.match(blocked, />Unavailable<\/span>/);
});

test("Core price editing preserves stored visibility while parent availability suppresses effective public pricing", () => {
  const row = { ...context("Y40P", 899900, 600000), effectivePriceCents: null, showPublicPrice: false, contactForPricing: true, storedShowPublicPrice: true, storedContactForPricing: false };
  const draft = corePriceDraft(row);
  assert.equal(draft.showPublicPrice,true);
  assert.equal(draft.contactForPricing,false);
  const card = packageContextItem(item,row);
  assert.equal(card.values.show_public_price,true);
  assert.equal(card.values.contact_for_pricing,false);
  assert.equal(card.effectivePriceCents,null);
  const legacyDraft = corePriceDraft({ ...context("Y40P",899900,600000), showPublicPrice:false,contactForPricing:true });
  assert.equal(legacyDraft.showPublicPrice,false);
  assert.equal(legacyDraft.contactForPricing,true);
});

test("a single legacy Core context stays a normal package while a complete Y40/Y40P configuration forms a pair", () => {
  assert.equal(isPairedYarboPackage(item, [context("Y40",699900,400000)]),false);
  assert.equal(isPairedYarboPackage(item, [context("Y40",699900,400000),context("Y40P",899900,600000)]),true);
  assert.equal(isPairedYarboPackage({ ...item, values: { ...item.values, core_selectable: true } },[]),true);
});

test("a blocked parent suppresses proposed Core pricing while preserving stored source flags", () => {
  const row = { ...context("Y40P",899900,600000), regularPriceCents: 100000, salePriceCents: null, saleStartsAt: null, saleEndsAt: null, effectivePriceCents: null, showPublicPrice: false, storedShowPublicPrice: true, storedContactForPricing: false, priceContextBlocked: true };
  const draft = corePriceDraft(row);
  assert.equal(draft.showPublicPrice,true);
  assert.equal(corePricePreview(row,draft),null);
  assert.equal(corePricePreview(row,{ ...draft, regular:"1500.00",status:"active" }),null);
  assert.equal(corePricePreview({ ...row,priceContextBlocked:false },draft),100000);
});

test("product and package creation expose separate actions", () => {
  const html = renderToStaticMarkup(createElement(CatalogManagement, { action: null, onAction: () => undefined, onSaved: async () => undefined }));
  assert.match(html, /\+ Add New Product/); assert.match(html, /\+ Create New Package/);
  assert.equal((html.match(/<button/g) ?? []).length, 2);
});

test("component reference total respects source identity and quantity without setting a package price", () => {
  const product = { id: "same", kind: "products", effectivePriceCents: 10000 } as ManagedCatalogItem;
  const battery = { id: "same", kind: "options", effectivePriceCents: 2500 } as ManagedCatalogItem;
  const unknown = { id: "unpriced", kind: "variants", effectivePriceCents: null } as ManagedCatalogItem;
  const total = componentReferenceTotal([{ kind: "products", id: "same", quantity: 1 }, { kind: "options", id: "same", quantity: 2 }, { kind: "variants", id: "unpriced", quantity: 1 }], [product,battery,unknown]);
  assert.deepEqual(total, { cents: 15000, unknown: 1 });
  assert.equal(item.values.regular_price_cents,null);
});

test("the redundant old package/Core presentation has no remaining render path", () => {
  const page = readFileSync("app/admin/pricing/page.tsx", "utf8");
  assert.doesNotMatch(page, /PackageCorePricing|Package \+ Core pricing|Gross Profit|Gross Margin/);
  assert.equal(existsSync("components/admin/PackageCorePricing.tsx"),false);
});
