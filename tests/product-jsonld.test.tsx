import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { CatalogOption, CatalogPrice, CatalogProduct, CatalogVariant } from "../lib/catalog/types";
import { IDS_CANONICAL_ORIGIN } from "../lib/site-origin";
import { equipmentProductPage } from "./helpers/equipment-product-page";

const cases = [
  {
    slug: "lymow-one-plus", name: "Lymow One Plus", brand: "Lymow",
    title: "Lymow One Plus Robot Mower | Dealer, Demo & Installation | IDS",
    description: "Explore the Lymow One Plus tracked robot mower with RTK and VSLAM navigation. Compare configurations and ask IDS about demos, installation and support.",
    variants: [["lymow-one-plus-5a", "5A Configuration", 269900], ["lymow-one-plus-10a", "10A Configuration", 284900]],
    option: ["lymow-straight-blade-2", "Straight Blade 2.0"], visiblePrice: "$2,699",
  },
  {
    slug: "yarbo", name: "Yarbo Core", brand: "Yarbo",
    title: "Yarbo Pro Robot Mower | Dealer, Demo & Installation | IDS",
    description: "Explore Yarbo Pro mowing with a tracked modular Core, RTK navigation and compatible task modules. Compare configurations and ask IDS about demos and installation.",
    variants: [["yarbo-y40", "Y40 Core", 349900], ["yarbo-y40p", "Y40P Core", 449900]],
    option: ["yarbo-lawn-mower-pro-module", "Lawn Mower Pro Module"], visiblePrice: "$3,499",
  },
  {
    slug: "pandag-g1", name: "Pandag G1", brand: "Pandag",
    title: "Pandag G1 Commercial Robot Mower | IDS",
    description: "Explore Pandag G1 commercial robotic mowers for parks, campuses and other large properties. Review model options and request an IDS project quote.",
    variants: [["pandag-g1-m1500-sd", "Pandag G1 M1500 SD", null], ["pandag-g1-pro-m3000", "Pandag G1 PRO M3000", null]],
    option: ["pandag-charging-dock", "Pandag G1 Charging Dock"], visiblePrice: null,
  },
] as const;

function price(cents: number | null): CatalogPrice {
  return {
    regularPriceCents: cents, salePriceCents: null, currentPriceCents: cents,
    showPublicPrice: cents !== null, contactForPricing: cents === null,
    promotionLabel: null, saleIsActive: false,
  };
}

function fixture(item: typeof cases[number], isAvailable: boolean): CatalogProduct {
  const availability = { isAvailable, publicStatus: isAvailable ? "active" as const : "unavailable" as const };
  const variants: CatalogVariant[] = item.variants.map(([slug, name, cents], index) => ({
    id: slug, slug, name, sku: null, description: `${name} configuration description.`,
    sortOrder: index, definingOptionIds: [], ...price(cents), ...availability,
  }));
  const option: CatalogOption = {
    id: item.option[0], slug: item.option[0], name: item.option[1],
    description: `${item.option[1]} accessory description.`, optionGroupId: null,
    isRequired: false, isIncluded: false, isRecommended: false, defaultQuantity: 0,
    minimumQuantity: 0, maximumQuantity: 1, sortOrder: 1,
    ...price(item.slug === "pandag-g1" ? null : 20000), ...availability,
  };
  return {
    id: item.slug, slug: item.slug, name: item.name, brand: item.brand,
    homepageSummary: `${item.name} summary shown to customers.`,
    fullDescription: `${item.name} detailed product information.`,
    capabilityLevel: "Autonomous property maintenance", propertyScale: "Large properties",
    customerGuidance: "Ask IDS to review your property.", brochureUrl: null, videoUrl: null,
    imageUrl: `/products/${item.slug}.webp`, imageAlt: item.name, sortOrder: 1,
    salesMode: item.slug === "pandag-g1" ? "quote_only" : "self_service",
    page: { heroHeading: item.name, heroSubheading: null, longFormContent: null, sections: [] },
    media: [], variants, optionGroups: [], ungroupedOptions: [option], packages: [],
    ...price(item.slug === "pandag-g1" ? null : item.variants[0][2]), ...availability,
  };
}

