import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import * as runtime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CatalogProduct, CatalogResponse, CatalogVariant } from "../lib/catalog/types";
import { isLymowConfiguration, lymowVariantPage, lymowVariantPath } from "../lib/catalog/lymow-variant-pages";
import * as variantPages from "../lib/catalog/lymow-variant-pages";
import { priceFromRow } from "../lib/catalog/public-price";
import { resolveBuildSelection } from "../lib/catalog/selection";
import { resolveEquipmentCatalogPricing } from "../lib/checkout/equipment-pricing";
import type { CheckoutCatalog } from "../lib/checkout/eligibility";
import type { CheckoutRequest } from "../lib/checkout/types";
import CatalogHeader from "../components/equipment/CatalogHeader";
import LymowPriceDisplay from "../components/equipment/LymowPriceDisplay";
import * as brochure from "../components/equipment/lymowBrochureContent";
import NationwidePurchaseFlow from "../components/customer-paths/purchase/NationwidePurchaseFlow";
import BreadcrumbJsonLd, * as breadcrumb from "../components/seo/BreadcrumbJsonLd";
import LymowVariantJsonLd, { lymowVariantJsonLd } from "../components/seo/LymowVariantJsonLd";
import sitemap from "../app/sitemap";
import { loadInstallationModule } from "./helpers/installation-module";

const price = { regularPriceCents: 264900, salePriceCents: 259900, currentPriceCents: 264900, showPublicPrice: true, contactForPricing: false, promotionLabel: null, saleIsActive: false };
function fixture(): CatalogProduct {
  const variant = (key: "5a" | "10a", cents: number): CatalogVariant => ({ ...price, regularPriceCents: cents, currentPriceCents: cents, id: key, slug: `lymow-one-plus-${key}`, sku: null, name: `${key.toUpperCase()} Configuration`, description: `${key.toUpperCase()} mower configuration`, sortOrder: 1, definingOptionIds: [`charger-${key}`], isAvailable: true, publicStatus: "active", purchaseState: "available" });
  return { ...price, id: "lymow", slug: "lymow-one-plus", brand: "Lymow", name: "Lymow One Plus", homepageSummary: null, fullDescription: null, capabilityLevel: null, propertyScale: null, customerGuidance: null, brochureUrl: null, videoUrl: null, imageUrl: "/test.webp", imageAlt: "Lymow", sortOrder: 1, salesMode: "self_service", isAvailable: true, publicStatus: "active", page: null, media: [], variants: [variant("5a", 264900), variant("10a", 284900)], packages: [], optionGroups: [], ungroupedOptions: [] };
}
function catalog(product = fixture()): CatalogResponse { return { products: [product], generatedAt: "2026-11-04T17:00:00Z" }; }
function route(value: CatalogResponse | Error) {
  return loadInstallationModule<typeof import("../app/equipment/[slug]/[configuration]/page")>("app/equipment/[slug]/[configuration]/page.tsx", {
    "react": React, "react/jsx-runtime": runtime, "next/image": Image, "next/link": Link, "next/navigation": { notFound },
    "@/lib/catalog/load-public-catalog": { loadPublicCatalog: async () => { if (value instanceof Error) throw value; return value; } },
    "@/lib/catalog/lymow-variant-pages": variantPages,
    "@/components/equipment/CatalogHeader": CatalogHeader,
    "@/components/equipment/LymowPriceDisplay": LymowPriceDisplay,
    "@/components/equipment/lymowBrochureContent": brochure,
    "@/components/customer-paths/purchase/NationwidePurchaseFlow": NationwidePurchaseFlow,
    "@/components/seo/BreadcrumbJsonLd": { __esModule: true, ...breadcrumb, default: BreadcrumbJsonLd },
    "@/components/seo/LymowVariantJsonLd": LymowVariantJsonLd,
  });
}
function schemas(html: string) { return [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1])); }

