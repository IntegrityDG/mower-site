import assert from "node:assert/strict";
import test from "node:test";
import { CatalogManagementError, currentVersion, validateCatalogValues, validateComponents } from "../lib/catalog-management/validation";
import { assertSelfServicePackageComponents, packageComponentIsSelectable, packageProductIsQuoteOnly } from "../lib/catalog-management/package-policy";

const productId = "11111111-1111-4111-8111-111111111111";
const optionId = "22222222-2222-4222-8222-222222222222";

test("package contents support machines, configurations and accessories with independent quantities", () => {
  assert.deepEqual(validateComponents([{ kind: "products", id: productId, quantity: 1 }, { kind: "variants", id: optionId, quantity: 1 }, { kind: "options", id: optionId, quantity: 2 }]), [
    { kind: "products", id: productId, quantity: 1 }, { kind: "variants", id: optionId, quantity: 1 }, { kind: "options", id: optionId, quantity: 2 },
  ]);
});
test("package contents reject nested packages, duplicate identities, fractional and excessive quantities", () => {
  for (const components of [[], [{ kind: "packages", id: productId, quantity: 1 }], [{ kind: "options", id: optionId, quantity: 1.5 }], [{ kind: "options", id: optionId, quantity: 101 }], [{ kind: "products", id: productId, quantity: 1 }, { kind: "products", id: productId, quantity: 2 }]]) assert.throws(() => validateComponents(components), CatalogManagementError);
});
test("synthetic pricing supports blank IDS Everyday and a deliberate zero sale without deriving cost", () => {
  assert.deepEqual(validateCatalogValues("package-core-prices", { display_msrp_price_cents: 12000, regular_price_cents: null, sale_price_cents: 0, dealer_cost_cents: 7000 }), { display_msrp_price_cents: 12000, regular_price_cents: null, sale_price_cents: 0, dealer_cost_cents: 7000 });
});
test("new products require explicit identity and accept the existing media path architecture", () => {
  const result = validateCatalogValues("products", { name: "Replacement Battery", slug: "replacement-battery", brand: "Example", category: "battery", description: "Replacement part", image_url: "/catalog-assets/battery.png", compatibility: ["Machine A", "Machine A"] }, true);
  assert.equal(result.catalog_category, "battery");
  assert.equal(result.full_description, "Replacement part");
  assert.deepEqual(result.compatibility, ["Machine A"]);
  assert.throws(() => validateCatalogValues("products", { name: "Missing identity" }, true), CatalogManagementError);
});
test("invalid prices, unsupported availability and unapproved metadata fields are rejected", () => {
  for (const values of [{ dealer_cost_cents: -1 }, { regular_price_cents: 1.5 }, { regular_price_cents: 2147483648 }, { public_status: "archived" }, { retired_at: new Date().toISOString() }, { admin_managed: true }]) assert.throws(() => validateCatalogValues("products", values), CatalogManagementError);
});
test("sale window uses explicit dates and rejects a zero or negative duration", () => {
  const values = validateCatalogValues("packages", { sale_starts_at: "2026-10-06T00:00:00-05:00", sale_ends_at: "2026-10-13T00:00:00-05:00" });
  assert.equal(values.sale_starts_at, "2026-10-06T05:00:00.000Z");
  assert.equal(values.sale_ends_at, "2026-10-13T05:00:00.000Z");
  assert.throws(() => validateCatalogValues("packages", { sale_starts_at: "2026-10-06T05:00:00Z", sale_ends_at: "2026-10-06T05:00:00Z" }), CatalogManagementError);
});
test("stale-write tokens are required on catalog mutations", () => {
  assert.equal(currentVersion("2026-10-05T00:00:00Z"), "2026-10-05T00:00:00Z");
  assert.throws(() => currentVersion(undefined), (error: unknown) => error instanceof CatalogManagementError && error.status === 409);
});
test("image metadata rejects executable and insecure URL schemes", () => {
  for (const image_url of ["javascript:alert(1)", "http://example.com/image.png", "data:text/html,test"]) assert.throws(() => validateCatalogValues("products", { image_url }), CatalogManagementError);
});
test("package eligibility preserves existing quote-only sales policy for every component type", () => {
  assert.equal(packageProductIsQuoteOnly({ slug: "pandag-g1", brand: "Other" }), true);
  assert.equal(packageProductIsQuoteOnly({ slug: "new-pandag-machine", brand: "Pandag" }), true);
  for (const kind of ["products", "variants", "options"] as const) {
    assert.equal(packageComponentIsSelectable({ kind, slug: "part", productSlug: "pandag-g1", brand: "Pandag" }, true), false);
  }
  assert.equal(packageComponentIsSelectable({ kind: "options", slug: "battery", productSlug: "lymow-one-plus", brand: "Lymow" }, true), true);
});
test("package picker presents one logical Yarbo Core and excludes physical mirrors", () => {
  assert.equal(packageComponentIsSelectable({ kind: "products", slug: "yarbo", productSlug: "yarbo", brand: "Yarbo" }, true), true);
  for (const slug of ["yarbo-y40", "yarbo-y40p"]) assert.equal(packageComponentIsSelectable({ kind: "variants", slug, productSlug: "yarbo", brand: "Yarbo" }, true), false);
  assert.equal(packageComponentIsSelectable({ kind: "variants", slug: "machine-variant", productSlug: "other-machine", brand: "Other" }, true), true);
  assert.equal(packageComponentIsSelectable({ kind: "options", slug: "retired", productSlug: "yarbo", brand: "Yarbo", retiredAt: "2026-10-05" }, true), false);
});
test("package component validation rejects quote-only parents before saving mixed bundles", () => {
  const quoteParent = { id: productId, slug: "pandag-g1", brand: "Pandag", name: "Pandag" };
  const parents = new Map([[productId, quoteParent]]);
  for (const kind of ["variants", "options"] as const) {
    assert.throws(() => assertSelfServicePackageComponents([{ component: { kind }, row: { id: optionId, product_id: productId, name: "Quoted part" } }], parents), error => error instanceof CatalogManagementError && error.status === 422 && error.message.includes("quote-only") && error.message.includes("Custom Invoice"));
  }
  assert.throws(() => assertSelfServicePackageComponents([{ component: { kind: "products" }, row: quoteParent }], parents), /quote-only/);
  assert.doesNotThrow(() => assertSelfServicePackageComponents([{ component: { kind: "products" }, row: { id: productId, slug: "yarbo", brand: "Yarbo" } }], new Map()));
});
test("configuration and listing families are excluded while their physical components remain selectable", () => {
  for (const [slug, brand] of [["lymow-one-plus", "Lymow"], ["ids-aftermarket", "IDS"]]) {
    assert.equal(packageComponentIsSelectable({ kind: "products", slug, productSlug: slug, brand }, true), false);
    assert.throws(() => assertSelfServicePackageComponents([{ component: { kind: "products" }, row: { slug, brand } }], new Map()), error => error instanceof CatalogManagementError && error.status === 422 && /Select its actual/.test(error.message));
  }
  for (const slug of ["lymow-one-plus-5a", "lymow-one-plus-10a"]) {
    assert.equal(packageComponentIsSelectable({ kind: "variants", slug, productSlug: "lymow-one-plus", brand: "Lymow" }, true), true);
    assert.doesNotThrow(() => assertSelfServicePackageComponents([{ component: { kind: "variants" }, row: { product_id: productId, variant_slug: slug } }], new Map([[productId, { slug: "lymow-one-plus", brand: "Lymow" }]])));
  }
  assert.equal(packageComponentIsSelectable({ kind: "options", slug: "aftermarket-accessory", productSlug: "ids-aftermarket", brand: "IDS" }, true), true);
  assert.doesNotThrow(() => assertSelfServicePackageComponents([{ component: { kind: "options" }, row: { product_id: productId, option_slug: "aftermarket-accessory" } }], new Map([[productId, { slug: "ids-aftermarket", brand: "IDS" }]])));
  assert.equal(packageComponentIsSelectable({ kind: "products", slug: "yarbo", productSlug: "yarbo", brand: "Yarbo" }, true), true);
});
