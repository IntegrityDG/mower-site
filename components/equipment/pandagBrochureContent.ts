export type PandagBrochureImage = {
  src: string;
  alt: string;
  width: number;
  height: number;
  fit?: "cover" | "contain";
};

export type PandagSpec = {
  label: string;
  value: string;
};

export type PandagSpecGroup = {
  title: string;
  specs: PandagSpec[];
};

export type PandagModelContent = {
  displayName: string;
  eyebrow: string;
  summary: string;
  image: PandagBrochureImage;
  quoteModel: "m1500_sd" | "m1500_rd" | "pro_m3000";
  comparisonFacts: PandagSpec[];
  specGroups: PandagSpecGroup[];
};

export type PandagFeatureSection = {
  eyebrow: string;
  title: string;
  body: string;
  image: PandagBrochureImage;
  facts: string[];
};

export type PandagApplication = {
  title: string;
  description: string;
  image: PandagBrochureImage;
};

const brochureBase = "/equipment/pandag/brochure";

export const pandagImages = {
  platformLineup: {
    src: `${brochureBase}/pandag-platform-lineup.webp`,
    alt: "Pandag G1 commercial mower platform with cutting, charging, and positioning equipment",
    width: 1755,
    height: 1335,
    fit: "contain",
  },
  obstacleNavigation: {
    src: `${brochureBase}/pandag-obstacle-navigation.webp`,
    alt: "Pandag G1 detecting a park bench while mowing a maintained commercial lawn",
    width: 655,
    height: 375,
  },
  autoRecharge: {
    src: `${brochureBase}/pandag-auto-recharge.webp`,
    alt: "Pandag G1 positioned beside an inductive charging station on a large lawn",
    width: 675,
    height: 400,
  },
  slopePerformance: {
    src: `${brochureBase}/pandag-slope-performance.webp`,
    alt: "Pandag G1 operating across a steep maintained slope",
    width: 518,
    height: 328,
  },
  cuttingDeck: {
    src: `${brochureBase}/pandag-cutting-deck.webp`,
    alt: "Front view of the Pandag G1 48-inch commercial cutting deck",
    width: 503,
    height: 328,
  },
  largeProperty: {
    src: `${brochureBase}/pandag-large-property-operation.webp`,
    alt: "Pandag G1 following a mowing route across a large commercial property",
    width: 745,
    height: 505,
  },
  fleetControl: {
    src: `${brochureBase}/pandag-fleet-control.webp`,
    alt: "Handheld Pandag controller displaying mapped machine and fleet controls",
    width: 534,
    height: 840,
  },
  m1500sd: {
    src: `${brochureBase}/pandag-m1500sd.webp`,
    alt: "Pandag G1 M1500SD side-discharge commercial mower on maintained turf",
    width: 680,
    height: 325,
  },
  m1500rd: {
    src: `${brochureBase}/pandag-m1500rd.webp`,
    alt: "Pandag G1 M1500RD rear-discharge commercial mower on a golf course",
    width: 675,
    height: 375,
  },
  proM3000: {
    src: `${brochureBase}/pandag-pro-m3000.webp`,
    alt: "Pandag G1 PRO M3000 operating in tall, rough vegetation",
    width: 560,
    height: 370,
  },
  solarFarm: {
    src: `${brochureBase}/pandag-solar-farm.webp`,
    alt: "Pandag G1 mowing vegetation beneath a solar array",
    width: 475,
    height: 245,
  },
  orchard: {
    src: `${brochureBase}/pandag-orchard.webp`,
    alt: "Pandag G1 mowing between orchard rows",
    width: 491,
    height: 245,
  },
  sportsField: {
    src: `${brochureBase}/pandag-sports-field.webp`,
    alt: "Pandag G1 mowing a marked commercial sports field",
    width: 475,
    height: 167,
  },
  golfCourse: {
    src: `${brochureBase}/pandag-golf-course.webp`,
    alt: "Maintained golf course fairway with rolling terrain",
    width: 491,
    height: 167,
  },
  publicGreenSpace: {
    src: `${brochureBase}/pandag-public-green-space.webp`,
    alt: "Landscaped public green space with trees and walking paths",
    width: 475,
    height: 112,
  },
  turfFarm: {
    src: `${brochureBase}/pandag-turf-farm.webp`,
    alt: "Pandag G1 mowing long rows at a turf farm",
    width: 491,
    height: 112,
  },
} satisfies Record<string, PandagBrochureImage>;