for (const key of ["5a", "10a"] as const) {
  test(`${key}: real page renders exact price, selected purchase configuration, canonical and discoverable sibling`, async () => {
    const value = catalog();
    const page = lymowVariantPage(value.products[0], key)!;
    const handler = route(value);
    const params = Promise.resolve({ slug: "lymow-one-plus", configuration: key });
    const html = renderToStaticMarkup(await handler.default({ params }));
    const data = schemas(html).find((s) => s["@type"] === "Product");
    assert.equal(data.offers.price, key === "5a" ? "2649.00" : "2849.00");
    assert.equal(data.url, page.url);
    assert.equal(data.offers.url, page.url);
    assert.equal(data.offers.priceCurrency, "USD");
    assert.equal(data.sku, `IDS-LYMOW-ONE-PLUS-${key.toUpperCase()}`);
    assert.equal(data.offers.availability, undefined, "Sellability must not become an inventory claim");
    assert.equal(data.review, undefined);
    assert.equal(data.aggregateRating, undefined);
    assert.match(html, key === "5a" ? /\$2,649/ : /\$2,849/);
    assert.match(html, /Available to order/);
    assert.match(html, /href="#purchase-configuration"/);
    assert.match(html, /href="\/equipment\/lymow-one-plus\/5a"/);
    assert.match(html, /href="\/equipment\/lymow-one-plus\/10a"/);
    assert.ok(!html.includes("Choose Your Machine"), "Variant entry must skip the family chooser");
    const builder = html.slice(html.indexOf('id="purchase-configuration"'));
    assert.match(builder, new RegExp(`${key.toUpperCase()} Configuration`));
    assert.doesNotMatch(builder, new RegExp(`${key === "5a" ? "10A" : "5A"} Configuration`));
    const metadata = await handler.generateMetadata({ params });
    assert.equal(metadata.alternates?.canonical, page.url);
    assert.ok(sitemap().some((entry) => entry.url === page.url));
    const build = resolveBuildSelection(page.product, { variantId: page.variant.id, packageId: "", optionQuantities: {} });
    assert.equal(build.selectedVariant?.id, page.variant.id);
    assert.equal(build.equipmentTotalCents, Number(data.offers.price) * 100);
  });
}

test("only the two reviewed Lymow routes are published; unknown identities 404", async () => {
  for (const key of ["5A", "5a?price=1", "pro", "toString", "constructor"]) assert.equal(isLymowConfiguration(key), false);
  const handler = route(catalog());
  for (const params of [{ slug: "yarbo", configuration: "5a" }, { slug: "pandag-g1", configuration: "10a" }, { slug: "lymow-one-plus", configuration: "other" }]) {
    await assert.rejects(handler.default({ params: Promise.resolve(params) }), /NEXT_HTTP_ERROR_FALLBACK;404/);
  }
  const product = fixture(); product.variants = [];
  await assert.rejects(route(catalog(product)).default({ params: Promise.resolve({ slug: "lymow-one-plus", configuration: "5a" }) }), /NEXT_HTTP_ERROR_FALLBACK;404/);
});

test("no offers or purchasing flow when a price, parent, defining-equipment availability or public selling permission is missing", async () => {
  const cases = [
    (p: CatalogProduct) => { p.isAvailable = false; },
    (p: CatalogProduct) => { p.variants[0].isAvailable = false; },
    (p: CatalogProduct) => { p.salesMode = "quote_only"; },
    (p: CatalogProduct) => { p.variants[0].showPublicPrice = false; },
    (p: CatalogProduct) => { p.variants[0].contactForPricing = true; },
    (p: CatalogProduct) => { p.variants[0].currentPriceCents = null; },
    (p: CatalogProduct) => { p.variants[0].currentPriceCents = NaN; },
  ];
  for (const mutate of cases) {
    const product = fixture(); mutate(product);
    assert.equal(lymowVariantJsonLd(lymowVariantPage(product, "5a")!), null);
    const html = renderToStaticMarkup(await route(catalog(product)).default({ params: Promise.resolve({ slug: product.slug, configuration: "5a" }) }));
    assert.ok(!schemas(html).some((s) => s["@type"] === "Product"));
    assert.doesNotMatch(html, /id="purchase-configuration"/);
    assert.match(html, /Currently unavailable for online purchase/);
  }
});

