import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import ProductConfiguration from "../components/customer-paths/purchase/ProductConfiguration";
import ProductSelection from "../components/customer-paths/purchase/ProductSelection";
import {
  productRequestedByBuildSearch,
  purchaseProgressSteps,
} from "../components/customer-paths/purchase/NationwidePurchaseFlow";
import ProductBuildCta from "../components/equipment/ProductBuildCta";
import LymowInformationSections from "../components/equipment/LymowInformationSections";
import { LYMOW_BROCHURE_IMAGE_PATHS } from "../components/equipment/lymowBrochureContent";
import PandagInformationSections from "../components/equipment/PandagInformationSections";
import { PANDAG_BROCHURE_IMAGE_PATHS } from "../components/equipment/pandagBrochureContent";
import ProductPageSections from "../components/equipment/ProductPageSections";
import QuoteOnlyNotice from "../components/equipment/QuoteOnlyNotice";
import YarboInformationSections from "../components/equipment/YarboInformationSections";
import {
  YARBO_BROCHURE_IMAGE_PATHS,
  YARBO_OMITTED_BROCHURE_SPECS,
} from "../components/equipment/yarboBrochureContent";
import type {
  CatalogOption,
  CatalogPageSection,
  CatalogProduct,
  ProductBuildSelection,
} from "../lib/catalog/types";
import { findCatalogProductBySlug } from "../lib/catalog/product-routing";

const catalogPrice = {
  isAvailable: true,
  publicStatus: "active" as const,
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
        id: "yarbo-lawn-mower-pro",
        slug: "yarbo-lawn-mower-pro",
        name: "Yarbo Lawn Mower Pro",
        description: "Core plus Lawn Mower Pro Module.",
        sortOrder: 1,
        items: [
          {
            optionId: yarboModules[1].id,
            quantity: 1,
            includedInPackagePrice: true,
            option: yarboModules[1],
          },
        ],
        ...catalogPrice,
      },
    ],
    ...catalogPrice,
    ...overrides,
  };
}