export const PANDAG_BROCHURE_IMAGE_PATHS = Object.values(pandagImages).map(
  (image) => image.src
);

export const pandagQuickCapabilities = [
  {
    label: "Commercial coverage",
    value: "Up to 12 acres",
    detail: "Maximum published rating for the M1500RD configuration.",
  },
  {
    label: "Cutting platform",
    value: "48-inch deck",
    detail: "Model-specific blade and discharge systems for different work.",
  },
  {
    label: "Electrical system",
    value: "72V",
    detail: "Shared system voltage across the three active configurations.",
  },
  {
    label: "Autonomous operation",
    value: "LiDAR + vision + RTK",
    detail: "Multiple positioning and sensing layers with app control.",
  },
];

export const pandagModelContent = {
  "pandag-g1-m1500-sd": {
    displayName: "Pandag G1 M1500SD",
    eyebrow: "Fine-turf configuration",
    summary:
      "A side-discharge, bar-blade configuration for fine turf, sports surfaces, and maintained commercial areas that call for lower cutting-height choices.",
    image: pandagImages.m1500sd,
    quoteModel: "m1500_sd",
    comparisonFacts: [
      { label: "Rated coverage", value: "Up to 8 acres" },
      { label: "Mowing time", value: "Up to 4 hours per charge" },
      { label: "Deck", value: "48-inch side discharge" },
      { label: "Blade system", value: "Bar blade" },
      { label: "Battery", value: "8 kWh, swappable" },
    ],
    specGroups: [
      {
        title: "Power and output",
        specs: [
          { label: "System voltage", value: "72V" },
          { label: "Rated power", value: "5,400W" },
          { label: "Maximum mowing time", value: "Up to 4 hours per charge" },
          { label: "Rated mowing coverage", value: "Up to 8 acres" },
        ],
      },
      {
        title: "Cutting system",
        specs: [
          { label: "Deck", value: "Side discharge, 2.5 mm reinforced structural steel" },
          { label: "Cutting motors", value: "3 × 800W" },
          { label: "Blade type", value: "Bar blade" },
          { label: "Cutting width", value: "48 in" },
          { label: "Cutting heights", value: "0.8, 1.25, 2, 2.5, and 3.5 in" },
        ],
      },
      {
        title: "Battery and charging",
        specs: [
          { label: "Battery", value: "8 kWh ternary lithium" },
          { label: "Battery change", value: "Swappable" },
          { label: "Charging methods", value: "AC power adapter or inductive charging" },
          { label: "AC charge time", value: "Approximately 6 hours" },
        ],
      },
      {
        title: "Mobility and dimensions",
        specs: [
          { label: "Maximum climbing slope", value: "Up to 42°" },
          { label: "Maximum speed", value: "Up to 4.5 km/h" },
          { label: "Tire choices", value: "Turf, all-terrain, or spike" },
          { label: "Dimensions (D × W × H)", value: "2205 × 1280 × 600 mm" },
          { label: "Weight", value: "310 kg" },
        ],
      },
    ],
  },
  "pandag-g1-m1500-rd": {
    displayName: "Pandag G1 M1500RD",
    eyebrow: "Large-property configuration",
    summary:
      "A rear-discharge, swing-blade configuration for parks, airports, sports fields, riverbanks, solar farms, and other substantial maintained grounds.",
    image: pandagImages.m1500rd,
    quoteModel: "m1500_rd",
    comparisonFacts: [
      { label: "Rated coverage", value: "Up to 12 acres" },
      { label: "Mowing time", value: "Up to 6 hours per charge" },
      { label: "Deck", value: "48-inch rear discharge" },
      { label: "Blade system", value: "Swing blade" },
      { label: "Battery", value: "8 kWh, swappable" },
    ],
    specGroups: [
      {
        title: "Power and output",
        specs: [
          { label: "System voltage", value: "72V" },
          { label: "Rated power", value: "7,500W" },
          { label: "Maximum mowing time", value: "Up to 6 hours per charge" },
          { label: "Rated mowing coverage", value: "Up to 12 acres" },
        ],
      },
      {
        title: "Cutting system",
        specs: [
          { label: "Deck", value: "Rear discharge, 2.5 mm reinforced structural steel" },
          { label: "Cutting motors", value: "3 × 1,500W" },
          { label: "Blade type", value: "Swing blade" },
          { label: "Cutting width", value: "48 in" },
          { label: "Cutting heights", value: "1.5, 2.25, 3, 3.5, and 4.5 in" },
        ],
      },
      {
        title: "Battery and charging",
        specs: [
          { label: "Battery", value: "8 kWh ternary lithium" },
          { label: "Battery change", value: "Swappable" },
          { label: "Charging methods", value: "AC power adapter or inductive charging" },
          { label: "AC charge time", value: "Approximately 6 hours" },
        ],
      },
      {
        title: "Mobility and dimensions",
        specs: [
          { label: "Maximum climbing slope", value: "Up to 42°" },
          { label: "Maximum speed", value: "Up to 4.5 km/h" },
          { label: "Tire choices", value: "Turf, all-terrain, or spike" },
          { label: "Dimensions (D × W × H)", value: "2205 × 1280 × 600 mm" },
          { label: "Weight", value: "315 kg" },
        ],
      },
    ],
  },
  "pandag-g1-pro-m3000": {
    displayName: "Pandag G1 PRO M3000",
    eyebrow: "High-power configuration",
    summary:
      "A higher-power rear-discharge platform for taller, rougher vegetation, brush, weed patches, and demanding commercial terrain.",
    image: pandagImages.proM3000,
    quoteModel: "pro_m3000",
    comparisonFacts: [
      { label: "Rated coverage", value: "Up to 11 acres" },
      { label: "Mowing time", value: "Up to 8 hours per charge" },
      { label: "Deck", value: "48-inch rear discharge" },
      { label: "Blade system", value: "Swing blade" },
      { label: "Battery", value: "16 kWh, swappable" },
    ],
    specGroups: [
      {
        title: "Power and output",
        specs: [
          { label: "System voltage", value: "72V" },
          { label: "Rated power", value: "12,000W" },
          { label: "Maximum mowing time", value: "Up to 8 hours per charge" },
          { label: "Rated mowing coverage", value: "Up to 11 acres" },
        ],
      },
      {
        title: "Cutting system",
        specs: [
          { label: "Deck", value: "Rear discharge, 3.0 mm reinforced structural steel" },
          { label: "Cutting motors", value: "3 × 3,000W" },
          { label: "Blade type", value: "Swing blade" },
          { label: "Cutting width", value: "48 in" },
          { label: "Cutting heights", value: "1.9, 3.9, and 5.9 in" },
        ],
      },
      {
        title: "Battery and charging",
        specs: [
          { label: "Battery", value: "16 kWh LiFePO₄" },
          { label: "Battery change", value: "Swappable" },
          { label: "Charging methods", value: "AC power adapter or inductive charging" },
          { label: "AC charge time", value: "Approximately 12 hours" },
        ],
      },
      {
        title: "Mobility and dimensions",
        specs: [
          { label: "Maximum climbing slope", value: "Up to 38°" },
          { label: "Maximum speed", value: "Up to 4.15 km/h" },
          { label: "Tire choices", value: "Turf, all-terrain, or spike" },
          { label: "Dimensions (D × W × H)", value: "2350 × 1280 × 660 mm" },
          { label: "Weight", value: "410 kg" },
        ],
      },
    ],
  },
} as const satisfies Record<string, PandagModelContent>;