test("visible prices and offers agree across sale boundaries", async () => {
  const row = { display_msrp_price_cents: 299900, regular_price_cents: 264900, sale_price_cents: 259900, sale_starts_at: "2026-11-01T00:00:00Z", sale_ends_at: "2026-11-04T00:00:00Z", promotion_label: "Sale", show_public_price: true, contact_for_pricing: false };
  for (const [time, expected] of [["2026-10-31T23:59:59Z", "2649.00"], ["2026-11-01T00:00:00Z", "2599.00"], ["2026-11-04T00:00:00Z", "2649.00"]]) {
    const product = fixture(); Object.assign(product.variants[0], priceFromRow(row, Date.parse(time)));
    assert.equal(lymowVariantJsonLd(lymowVariantPage(product, "5a")!)?.offers.price, expected);
    const html = renderToStaticMarkup(await route(catalog(product)).default({ params: Promise.resolve({ slug: product.slug, configuration: "5a" }) }));
    const offer = schemas(html).find((schema) => schema["@type"] === "Product").offers;
    assert.equal(offer.price, expected);
    const hero = html.slice(0, html.indexOf('<nav aria-label="Lymow configuration"'));
    assert.ok(hero.includes(new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(expected))));
  }
});

test("explicit authorized preorder is kept distinct from normal sellability", () => {
  const product = fixture(); product.variants[0].purchaseState = "preorder";
  assert.equal(lymowVariantJsonLd(lymowVariantPage(product, "5a")!)?.offers.availability, "https://schema.org/PreOrder");
});

test("catalog outages propagate as errors instead of an indexable fake product or a false 404", async () => {
  await assert.rejects(route(new Error("Catalog temporarily unavailable")).default({ params: Promise.resolve({ slug: "lymow-one-plus", configuration: "5a" }) }), /Catalog temporarily unavailable/);
});

test("catalog description and merchant code cannot escape JSON-LD", () => {
  const product = fixture(); product.variants[0].description = "</script><script>unsafe()</script>";
  const html = renderToStaticMarkup(<LymowVariantJsonLd page={lymowVariantPage(product, "5a")!} />);
  assert.equal([...html.matchAll(/<script\b/g)].length, 1);
  assert.equal(schemas(html)[0].description, product.variants[0].description);
});

test("each published selection resolves to its exact current server checkout price and included charger", () => {
  const base = { public_status: "active", regular_price_cents: 299900, sale_price_cents: null, sale_starts_at: null, sale_ends_at: null, show_public_price: true, contact_for_pricing: false };
  const product = fixture();
  const checkout: CheckoutCatalog = {
    product: { ...base, id: product.id, slug: product.slug, name: product.name, brand: product.brand },
    variants: product.variants.map((v) => ({ ...base, id: v.id, product_id: product.id, variant_slug: v.slug, name: v.name, sku: null, description: v.description, regular_price_cents: v.currentPriceCents })),
    options: product.variants.map((v) => ({ ...base, id: v.definingOptionIds[0], product_id: product.id, option_slug: v.slug.replace("one-plus-", "") + "-charger", name: `${v.name} charger`, description: null, minimum_quantity: 0, maximum_quantity: 1 })),
    variantOptions: product.variants.map((v) => ({ id: `link-${v.id}`, variant_id: v.id, option_id: v.definingOptionIds[0], relationship_type: "defines_variant" })),
    packages: [], packageItems: [],
  };
  for (const key of ["5a", "10a"] as const) {
    const page = lymowVariantPage(product, key)!;
    const request = { requestId: "test", paymentMethod: "card", selection: { productId: product.id, variantId: page.variant.id, purchaseMode: "standard", packageId: null, options: [], includeBaseProduct: false }, customer: { name: "Test", email: "test@example.com", phone: null }, shippingAddress: { line1: "1 Test", line2: null, city: "Test", state: "MO", postalCode: "63901", country: "US" } } as CheckoutRequest;
    const snapshot = resolveEquipmentCatalogPricing(request, checkout);
    assert.equal(snapshot.variant?.slug, page.variant.slug);
    assert.equal(snapshot.subtotalCents, Number(lymowVariantJsonLd(page)!.offers.price) * 100);
    assert.equal(snapshot.chargeableItems.filter((item) => item.itemType === "variant").length, 1);
  }
  checkout.options[0].public_status = "unavailable";
  const request: CheckoutRequest = { requestId: "test", paymentMethod: "card", selection: { productId: product.id, variantId: "5a", purchaseMode: "standard", packageId: null, options: [], includeBaseProduct: false }, customer: { name: "Test", email: "test@example.com", phone: null }, shippingAddress: { line1: "1 Test", line2: null, city: "Test", state: "MO", postalCode: "63901", country: "US" } };
  assert.throws(() => resolveEquipmentCatalogPricing(request, checkout), /unavailable/);
  assert.equal(lymowVariantPath("10a"), "/equipment/lymow-one-plus/10a");
});