function lymowOption(
  slug: string,
  name: string,
  sortOrder: number,
  optionGroupId = "lymow-accessories"
): CatalogOption {
  return {
    id: slug,
    slug,
    name,
    description: `${name} catalog description.`,
    optionGroupId,
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

const lymowCharger5 = lymowOption(
  "lymow-5a-charger",
  "5A Charger Configuration",
  1,
  "lymow-charger-config"
);
const lymowCharger10 = lymowOption(
  "lymow-10a-charger",
  "10A Charger Configuration",
  2,
  "lymow-charger-config"
);
const lymowAccessories = [
  lymowOption("lymow-battery-528wh", "Lymow One Plus Battery", 1),
  lymowOption("lymow-straight-blade-2", "Straight Blade 2.0", 2),
  lymowOption("lymow-tracks-pair", "Replacement Lymow Track", 3),
];

function lymowProduct(
  overrides: Partial<CatalogProduct> = {}
): CatalogProduct {
  return {
    id: "lymow",
    slug: "lymow-one-plus",
    brand: "Lymow",
    name: "Lymow One Plus",
    homepageSummary:
      "A tracked virtual-boundary mower for demanding residential lawns.",
    fullDescription:
      "A tracked robotic mower for segmented, sloped, uneven, and multi-zone residential lawns.",
    capabilityLevel: "Tracked autonomous mowing",
    propertyScale: "Complex residential properties",
    customerGuidance: "Choose a configuration based on daily mowing demand.",
    brochureUrl: null,
    videoUrl: null,
    imageUrl: "/lymow.png",
    imageAlt: "Lymow One Plus",
    sortOrder: 1,
    salesMode: "self_service",
    page: {
      heroHeading: "Lymow One Plus",
      heroSubheading: "Tracked autonomous mowing.",
      longFormContent: null,
      sections: [],
    },
    media: [],
    variants: [
      {
        id: "lymow-5a",
        slug: "lymow-one-plus-5a",
        sku: null,
        name: "Lymow One Plus — 5A Configuration",
        description: "5A mower configuration.",
        sortOrder: 1,
        definingOptionIds: [lymowCharger5.id],
        ...catalogPrice,
      },
      {
        id: "lymow-10a",
        slug: "lymow-one-plus-10a",
        sku: null,
        name: "Lymow One Plus — 10A Configuration",
        description: "10A mower configuration.",
        sortOrder: 2,
        definingOptionIds: [lymowCharger10.id],
        ...catalogPrice,
      },
    ],
    optionGroups: [
      {
        id: "lymow-charger-config",
        slug: "lymow-charger-config",
        name: "Charger Configuration",
        description: null,
        selectionType: "single",
        isRequired: true,
        minimumSelections: 1,
        maximumSelections: 1,
        sortOrder: 1,
        options: [lymowCharger5, lymowCharger10],
      },
      {
        id: "lymow-accessories",
        slug: "lymow-accessories",
        name: "Optional Parts and Accessories",
        description: null,
        selectionType: "multiple",
        isRequired: false,
        minimumSelections: 0,
        maximumSelections: null,
        sortOrder: 2,
        options: lymowAccessories,
      },
    ],
    ungroupedOptions: [],
    packages: [],
    ...catalogPrice,
    ...overrides,
  };
}

const pandagPrice = {
  isAvailable: true,
  publicStatus: "active" as const,
  displayMsrpPriceCents: 10000,
  regularPriceCents: null,
  salePriceCents: null,
  currentPriceCents: null,
  showPublicPrice: false,
  contactForPricing: true,
  promotionLabel: null,
  saleIsActive: false,
};

function pandagOption(
  slug: string,
  name: string,
  description: string,
  sortOrder: number,
  isIncluded: boolean
): CatalogOption {
  return {
    id: slug,
    slug,
    name,
    description,
    optionGroupId: "pandag-charging",
    isRequired: isIncluded,
    isIncluded,
    isRecommended: !isIncluded,
    defaultQuantity: isIncluded ? 1 : 0,
    minimumQuantity: isIncluded ? 1 : 0,
    maximumQuantity: 1,
    sortOrder,
    ...pandagPrice,
  };
}

const pandagChargingCable = pandagOption(
  "pandag-charging-cable",
  "Pandag G1 Charging Cable",
  "Standard charging cable included with the Pandag G1.",
  1,
  true
);
const pandagChargingDock = pandagOption(
  "pandag-charging-dock",
  "Pandag G1 Charging Dock",
  "Optional charging dock for high-use commercial deployments.",
  2,
  false
);

function pandagProduct(
  overrides: Partial<CatalogProduct> = {}
): CatalogProduct {
  return {
    id: "pandag",
    slug: "pandag-g1",
    brand: "Pandag",
    name: "Pandag G1",
    homepageSummary:
      "A commercial autonomous mowing platform for large properties and demanding applications.",
    fullDescription:
      "A heavy-duty autonomous mower for commercial and institutional properties.",
    capabilityLevel: "Commercial autonomous mowing",
    propertyScale: "Large commercial and institutional properties",
    customerGuidance: "Request a property review and commercial proposal.",
    brochureUrl: null,
    videoUrl: null,
    imageUrl: "/products/pandag-thumb.png",
    imageAlt: "Pandag G1 commercial autonomous mower",
    sortOrder: 3,
    salesMode: "quote_only",
    page: {
      heroHeading: "Pandag G1",
      heroSubheading: "Autonomous mowing for large commercial properties.",
      longFormContent: null,
      sections: [],
    },
    media: [],
    variants: [
      {
        id: "pandag-m1500-sd",
        slug: "pandag-g1-m1500-sd",
        sku: null,
        name: "Pandag G1 M1500 SD",
        description: "Side-discharge commercial configuration.",
        sortOrder: 1,
        definingOptionIds: [],
        ...pandagPrice,
      },
      {
        id: "pandag-m1500-rd",
        slug: "pandag-g1-m1500-rd",
        sku: null,
        name: "Pandag G1 M1500 RD",
        description: "Rear-discharge commercial configuration.",
        sortOrder: 2,
        definingOptionIds: [],
        ...pandagPrice,
      },
      {
        id: "pandag-pro-m3000",
        slug: "pandag-g1-pro-m3000",
        sku: null,
        name: "Pandag G1 PRO M3000",
        description: "High-power commercial configuration.",
        sortOrder: 3,
        definingOptionIds: [],
        ...pandagPrice,
      },
    ],
    optionGroups: [
      {
        id: "pandag-charging",
        slug: "pandag-charging",
        name: "Charging Equipment",
        description: "Pandag charging equipment.",
        selectionType: "multiple",
        isRequired: false,
        minimumSelections: 0,
        maximumSelections: null,
        sortOrder: 1,
        options: [pandagChargingCable, pandagChargingDock],
      },
    ],
    ungroupedOptions: [],
    packages: [],
    ...pandagPrice,
    ...overrides,
  };
}

test("equipment detail routing resolves lymow-one-plus from the catalog payload", () => {
  const lymow = lymowProduct();
  const yarbo = yarboProduct();
  const pandag = yarboProduct({
    id: "pandag",
    slug: "pandag-g1",
    name: "Pandag G1",
    salesMode: "quote_only",
  });
  const aftermarket = yarboProduct({
    id: "aftermarket",
    slug: "ids-aftermarket",
    name: "IDS Aftermarket",
  });
  const catalog = {
    products: [lymow, yarbo, pandag, aftermarket],
    generatedAt: "2026-08-04T00:00:00.000Z",
  };

  assert.equal(findCatalogProductBySlug(catalog, "lymow-one-plus"), lymow);
  assert.equal(findCatalogProductBySlug(catalog, "yarbo"), yarbo);
  assert.equal(findCatalogProductBySlug(catalog, "pandag-g1"), pandag);
  assert.equal(findCatalogProductBySlug(catalog, "ids-aftermarket"), null);
  assert.equal(findCatalogProductBySlug(catalog, "missing-product"), null);

  const routeSource = readFileSync(
    join(process.cwd(), "app", "equipment", "[slug]", "page.tsx"),
    "utf8"
  );
  assert.match(routeSource, /export const dynamic = "force-dynamic"/);
  assert.match(routeSource, /loadPublicCatalog\(\)/);
  assert.match(routeSource, /findCatalogProductBySlug\(payload, slug\)/);
  assert.doesNotMatch(routeSource, /loadPublicCatalog\(slug\)/);
});

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

test("Pandag detail information renders the complete commercial platform story", () => {
  const html = renderToStaticMarkup(
    <PandagInformationSections product={pandagProduct()} />
  );

  for (const heading of [
    "A commercial mowing platform planned around the site and the work.",
    "Choose the G1 configuration around the mowing assignment.",
    "Built for repeatable operation across complex properties.",
    "Coordinate mapped work across demanding sites.",
    "Configure traction for the ground the machine has to cross.",
    "A 48-inch deck with model-specific discharge and blade systems.",
    "Plan charging around the operating schedule.",
    "Multiple sensing layers inform route decisions.",
    "One platform family for a wide range of large-property work.",
    "Compare the technical details without blending the models together.",
    "Match the charging approach to site access and daily demand.",
    "Start with the property, the mowing standard, and the operating plan.",
  ]) {
    assert.match(
      html,
      new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    );
  }

  for (const model of [
    "Pandag G1 M1500SD",
    "Pandag G1 M1500RD",
    "Pandag G1 PRO M3000",
  ]) {
    assert.match(html, new RegExp(model));
  }

  for (const specification of [
    "Up to 8 acres",
    "Up to 12 acres",
    "Up to 11 acres",
    "5,400W",
    "7,500W",
    "12,000W",
    "3 × 800W",
    "3 × 1,500W",
    "3 × 3,000W",
    "8 kWh ternary lithium",
    "16 kWh LiFePO₄",
    "Up to 42°",
    "Up to 38°",
    "2205 × 1280 × 600 mm",
    "2350 × 1280 × 660 mm",
  ]) {
    assert.match(
      html,
      new RegExp(specification.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    );
  }

  for (const filename of [
    "pandag-m1500sd.webp",
    "pandag-m1500rd.webp",
    "pandag-pro-m3000.webp",
    "pandag-fleet-control.webp",
    "pandag-slope-performance.webp",
    "pandag-cutting-deck.webp",
    "pandag-auto-recharge.webp",
    "pandag-obstacle-navigation.webp",
    "pandag-solar-farm.webp",
    "pandag-golf-course.webp",
  ]) {
    assert.match(html, new RegExp(filename));
  }

  assert.match(html, /href="\/pandag\/project-quote\?model=m1500_sd"/);
  assert.match(html, /href="\/pandag\/project-quote\?model=m1500_rd"/);
  assert.match(html, /href="\/pandag\/project-quote\?model=pro_m3000"/);
  assert.match(html, /href="\/pandag\/project-quote\?model=recommend"/);
  assert.match(html, /Request a Commercial Proposal/);
  assert.match(html, /Pandag G1 Charging Cable/);
  assert.match(html, /Pandag G1 Charging Dock/);

  const cableCardStart = html.indexOf("Pandag G1 Charging Cable");
  const dockCardStart = html.indexOf("Pandag G1 Charging Dock");
  assert.ok(cableCardStart >= 0);
  assert.ok(dockCardStart > cableCardStart);

  const cableCard = html.slice(cableCardStart, dockCardStart);
  assert.match(cableCard, /Included with Every Pandag G1/);
  assert.doesNotMatch(cableCard, /Request Pricing/);
  assert.doesNotMatch(cableCard, /href=/);
  assert.equal((html.match(/Published coverage/g) ?? []).length, 1);
  assert.doesNotMatch(html, /Build Your System/);
  assert.doesNotMatch(html, /checkout|card payment|\bACH\b/i);
  assert.doesNotMatch(html, /residential lawn|homeowner/i);
});

test("Pandag brochure image paths point to optimized local assets", () => {
  assert.equal(PANDAG_BROCHURE_IMAGE_PATHS.length, 16);

  for (const imagePath of PANDAG_BROCHURE_IMAGE_PATHS) {
    assert.ok(
      imagePath.startsWith("/equipment/pandag/brochure/"),
      `${imagePath} should be a local Pandag image`
    );
    assert.ok(imagePath.endsWith(".webp"));
    assert.equal(
      existsSync(join(process.cwd(), "public", imagePath)),
      true,
      `${imagePath} should exist under public`
    );
  }
});

test("Pandag structured content contains no hardcoded pricing or source commentary", () => {
  const content = readFileSync(
    join(
      process.cwd(),
      "components",
      "equipment",
      "pandagBrochureContent.ts"
    ),
    "utf8"
  );

  assert.doesNotMatch(content, /\$\s*\d/);
  assert.doesNotMatch(
    content,
    /regularPriceCents|salePriceCents|currentPriceCents|displayMsrpPriceCents/
  );
  assert.doesNotMatch(
    content,
    /brochure-derived|brochure features|normalized catalog|internal source|current catalog guidance|internal laboratory|source reference/i
  );
  assert.doesNotMatch(content, /warranty|testimonial|phone number|QR code/i);
});

test("Pandag route delegates to the quote-only commercial page architecture", () => {
  const routeSource = readFileSync(
    join(process.cwd(), "app", "equipment", "[slug]", "page.tsx"),
    "utf8"
  );
  const pandagStart = routeSource.indexOf("function PandagProductPage");
  const pandagEnd = routeSource.indexOf("function YarboProductPage");
  const pandagRoute = routeSource.slice(pandagStart, pandagEnd);

  assert.ok(pandagStart >= 0);
  assert.ok(pandagEnd > pandagStart);
  assert.match(pandagRoute, /PandagInformationSections/);
  assert.match(pandagRoute, /pandagImages\.platformLineup/);
  assert.match(pandagRoute, /QuoteOnlyNotice/);
  assert.doesNotMatch(pandagRoute, /ProductBuildCta|Build Your System/);
});

test("Lymow detail information renders the complete residential mower story", () => {
  const html = renderToStaticMarkup(
    <LymowInformationSections product={lymowProduct()} />
  );

  for (const heading of [
    "Choose 5A or 10A in Build Your System.",
    "A dedicated autonomous mower for complex residential lawns.",
    "Property Fit",
    "Machine specifications",
    "Navigation and connectivity",
    "Terrain and mobility",
    "Cutting system",
    "Power and charging",
    "Detection and autonomy",
    "Tracked autonomous mowing built for demanding residential properties.",
    "Map the lawn, not a perimeter wire.",
    "Traction for the parts of a lawn that demand more.",
    "A wide rotary cut with practical height control.",
    "Choose the charging cadence that fits the workday.",
    "Multiple sensing layers support safer route decisions.",
    "Built for changing residential lawn conditions.",
    "The mower, charging equipment, and RTK setup arrive together.",
    "Replacement and optional equipment for an active Lymow system.",
  ]) {
    assert.match(
      html,
      new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    );
  }

  for (const specification of [
    "Up to 45°",
    "16-inch dual rotary",
    "RTK + VSLAM",
    "29.5 x 23.6 x 12.6 in",
    "78.5 lb ±1 lb",
    "680 W / 1,785 W",
    "1.2 to 4.0 in",
    "3,000 to 6,000 RPM",
    "IPX6",
    "Approximately 1.1 acres per day",
    "Approximately 1.73 acres per day",
    "150 minutes from 10% to 90%",
    "90 minutes from 10% to 90%",
  ]) {
    assert.match(
      html,
      new RegExp(specification.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    );
  }

  for (const item of [
    "Lymow One Plus — 5A Configuration",
    "Lymow One Plus — 10A Configuration",
    "Lymow One Plus Battery",
    "Straight Blade 2.0",
    "Replacement Lymow Track",
    "Charging-station adapter matched to the selected configuration",
    "The charger is included with the selected mower configuration",
  ]) {
    assert.match(html, new RegExp(item));
  }

  for (const filename of [
    "lymow-one-plus-closeup.webp",
    "lymow-tracked-drive.webp",
    "lymow-dual-rotary-blades.webp",
    "lymow-daily-coverage.webp",
    "lymow-obstacle-avoidance.webp",
    "lymow-included-equipment.webp",
  ]) {
    assert.match(html, new RegExp(filename));
  }

  assert.match(
    html,
    /grid-cols-\[repeat\(auto-fit,minmax\(min\(100%,18rem\),1fr\)\)\]/
  );
  assert.match(html, /Manufacturer ratings describe maximum or estimated performance/);
  assert.doesNotMatch(html, /Choose the charging configuration for your property/);
  assert.doesNotMatch(html, /Complete packages|package selection/i);
  assert.doesNotMatch(html, /5A Charger Configuration|10A Charger Configuration/);
  assert.doesNotMatch(html, /approximately 5 acres|up to 5 acres/i);
  assert.doesNotMatch(html, /Super Swing|trained on thousands|always improving/i);
  assert.doesNotMatch(
    html,
    /brochure-derived|brochure features|normalized catalog|internal source|current catalog guidance|internal laboratory/i
  );
});

test("Lymow brochure image paths point to optimized local assets", () => {
  assert.equal(LYMOW_BROCHURE_IMAGE_PATHS.length, 10);

  for (const imagePath of LYMOW_BROCHURE_IMAGE_PATHS) {
    assert.ok(
      imagePath.startsWith("/equipment/lymow/brochure/"),
      `${imagePath} should be a local Lymow image`
    );
    assert.ok(imagePath.endsWith(".webp"));
    assert.equal(
      existsSync(join(process.cwd(), "public", imagePath)),
      true,
      `${imagePath} should exist under public`
    );
  }
});

test("Lymow structured content contains no hardcoded pricing", () => {
  const content = readFileSync(
    join(
      process.cwd(),
      "components",
      "equipment",
      "lymowBrochureContent.ts"
    ),
    "utf8"
  );

  assert.doesNotMatch(content, /\$\s*\d/);
  assert.doesNotMatch(
    content,
    /regularPriceCents|salePriceCents|currentPriceCents|displayMsrpPriceCents/
  );
});

test("Lymow Build Your System keeps both mower variants and hides charger mirrors", () => {
  const product = lymowProduct();
  const selection: ProductBuildSelection = {
    variantId: "",
    packageId: "",
    optionQuantities: {},
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

  assert.match(html, /Lymow One Plus — 5A Configuration/);
  assert.match(html, /Lymow One Plus — 10A Configuration/);
  assert.doesNotMatch(html, /5A Charger Configuration|10A Charger Configuration/);
  assert.doesNotMatch(html, />Charger Configuration</);
});

test("Yarbo detail information replaces package grids with catalog-driven sections and components", () => {
  const html = renderToStaticMarkup(
    <YarboInformationSections product={yarboProduct()} />
  );

  for (const heading of [
    "Understand the Yarbo platform before building a system.",
    "Product Overview",
    "Key Strengths",
    "Property Considerations and Limitations",
    "Yarbo Core Specifications",
    "Navigation, Mapping, and Obstacle Detection",
    "Power, Battery, Charging, and Docking",
    "Terrain and Mobility",
    "Controls and Connectivity",
    "How the Yarbo System Works",
    "Included Base Equipment",
    "Designed to handle more than a single season.",
    "Yarbo brings navigation, tracked mobility, charging, controls, and modular task equipment into one expandable property-care platform.",
    "Yarbo system components",
    "Build one platform around the work your property needs.",
  ]) {
    assert.match(html, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  for (const component of [
    "Yarbo Core",
    "Lawn Mower Pro Module",
    "Blower Module",
    "Snow Blower Module",
    "Yarbo Trimmer Package",
  ]) {
    assert.match(html, new RegExp(component));
  }

  for (const specification of [
    "27 x 22 x 20 in",
    "145.5 lbs / 66 kg",
    "1.38 kWh",
    "90 min from 20% to 80%",
    "RTK, vision, IMU, ODOM",
    "70% (35 degrees)",
    "24 in / 600 mm",
    "174 MPH",
    "6,500 RPM",
  ]) {
    assert.match(html, new RegExp(specification.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  for (const feature of [
    "One Core, Multiple Seasons",
    "Precision Mapping and Route Keeping",
    "Vision-Led Obstacle Detection",
    "Tracked Mobility for Challenging Terrain",
    "Automatic Charging and Docking",
    "App and Remote Operation",
  ]) {
    assert.match(html, new RegExp(feature));
  }

  for (const filename of [
    "yarbo-auto-docking.webp",
    "yarbo-obstacle-detection.webp",
    "yarbo-lawn-mower-pro-module.webp",
    "yarbo-snow-blower-module.webp",
  ]) {
    assert.match(html, new RegExp(filename));
  }

  assert.match(html, /grid-cols-\[repeat\(auto-fit,minmax\(min\(100%,18rem\),1fr\)\)\]/);
  assert.match(html, /requires a Yarbo Core to operate/g);
  assert.doesNotMatch(html, /Complete Yarbo Systems/);
  assert.doesNotMatch(html, /Complete packages grouped by use case/);
  assert.doesNotMatch(html, /Request A Yarbo Package/);
  assert.doesNotMatch(html, /Request Yarbo Equipment/);
  assert.doesNotMatch(html, /No payment is collected online/);
  assert.doesNotMatch(html, /Standard Lawn Mower Module/);
  assert.doesNotMatch(html, /yarbo-lawn-mower-module\.webp/);
  assert.doesNotMatch(html, /Yarbo Lawn Mower<\/h/);
  assert.doesNotMatch(html, /<h3[^>]*>[^<]*(Snow Plow|Tow Hitch|Sweeper)/);
  assert.doesNotMatch(
    html,
    /Brochure features|brochure shows|normalized IDS catalog|active customer-facing catalog|currently published in the catalog|review documents|brochure context|internal laboratory|implementation|sourcing explanations/i
  );
});

test("Yarbo missing information degrades with customer-facing wording", () => {
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

  assert.match(html, /Yarbo overview details are temporarily unavailable/);
  assert.match(html, /Yarbo Core Specifications/);
  assert.match(html, /27 x 22 x 20 in/);
  assert.match(html, /Yarbo task modules are not available for online configuration/);
  assert.doesNotMatch(html, /2-Year Warranty|30-Day Hassle-Free Returns/);
  assert.ok(YARBO_OMITTED_BROCHURE_SPECS.includes("Warranty terms"));
});

test("Yarbo brochure image paths point to local public assets", () => {
  assert.ok(YARBO_BROCHURE_IMAGE_PATHS.length >= 10);

  for (const imagePath of YARBO_BROCHURE_IMAGE_PATHS) {
    assert.ok(
      imagePath.startsWith("/equipment/yarbo/brochure/"),
      `${imagePath} should be a local brochure asset`
    );
    assert.equal(
      existsSync(join(process.cwd(), "public", imagePath)),
      true,
      `${imagePath} should exist under public`
    );
  }
});

test("shared Lymow and Yarbo build banners keep the approved purchase route", () => {
  const lymowHtml = renderToStaticMarkup(
    <ProductBuildCta
      supportingText="Choose your Lymow One Plus configuration and compatible accessories first, then check delivery and service availability."
      productSlug="lymow-one-plus"
    />
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
    assert.doesNotMatch(html, /Contact Us|role="dialog"/);
    assert.doesNotMatch(html, /Request Yarbo Equipment|equipment request flow/);
  }
  assert.match(
    lymowHtml,
    /href="\/\?product=lymow-one-plus#location-and-customer-path"/
  );
  assert.match(
    yarboHtml,
    /href="\/\?product=yarbo#location-and-customer-path"/
  );
});

test("Lymow and Yarbo build links preselect only a self-service catalog product", () => {
  const lymow = lymowProduct();
  const yarbo = yarboProduct();
  const pandag = yarboProduct({
    id: "pandag",
    slug: "pandag-g1",
    name: "Pandag G1",
    salesMode: "quote_only",
  });
  const aftermarket = yarboProduct({
    id: "aftermarket",
    slug: "ids-aftermarket",
    name: "IDS Aftermarket",
  });
  const catalog = {
    products: [lymow, yarbo, pandag, aftermarket],
    generatedAt: "2026-08-03T00:00:00.000Z",
  };

  assert.equal(
    productRequestedByBuildSearch(catalog, "?product=lymow-one-plus")?.id,
    lymow.id
  );
  assert.equal(
    productRequestedByBuildSearch(catalog, "?product=yarbo")?.id,
    yarbo.id
  );
  assert.equal(
    productRequestedByBuildSearch(catalog, "?product=pandag-g1"),
    null
  );
  assert.equal(
    productRequestedByBuildSearch(catalog, "?product=ids-aftermarket"),
    null
  );
  assert.equal(productRequestedByBuildSearch(catalog, ""), null);
});

test("Make Your Selections offers Lymow, Yarbo, and accessory purchase paths", () => {
  const lymow = lymowProduct();
  const yarbo = yarboProduct();
  const html = renderToStaticMarkup(
    <ProductSelection
      products={[lymow, yarbo]}
      selectedProductId={lymow.id}
      onSelectProduct={() => undefined}
    />
  );

  assert.match(html, /Lymow One Plus/);
  assert.match(html, /Yarbo Core/);
  assert.match(html, />Selected<\/button>/);
  assert.match(html, /Accessories &amp; Parts/);
  assert.match(html, /Purchase Lymow, Yarbo, or Aftermarket accessories, replacement parts, batteries, blades, tracks, cables, and more\./);
  assert.equal((html.match(/<button/g) ?? []).length, 3);
  assert.doesNotMatch(html, /\d+ packages/);
  assert.doesNotMatch(html, /View Full Details/);
  assert.equal(lymow.packages.length, 0);
  assert.equal(yarbo.packages.length, 1);
});

test("equipment catalog detail links remain outside the machine-selection screen", () => {
  const catalogSource = readFileSync(
    join(process.cwd(), "components", "equipment", "EquipmentCatalog.tsx"),
    "utf8"
  );

  assert.match(catalogSource, /href={`\/equipment\/\${product\.slug}`}/);
  assert.match(catalogSource, /View Details/);
  assert.match(catalogSource, /View Pandag G1/);
});

test("current Yarbo package records remain available after machine selection", () => {
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

  assert.equal(product.packages.length, 1);
  assert.match(html, /Complete Yarbo Systems/);
  assert.match(html, />Yarbo Lawn Mower Pro</);
  assert.doesNotMatch(html, />Yarbo Lawn Mower Pro System</);
  assert.match(html, /1 packages/);
  assert.match(html, /Individual Yarbo Equipment/);
});

test("purchase flow exposes the approved five progress steps", () => {
  const labels: string[] = purchaseProgressSteps.map((step) => step.label);

  assert.deepEqual(labels, [
    "Make Your Selections",
    "Review Selections",
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