function schemas(html: string): unknown[] {
  return [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
    .map((match) => JSON.parse(match[1]));
}

function assertNoCommerceSchema(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(assertNoCommerceSchema);
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (key === "@type") {
        for (const type of Array.isArray(child) ? child : [child]) {
          assert.doesNotMatch(String(type), /^(?:https?:\/\/schema\.org\/)?(?:Product|ProductGroup|ProductModel|Offer|AggregateOffer|Review|AggregateRating|Rating)$/);
        }
      }
      assert.ok(!["offers", "review", "reviews", "aggregateRating", "ratingValue"].includes(key), `Unexpected ${key} claim`);
      assertNoCommerceSchema(child);
    }
  }
}

function visibleText(html: string) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
}

for (const item of cases) {
  for (const isAvailable of [true, false]) {
    test(`${item.name} ${isAvailable ? "available" : "unavailable"} family page keeps its content and canonical breadcrumbs without Product claims`, async () => {
      const product = fixture(item, isAvailable);
      const { default: ProductPage } = equipmentProductPage({ products: [product], generatedAt: "2026-10-30T00:00:00Z" });
      const html = renderToStaticMarkup(await ProductPage({ params: Promise.resolve({ slug: item.slug }) }));
      const jsonLd = schemas(html);

      assertNoCommerceSchema(jsonLd);
      assert.deepEqual(jsonLd, [{
        "@context": "https://schema.org", "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: IDS_CANONICAL_ORIGIN },
          { "@type": "ListItem", position: 2, name: "Equipment", item: `${IDS_CANONICAL_ORIGIN}/equipment` },
          { "@type": "ListItem", position: 3, name: item.name, item: `${IDS_CANONICAL_ORIGIN}/equipment/${item.slug}` },
        ],
      }]);

      const text = visibleText(html);
      assert.ok(text.includes(item.name));
      assert.ok(text.includes(item.option[1]), "Compatible equipment remains visible");
      assert.match(html, /href="\/services-scheduling"/);
      if (isAvailable && item.slug === "pandag-g1") {
        assert.match(text, /Contact IDS for a Commercial Quote Today/);
        assert.match(html, /href="\/pandag\/project-quote"/);
        assert.doesNotMatch(text, /\$[\d,]+/);
      } else if (isAvailable) {
        assert.ok(text.includes(item.visiblePrice!), "Starting price remains visible");
        assert.match(text, /Starting at/);
        assert.match(text, /Build Your System/);
        assert.ok(html.includes(`href="/?product=${item.slug}#location-and-customer-path"`));
        assert.match(html, /href="\/professional-installation"/);
      } else {
        assert.match(text, /Unavailable/);
        assert.doesNotMatch(text, /Starting at/);
        assert.ok(!html.includes(`href="/?product=${item.slug}#location-and-customer-path"`));
      }
    });
  }

  test(`${item.name} retains its title, description, and canonical metadata`, async () => {
    const { generateMetadata } = equipmentProductPage(new Error("Metadata for a known family must not load the catalog"));
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: item.slug }) });
    // Metadata is returned by a VM module, so compare serializable values.
    assert.deepEqual(JSON.parse(JSON.stringify(metadata)), {
      title: item.title, description: item.description, alternates: { canonical: `/equipment/${item.slug}` },
    });
  });
}

test("catalog failure renders the existing fallback without product or breadcrumb claims", async () => {
  const { default: ProductPage } = equipmentProductPage(new Error("Catalog unavailable"));
  const html = renderToStaticMarkup(await ProductPage({ params: Promise.resolve({ slug: "lymow-one-plus" }) }));
  assert.match(visibleText(html), /Unable to load product\./);
  assert.deepEqual(schemas(html), []);
});

test("a catalog name cannot escape the remaining breadcrumb JSON-LD script", async () => {
  const product = { ...fixture(cases[0], true), name: "Lymow </script><script>alert(1)</script>" };
  const { default: ProductPage } = equipmentProductPage({ products: [product], generatedAt: "2026-10-30T00:00:00Z" });
  const html = renderToStaticMarkup(await ProductPage({ params: Promise.resolve({ slug: product.slug }) }));
  assert.equal([...html.matchAll(/<script\b/g)].length, 1);
  const jsonLd = schemas(html) as { itemListElement: { name: string }[] }[];
  assert.equal(jsonLd[0].itemListElement[2].name, product.name);
  assertNoCommerceSchema(jsonLd);
});
