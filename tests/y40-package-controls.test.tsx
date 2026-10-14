import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import Y40PackageRelationshipFields from "../components/admin/Y40PackageRelationshipFields";
import { hasY40PackageRelationship, pricingEditorFields } from "../lib/admin-pricing/y40-package-controls";
import { createPricingAdminHandlers } from "../lib/admin-pricing/handlers";
import { packageContextItem } from "../components/admin/YarboPricingWorkspace";
import PricingCatalogCard from "../components/admin/PricingCatalogCard";
import { yarboCoreCanBeSelected, yarboCorePrice } from "../lib/catalog/yarbo-core";
import type { PricingItem } from "../lib/admin-pricing/types";
import { publicProduct } from "./helpers/yarbo-preorder-fixture";

const id = "11111111-1111-4111-8111-111111111111";
const packageVersion = "2026-10-13T10:00:00.000Z";
const relationshipVersion = "2026-10-13T10:01:00.000Z";
const item: PricingItem = {
  id, kind: "packages", productSlug: "yarbo", name: "Yarbo Leaf Blower + Trimmer Package",
  slug: "yarbo-leaf-blower-trimmer", coreAvailabilityUpdatedAt: relationshipVersion,
  brand: "Yarbo", category: "Y40", productName: "Yarbo", publicStatus: "active", availabilityField: "public_status",
  availabilityStatus: "unavailable", isAvailable: false, quoteOnly: false, targetLabel: null,
  effectivePriceCents: null, activeScheduleName: null, dealerCostCents: null, normalDealerCostCents: null,
  promotionalDealerCostCents: null, promotionalDealerCostStartsAt: null, promotionalDealerCostEndsAt: null,
  idsPriceMessage: { message: null, imagePath: null, isPublic: false }, salePriceMessage: { message: null, imagePath: null, isPublic: false },
  values: { core_selectable: true, regular_price_cents: 589900, show_public_price: true,
    contact_for_pricing: false, public_status: "active", core_show_public_price: false, core_contact_for_pricing: false },
};

test("Y40 editor retains package price fields and exposes separate relationship visibility controls", () => {
  assert.equal(hasY40PackageRelationship(item), true);
  for (const field of ["display_msrp_price_cents", "regular_price_cents", "sale_price_cents", "sale_starts_at", "sale_ends_at", "promotion_label", "dealer_cost_cents", "public_status", "show_public_price", "contact_for_pricing", "core_show_public_price", "core_contact_for_pricing"]) {
    assert.ok(pricingEditorFields(item).includes(field), field);
  }
  const html = renderToStaticMarkup(<Y40PackageRelationshipFields draft={item.values} onChange={() => {}} />);
  for (const label of ["Y40 package/Core relationship", "Availability", "Show Public Price", "Contact for Pricing"]) assert.ok(html.includes(label));
  assert.match(html, /<option value="active" selected=""/);
  assert.equal((html.match(/type="checkbox"/g) ?? []).length, 2);
  assert.doesNotMatch(html, /checked=""/);
  assert.doesNotMatch(html, /Manufacturer|Everyday|Temporary Sale/);
});

test("unrelated and Y40P items do not acquire Y40 relationship fields", () => {
  for (const other of [{ ...item, productSlug: "lymow-one-plus" }, { ...item, coreAvailabilityUpdatedAt: undefined }, { ...item, kind: "variants" as const }]) {
    assert.equal(hasY40PackageRelationship(other), false);
    assert.equal(pricingEditorFields(other).includes("core_show_public_price"), false);
  }
});

function api(existing: Record<string, unknown> = {}) {
  const calls: Record<string, unknown>[] = [];
  const handlers = createPricingAdminHandlers({
    isAdmin: async () => true, read: async () => ({ items: [] }),
    readValues: async () => ({ updated_at: packageVersion, core_availability_expected_updated_at: relationshipVersion, ...existing }),
    update: async (_kind, _id, values, expected) => { calls.push({ ...values, packageVersion: expected }); return item; },
  });
  return { calls, patch: (body: Record<string, unknown>, kind = "packages") => handlers.PATCH(new Request("http://local", {
    method: "PATCH", body: JSON.stringify(body), headers: { "content-type": "application/json" },
  }), { params: Promise.resolve({ kind, id }) }) };
}
const versioned = { expectedUpdatedAt: packageVersion, expectedCoreAvailabilityUpdatedAt: relationshipVersion };

test("Y40 guarded save keeps package prices separate from relationship-only flags", async () => {
  const a = api();
  const result = await a.patch({ ...versioned, regular_price_cents: 589900, show_public_price: true, contact_for_pricing: false, public_status: "active", core_show_public_price: true, core_contact_for_pricing: false });
  assert.equal(result.status, 200);
  assert.deepEqual(a.calls, [{ regular_price_cents: 589900, show_public_price: true, contact_for_pricing: false, public_status: "active", core_availability_expected_updated_at: relationshipVersion, core_show_public_price: true, core_contact_for_pricing: false, packageVersion }]);
});

