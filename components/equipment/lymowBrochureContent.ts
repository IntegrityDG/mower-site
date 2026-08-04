export type LymowSpec = {
  label: string;
  value: string;
};

export type LymowBrochureImage = {
  src: string;
  alt: string;
  width: number;
  height: number;
  fit?: "cover" | "contain";
};

export type LymowFeatureSection = {
  eyebrow: string;
  title: string;
  body: string;
  image: LymowBrochureImage;
  secondaryImage?: LymowBrochureImage;
  facts: string[];
};

const brochureBase = "/equipment/lymow/brochure";

export const lymowImages = {
  hero: {
    src: `${brochureBase}/lymow-one-plus-on-lawn.webp`,
    alt: "Lymow One Plus tracked autonomous mower on a rolling residential lawn",
    width: 1600,
    height: 675,
  },
  closeup: {
    src: `${brochureBase}/lymow-one-plus-closeup.webp`,
    alt: "Front three-quarter view of the Lymow One Plus mower and rubber tracks",
    width: 1026,
    height: 615,
  },
  navigation: {
    src: `${brochureBase}/lymow-wire-free-navigation.webp`,
    alt: "Lymow One Plus mowing a mapped lawn without a buried perimeter wire",
    width: 750,
    height: 282,
  },
  trackedDrive: {
    src: `${brochureBase}/lymow-tracked-drive.webp`,
    alt: "Cutaway illustration of the Lymow One Plus tracked drive system",
    width: 1206,
    height: 900,
    fit: "contain",
  },
  cuttingPerformance: {
    src: `${brochureBase}/lymow-cutting-performance.webp`,
    alt: "Lymow One Plus moving from taller grass into a freshly cut lawn",
    width: 1600,
    height: 852,
  },
  rotaryBlades: {
    src: `${brochureBase}/lymow-dual-rotary-blades.webp`,
    alt: "Underside view of the Lymow One Plus dual-rotary cutting system",
    width: 795,
    height: 855,
  },
  dailyCoverage: {
    src: `${brochureBase}/lymow-daily-coverage.webp`,
    alt: "Lymow One Plus mowing a large landscaped residential lawn",
    width: 1600,
    height: 784,
  },
  variedConditions: {
    src: `${brochureBase}/lymow-varied-lawn-conditions.webp`,
    alt: "Lymow One Plus shown across varied residential lawn and terrain conditions",
    width: 1600,
    height: 915,
  },
  obstacleAvoidance: {
    src: `${brochureBase}/lymow-obstacle-avoidance.webp`,
    alt: "Lymow One Plus sensing and routing around a dog on the lawn",
    width: 1072,
    height: 348,
  },
  includedEquipment: {
    src: `${brochureBase}/lymow-included-equipment.webp`,
    alt: "Lymow One Plus mower, charging station, power equipment, mounting hardware, and RTK equipment",
    width: 1500,
    height: 750,
    fit: "contain",
  },
} satisfies Record<string, LymowBrochureImage>;

export const LYMOW_BROCHURE_IMAGE_PATHS = Object.values(lymowImages).map(
  (image) => image.src
);

export const lymowQuickCapabilities = [
  {
    label: "Slope capability",
    value: "Up to 45°",
    detail: "Tracked traction for supported slopes and uneven ground.",
  },
  {
    label: "Cutting system",
    value: "16-inch dual rotary",
    detail: "Adjustable from 1.2 to 4.0 inches.",
  },
  {
    label: "Navigation",
    value: "RTK + VSLAM",
    detail: "Virtual boundaries with no buried perimeter wire.",
  },
  {
    label: "Estimated daily coverage",
    value: "Approx. 1.1 / 1.73 acres",
    detail: "5A / 10A configuration estimates.",
  },
];

export const lymowMachineSpecs: LymowSpec[] = [
  { label: "Dimensions", value: "29.5 x 23.6 x 12.6 in" },
  { label: "Weight", value: "78.5 lb ±1 lb" },
  { label: "Rated / peak power", value: "680 W / 1,785 W" },
  { label: "Maximum runtime", value: "Up to 3 hours" },
  { label: "Water resistance", value: "IPX6" },
];

export const lymowNavigationSpecs: LymowSpec[] = [
  { label: "Navigation", value: "RTK + VSLAM" },
  { label: "RTK coverage radius", value: "Up to 3,200 ft" },
  { label: "Mapped zones", value: "Up to 80" },
  { label: "Map storage", value: "15 acres" },
  { label: "Connectivity", value: "Bluetooth, Wi-Fi, and 4G" },
];

export const lymowTerrainSpecs: LymowSpec[] = [
  { label: "Drive system", value: "Tracked" },
  { label: "Slope handling", value: "Up to 45° (100% incline)" },
  { label: "Obstacle crossing", value: "Up to 2.8 in" },
  { label: "Mowing speed", value: "1.0 to 3.3 ft/s" },
];

export const lymowCuttingSpecs: LymowSpec[] = [
  { label: "Cutting width", value: "16 in" },
  { label: "Cutting height", value: "1.2 to 4.0 in" },
  { label: "Cutting system", value: "Dual rotary mulching blades" },
  { label: "Blade speed", value: "3,000 to 6,000 RPM" },
];

