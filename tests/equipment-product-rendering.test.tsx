import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import ProductConfiguration from "../components/customer-paths/purchase/ProductConfiguration";
import {
  productRequestedByBuildSearch,
  purchaseProgressSteps,
} from "../components/customer-paths/purchase/NationwidePurchaseFlow";
import ProductBuildCta from "../components/equipment/ProductBuildCta";
import ProductPageSections from "../components/equipment/ProductPageSections";
import QuoteOnlyNotice from "../components/equipment/QuoteOnlyNotice";
import YarboInformationSections from "../components/equipment/YarboInformationSections";
import type {
  CatalogOption,
  CatalogPageSection,
  CatalogProduct,
  ProductBuildSelection,
} from "../lib/catalog/types";

const catalogPrice = {
  regularPriceCents: 10000,
  salePriceCents: null,
  currentPriceCents: 10000,
  showPublicPrice: true,
  contactForPricing: false,
  promotionLabel: null,
  saleIsActive: false,
};

function yarboOption(slug: string, name: string, sortOrder: number): CatalogOption {
  return {
    id: slug,
    slug,
    name,
    description: `${name} catalog description.`,
    optionGroupId: "yarbo-modules",
    isRequired: false,
    isIncluded: false,
    isRecommended: false,
    defaultQuantity: 0,
    minimumQuantity: 0,
    maximumQuantity: 1,
    sortOrder,
    ...catalogPrice,
  };
}

const yarboModules = [
  yarboOption("yarbo-mower-module", "Lawn Mower Module", 1),
  yarboOption("yarbo-lawn-mower-pro-module", "Lawn Mower Pro Module", 2),
  yarboOption("yarbo-leaf-blower-module", "Leaf Blower Module", 3),
  yarboOption("yarbo-snow-blower-module", "Snow Blower Module", 4),
  yarboOption("yarbo-trimmer-module", "Trimmer Package", 5),
];

function yarboProduct(
  overrides: Partial<CatalogProduct> = {}
): CatalogProduct {
  return {
    id: "yarbo",
    slug: "yarbo",
    brand: "Yarbo",
    name: "Yarbo Core",
    homepageSummary:
      "A heavy-duty modular platform for complex properties and broader property-maintenance needs.",
    fullDescription: "A modular year-round platform.",
    capabilityLevel: "Heavy-Duty Modular Capability",
    propertyScale: "Large or complex properties",
    customerGuidance: "Confirm the selected modules fit the property.",
    brochureUrl: null,
    videoUrl: null,
    imageUrl: "/yarbo.png",
    imageAlt: "Yarbo Core",
    sortOrder: 1,
    salesMode: "self_service",
    page: {
      heroHeading: "Yarbo Core",
      heroSubheading: "A modular autonomous yard-care platform.",
      longFormContent: null,
      sections: [
        {
          id: "overview",
          heading: "Modular Yard Care Platform",
          bodyContent: "Yarbo Core is the shared base for compatible modules.",
          mediaUrl: null,
          buttonLabel: null,
          buttonUrl: null,
          sortOrder: 1,
        },
      ],
    },
    media: [],
    variants: [],
    optionGroups: [
      {
        id: "yarbo-modules",
        slug: "yarbo-modules",
        name: "Optional Modules",
        description: "Compatible Yarbo modules.",
        selectionType: "multiple",
        isRequired: false,
        minimumSelections: 0,
        maximumSelections: null,
        sortOrder: 1,
        options: yarboModules,
      },
    ],
    ungroupedOptions: [],
    packages: [
      {
        id: "yarbo-lawn-mower",
        slug: "yarbo-lawn-mower",
        name: "Yarbo Lawn Mower",
        description: "Core plus Lawn Mower Module.",
        sortOrder: 1,
        items: [
          {
            optionId: yarboModules[0].id,
            quantity: 1,
            includedInPackagePrice: true,
            option: yarboModules[0],
          },
        ],
        ...catalogPrice,
      },
    ],
    ...catalogPrice,
    ...overrides,
  };
}

test("quote-only notice renders the required Pandag language and existing request route", () => {
  const html = renderToStaticMarkup(<QuoteOnlyNotice />);

  assert.match(html, /Pricing &amp; Project Review/);
  assert.match(html, /IDS project review/);
  assert.match(html, /not available for online purchase or payment/);
  assert.match(html, /Request Pricing &amp; Information/);
  assert.match(html, /href="\/pandag\/project-quote"/);
  assert.doesNotMatch(html, /Build Your System/);
  assert.doesNotMatch(html, /checkout/i);
});