test("relationship-only visibility saves require both current versions", async () => {
  for (const tokens of [
    { ...versioned, expectedUpdatedAt: "2026-10-12T00:00:00Z" },
    { ...versioned, expectedCoreAvailabilityUpdatedAt: "2026-10-12T00:00:00Z" },
    { expectedUpdatedAt: packageVersion },
  ]) {
    const a = api();
    assert.equal((await a.patch({ ...tokens, core_show_public_price: true })).status, 409);
    assert.equal(a.calls.length, 0);
  }
  const a = api();
  assert.equal((await a.patch({ ...versioned, core_show_public_price: true })).status, 200);
  assert.equal(a.calls[0].core_availability_expected_updated_at, relationshipVersion);
  assert.equal("regular_price_cents" in a.calls[0], false);
});

test("relationship controls reject invalid booleans, unrelated packages, and variant writes", async () => {
  for (const value of [null, "true", 1]) assert.equal((await api().patch({ ...versioned, core_show_public_price: value })).status, 422);
  assert.equal((await api({ core_availability_expected_updated_at: null }).patch({ ...versioned, core_show_public_price: true })).status, 422);
  assert.equal((await api().patch({ ...versioned, core_contact_for_pricing: false }, "variants")).status, 422);
});

test("a relationship changed inside the transaction returns conflict", async () => {
  const a = createPricingAdminHandlers({ isAdmin: async () => true, read: async () => ({ items: [] }),
    readValues: async () => ({ updated_at: packageVersion, core_availability_expected_updated_at: relationshipVersion }),
    update: async () => { throw new Error("Core availability changed. Reload before saving."); },
  });
  const result = await a.PATCH(new Request("http://local", { method: "PATCH", body: JSON.stringify({ ...versioned, core_show_public_price: true }) }), { params: Promise.resolve({ kind: "packages", id }) });
  assert.equal(result.status, 409);
});

test("Leaf Blower + Trimmer Y40 becomes available at package-sourced $5,899 while Y40P stays unchanged", () => {
  const product = publicProduct();
  const pkg = product.packages[0];
  Object.assign(pkg, { name: item.name, slug: item.slug, regularPriceCents: 589900, currentPriceCents: 589900, salePriceCents: null, saleIsActive: false, salePhase: "ended" });
  const y40 = product.variants[0];
  const relationship = pkg.corePrices![0];
  Object.assign(relationship, { priceMode: "package", currentPriceCents: 589900, regularPriceCents: 589900, showPublicPrice: false, contactForPricing: false });
  const packageBefore = structuredClone(pkg);
  const proBefore = structuredClone(pkg.corePrices![1]);
  const relationships = pkg.corePrices!;
  // Public RLS omits relationships whose public pricing is suppressed.
  pkg.corePrices = relationships.filter(row => row.showPublicPrice && !row.contactForPricing);
  assert.equal(yarboCorePrice(product, y40, pkg)?.currentPriceCents ?? null, null);
  assert.equal(pkg.currentPriceCents, 589900, "The stored package price survives relationship suppression");
  assert.equal(yarboCoreCanBeSelected(product, y40, pkg), false);
  relationship.showPublicPrice = true;
  pkg.corePrices = relationships.filter(row => row.showPublicPrice && !row.contactForPricing);
  assert.equal(yarboCorePrice(product, y40, pkg)?.currentPriceCents, 589900);
  assert.equal(yarboCoreCanBeSelected(product, y40, pkg), true);
  assert.equal(pkg.currentPriceCents, packageBefore.currentPriceCents);
  assert.deepEqual(pkg.corePrices![1], proBefore);
  const card = packageContextItem({ ...item, updatedAt: packageVersion } as PricingItem, {
    id, packageId: pkg.id, packageName: item.name, coreVariantId: y40.id, coreName: "Y40 Core", coreStatus: "active", priceMode: "package",
    regularPriceCents: 589900, salePriceCents: null, saleStartsAt: null, saleEndsAt: null, promotionLabel: null,
    showPublicPrice: true, contactForPricing: false, publicStatus: "active", effectivePriceCents: 589900,
    effectiveAvailabilityStatus: "active", isAvailable: true, sourceLabel: "Y40 Package",
  });
  const html = renderToStaticMarkup(<PricingCatalogCard item={card} onEdit={() => {}} />);
  assert.match(html, /Current customer price<\/p><p[^>]*>\$5,899\.00/);
  assert.match(html, />Available<\/span>/);
  assert.match(html, /Y40 Package/);
});