export const pandagFeatureSections: PandagFeatureSection[] = [
  {
    eyebrow: "Navigation and autonomous operation",
    title: "Coordinate mapped work across demanding sites.",
    body:
      "The G1 combines RTK positioning, LiDAR, camera vision, inertial data, and 4G-connected app control. Together, those systems support mapped routes, self-correction, and continued orientation where satellite positioning is limited.",
    image: pandagImages.fleetControl,
    facts: [
      "RTK-4G positioning with app-based mapping and control.",
      "LiDAR and inertial sensing support operation in areas with limited RTK coverage.",
      "A single-hand remote supports direct machine control when required.",
    ],
  },
  {
    eyebrow: "Terrain and slope performance",
    title: "Configure traction for the ground the machine has to cross.",
    body:
      "Commercial properties rarely present one uniform surface. The G1 platform supports turf, all-terrain, and spike tire choices, with model-specific slope ratings for maintained hillsides and demanding ground.",
    image: pandagImages.slopePerformance,
    facts: [
      "M1500SD and M1500RD are rated for slopes up to 42°.",
      "PRO M3000 is rated for slopes up to 38°.",
      "Tire selection is matched to turf protection, traction, and site conditions.",
    ],
  },
  {
    eyebrow: "Commercial cutting system",
    title: "A 48-inch deck with model-specific discharge and blade systems.",
    body:
      "Each active G1 configuration uses a 48-inch reinforced-steel deck. The M1500SD pairs bar blades with side discharge, while the M1500RD and PRO M3000 use swing blades with rear discharge.",
    image: pandagImages.cuttingDeck,
    facts: [
      "48-inch cutting width across all three configurations.",
      "Bar-blade side discharge for the M1500SD.",
      "Swing-blade rear discharge for the M1500RD and PRO M3000.",
    ],
  },
  {
    eyebrow: "Battery, charging, and endurance",
    title: "Plan charging around the operating schedule.",
    body:
      "All three configurations use swappable batteries and support AC-adapter or inductive charging. The commercial proposal can account for daily mowing demand, charging location, turnaround time, and whether a dock fits the deployment.",
    image: pandagImages.autoRecharge,
    facts: [
      "M1500 models use an 8 kWh ternary-lithium battery.",
      "PRO M3000 uses a 16 kWh LiFePO₄ battery.",
      "Published AC charge times are approximately 6 hours for M1500 and 12 hours for PRO M3000.",
    ],
  },
  {
    eyebrow: "Obstacle handling and operational safety",
    title: "Multiple sensing layers inform route decisions.",
    body:
      "LiDAR, AI-assisted camera vision, and ultrasonic sensing help the mower perceive people, fixed objects, and changing site conditions. Safe deployment still depends on correct mapping, a clear work area, appropriate operating procedures, and site supervision.",
    image: pandagImages.obstacleNavigation,
    facts: [
      "LiDAR, camera vision, and ultrasonic sensing work together.",
      "Self-correction and adaptive mowing logic support route adjustments.",
      "Commercial setup should define boundaries, exclusions, access points, and charging areas.",
    ],
  },
];