test("Yarbo detail information replaces package grids with catalog-driven sections and components", () => {
  const html = renderToStaticMarkup(
    <YarboInformationSections product={yarboProduct()} />
  );

  for (const heading of [
    "Product overview",
    "Key strengths",
    "Property considerations and limitations",
    "Specifications",
    "How the Yarbo system works",
    "Included base equipment",
    "Yarbo system components",
    "Build one platform around the work your property needs.",
  ]) {
    assert.match(html, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  for (const component of [
    "Yarbo Core",
    "Standard Lawn Mower Module",
    "Lawn Mower Pro Module",
    "Blower Module",
    "Snow Blower Module",
    "Yarbo Trimmer Package",
  ]) {
    assert.match(html, new RegExp(component));
  }

  assert.match(html, /grid-cols-\[repeat\(auto-fit,minmax\(min\(100%,18rem\),1fr\)\)\]/);
  assert.match(html, /requires a Yarbo Core to operate/g);
  assert.match(html, /not currently published in the normalized IDS catalog/);
  assert.doesNotMatch(html, /Complete Yarbo Systems/);
  assert.doesNotMatch(html, /Complete packages grouped by use case/);
  assert.doesNotMatch(html, /Request A Yarbo Package/);
  assert.doesNotMatch(html, /Yarbo Lawn Mower<\/h/);
});

test("Yarbo missing information degrades with explicit catalog notices", () => {
  const html = renderToStaticMarkup(
    <YarboInformationSections
      product={
        yarboProduct({
          homepageSummary: null,
          fullDescription: null,
          capabilityLevel: null,
          propertyScale: null,
          customerGuidance: null,
          page: null,
          optionGroups: [],
          packages: [],
        })
      }
    />
  );

  assert.match(html, /Product overview information is not currently published/);
  assert.match(html, /Detailed Core and module technical specifications/);
  assert.match(html, /No customer-facing Yarbo task modules/);
});

test("shared Lymow and Yarbo build banners keep the approved purchase route", () => {
  const lymowHtml = renderToStaticMarkup(
    <ProductBuildCta supportingText="Choose your Lymow One Plus configuration and compatible accessories first, then check delivery and service availability." />
  );
  const yarboHtml = renderToStaticMarkup(
    <ProductBuildCta
      supportingText="Choose your Yarbo configuration and compatible accessories first, then check delivery and service availability."
      productSlug="yarbo"
    />
  );

  for (const html of [lymowHtml, yarboHtml]) {
    assert.match(html, /Ready to Build Your System\?/);
    assert.match(html, />Build Your System<\/a>/);
    assert.doesNotMatch(html, /Request Yarbo Equipment|equipment request flow/);
  }
  assert.match(lymowHtml, /href="\/#location-and-customer-path"/);
  assert.match(
    yarboHtml,
    /href="\/\?product=yarbo#location-and-customer-path"/
  );
});

test("Yarbo build links preselect only a self-service catalog product", () => {
  const yarbo = yarboProduct();
  const pandag = yarboProduct({
    id: "pandag",
    slug: "pandag-g1",
    name: "Pandag G1",
    salesMode: "quote_only",
  });
  const catalog = {
    products: [yarbo, pandag],
    generatedAt: "2026-08-03T00:00:00.000Z",
  };

  assert.equal(
    productRequestedByBuildSearch(catalog, "?product=yarbo")?.id,
    yarbo.id
  );
  assert.equal(
    productRequestedByBuildSearch(catalog, "?product=pandag-g1"),
    null
  );
  assert.equal(productRequestedByBuildSearch(catalog, ""), null);
});

test("Yarbo package selection remains available in Build Your System", () => {
  const product = yarboProduct();
  const selection: ProductBuildSelection = {
    variantId: "",
    packageId: "",
    optionQuantities: {},
    purchaseMode: "complete-system",
    includeBaseProduct: false,
  };
  const html = renderToStaticMarkup(
    <ProductConfiguration
      product={product}
      selection={selection}
      onSelectVariant={() => undefined}
      onSelectPackage={() => undefined}
      onChangeOptionQuantity={() => undefined}
      onSelectPurchaseMode={() => undefined}
      onToggleBaseProduct={() => undefined}
    />
  );

  assert.match(html, /Complete Yarbo Systems/);
  assert.match(html, /Yarbo Lawn Mower System/);
  assert.match(html, /1 packages/);
  assert.match(html, /Individual Yarbo Equipment/);
});

test("purchase flow exposes the approved five progress steps", () => {
  const labels: string[] = purchaseProgressSteps.map((step) => step.label);

  assert.deepEqual(labels, [
    "Build Your System",
    "Review System",
    "Pricing & Financing",
    "Delivery & Contact",
    "Checkout",
  ]);

  assert.equal(labels.length, 5);
  assert.ok(!labels.includes("Browse Equipment"));
  assert.ok(!labels.includes("Select Equipment"));
  assert.ok(!labels.includes("Availability"));
  assert.ok(!labels.includes("Request"));
});

test("product sections render in sort order as escaped text with paragraph breaks", () => {
  const sections: CatalogPageSection[] = [
    {
      id: "second",
      heading: "Second",
      bodyContent: "Final model selection remains subject to IDS project review.",
      mediaUrl: null,
      buttonLabel: null,
      buttonUrl: null,
      sortOrder: 20,
    },
    {
      id: "first",
      heading: "<First>",
      bodyContent: "Paragraph one.\n\n<script>alert('unsafe')</script>",
      mediaUrl: null,
      buttonLabel: null,
      buttonUrl: null,
      sortOrder: 10,
    },
  ];

  const html = renderToStaticMarkup(<ProductPageSections sections={sections} />);

  assert.ok(html.indexOf("&lt;First&gt;") < html.indexOf("Second"));
  assert.match(html, /whitespace-pre-line/);
  assert.match(html, /Paragraph one\.\n\n&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /IDS project review/);
});