export const lymowPowerSpecs: LymowSpec[] = [
  { label: "Battery", value: "LiFePO4, 15 Ah, 35.2 V" },
  { label: "Maximum runtime", value: "Up to 3 hours" },
  { label: "Coverage per charge", value: "Up to 0.57 acres" },
  { label: "Battery-life rating", value: "2,000 charge cycles" },
];

export const lymowSafetySpecs: LymowSpec[] = [
  { label: "Vision", value: "AI-assisted binocular vision" },
  { label: "Ultrasonic sensing", value: "5 sensors" },
  { label: "Cliff / lift detection", value: "2 Hall sensors" },
  { label: "Work continuation", value: "Automatic recharge and resume" },
];

export const lymowConfigurationFacts = {
  "lymow-one-plus-5a": {
    chargeTime: "150 minutes from 10% to 90%",
    dailyCoverage: "Approximately 1.1 acres per day",
  },
  "lymow-one-plus-10a": {
    chargeTime: "90 minutes from 10% to 90%",
    dailyCoverage: "Approximately 1.73 acres per day",
  },
} as const;

export const lymowIncludedEquipment = [
  "Lymow One Plus mower",
  "Charging station",
  "Charging-station adapter matched to the selected configuration",
  "10 m charging-station extension cable",
  "Four charging-station ground stakes",
  "RTK reference station and radio antenna",
  "Two mounting poles and wall-mount bracket",
  "RTK ground stake and four expansion bolts",
  "RTK power adapter",
  "Two 5 m RTK station extension cables",
  "User manual and quick-start guide",
];

export const lymowPerformanceDisclaimer =
  "Manufacturer ratings describe maximum or estimated performance. Actual mowing coverage, runtime, slope handling, obstacle crossing, and cut quality vary with terrain, grass density, weather, routing, setup, and operating conditions.";

export const lymowFeatureSections: LymowFeatureSection[] = [
  {
    eyebrow: "Navigation and autonomy",
    title: "Map the lawn, not a perimeter wire.",
    body:
      "RTK positioning and visual navigation support virtual boundaries, planned routes, and multi-zone mowing. A suitable RTK reference-station location remains essential for reliable autonomous operation.",
    image: lymowImages.navigation,
    facts: [
      "RTK + VSLAM virtual-boundary navigation.",
      "App management for up to 80 mapped zones.",
      "Bluetooth, Wi-Fi, and 4G connectivity.",
    ],
  },
  {
    eyebrow: "Tracked terrain performance",
    title: "Traction for the parts of a lawn that demand more.",
    body:
      "The tracked drive system is built to maintain grip and control across supported slopes, uneven ground, and small surface obstacles that can challenge wheeled robotic mowers.",
    image: lymowImages.trackedDrive,
    facts: [
      "Manufacturer-rated slope handling up to 45°.",
      "Obstacle crossing rated up to 2.8 inches.",
      "Tracked drive distributes contact across a broad footprint.",
    ],
  },
  {
    eyebrow: "Cutting system",
    title: "A wide rotary cut with practical height control.",
    body:
      "A 16-inch dual-rotary cutting system provides a broad mowing path and mulches clippings as it works. Cutting height adjusts from 1.2 to 4.0 inches for a range of maintained residential grasses.",
    image: lymowImages.cuttingPerformance,
    secondaryImage: lymowImages.rotaryBlades,
    facts: [
      "16-inch cutting width.",
      "1.2- to 4.0-inch cutting-height range.",
      "Rotary blade speed rated from 3,000 to 6,000 RPM.",
    ],
  },
  {
    eyebrow: "Charging and daily coverage",
    title: "Choose the charging cadence that fits the workday.",
    body:
      "Lymow One Plus returns to its charging station when power is low and resumes unfinished mowing. The 5A and 10A mower configurations pair the same cutting platform with different charge times and estimated daily coverage.",
    image: lymowImages.dailyCoverage,
    facts: [
      "5A: approximately 1.1 acres per day.",
      "10A: approximately 1.73 acres per day.",
      "The appropriate charger is included with the selected mower configuration.",
    ],
  },
  {
    eyebrow: "Obstacle detection and safety",
    title: "Multiple sensing layers support safer route decisions.",
    body:
      "AI-assisted vision, ultrasonic sensors, and Hall sensors help the mower detect obstacles and changes at ground level. Owners should still keep work areas clear and supervise operation around people, pets, edges, and unfamiliar hazards.",
    image: lymowImages.obstacleAvoidance,
    facts: [
      "AI-assisted binocular vision.",
      "Five ultrasonic sensors.",
      "Two Hall sensors support cliff and lift detection.",
    ],
  },
  {
    eyebrow: "Outdoor operation",
    title: "Built for changing residential lawn conditions.",
    body:
      "An IPX6 water-resistance rating and tracked mobility support outdoor mowing across varied lawn layouts. Plan routes and mowing schedules around current ground, grass, and weather conditions.",
    image: lymowImages.variedConditions,
    facts: [
      "IPX6 water-resistance rating.",
      "Designed for segmented, sloped, uneven, and multi-zone lawns.",
      "Automatic recharge and resume supports longer mowing plans.",
    ],
  },
];