export const pandagCommercialApplications: PandagApplication[] = [
  {
    title: "Solar farms",
    description: "Maintain broad vegetation corridors around supported arrays and access routes.",
    image: pandagImages.solarFarm,
  },
  {
    title: "Orchards and agricultural sites",
    description: "Plan repeatable mowing routes between rows and across maintained production areas.",
    image: pandagImages.orchard,
  },
  {
    title: "Sports fields",
    description: "Support scheduled mowing across large, defined playing surfaces and surrounding grounds.",
    image: pandagImages.sportsField,
  },
  {
    title: "Golf courses",
    description: "Match the model and cutting system to fairways, rough, and other maintained areas.",
    image: pandagImages.golfCourse,
  },
  {
    title: "Public green spaces",
    description: "Coordinate mowing for parks, campuses, municipal grounds, and institutional properties.",
    image: pandagImages.publicGreenSpace,
  },
  {
    title: "Turf farms",
    description: "Cover long, open mowing lanes with a commercial-width autonomous platform.",
    image: pandagImages.turfFarm,
  },
];

export const pandagPerformanceDisclaimer =
  "Published coverage, runtime, slope, speed, charging, and cutting ratings describe maximum or approximate performance under defined conditions. Actual results vary with vegetation, terrain, weather, tire choice, cutting height, route design, charging strategy, battery condition, and site setup.";
