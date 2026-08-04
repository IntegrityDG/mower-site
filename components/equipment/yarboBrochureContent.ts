export type YarboBrochureImage = {
  src: string;
  alt: string;
  width: number;
  height: number;
  fit?: "cover" | "contain";
};

export type YarboSpec = {
  label: string;
  value: string;
};

export type YarboFeatureSection = {
  eyebrow: string;
  title: string;
  body: string;
  image: YarboBrochureImage;
  secondaryImage?: YarboBrochureImage;
  facts: string[];
};

export type YarboComponentContent = {
  category: string;
  description: string;
  job: string;
  image: YarboBrochureImage;
  specs: YarboSpec[];
};

const brochureBase = "/equipment/yarbo/brochure";

export const yarboImages = {
  lineup: {
    src: `${brochureBase}/yarbo-complete-platform-lineup.webp`,
    alt: "Yarbo Core shown with compatible mower, snow blower, blower, and trimmer modules.",
    width: 1050,
    height: 785,
  },
  core: {
    src: `${brochureBase}/yarbo-core.webp`,
    alt: "Yarbo Core tracked base platform.",
    width: 380,
    height: 260,
    fit: "contain",
  },
  mower: {
    src: `${brochureBase}/yarbo-lawn-mower-module.webp`,
    alt: "Yarbo Standard Lawn Mower Module operating on grass.",
    width: 1030,
    height: 600,
  },
  mowerPro: {
    src: `${brochureBase}/yarbo-lawn-mower-pro-module.webp`,
    alt: "Yarbo Lawn Mower Pro Module operating in dense grass.",
    width: 1030,
    height: 450,
  },
  snowBlower: {
    src: `${brochureBase}/yarbo-snow-blower-module.webp`,
    alt: "Yarbo Snow Blower Module clearing snow on a driveway.",
    width: 1030,
    height: 600,
  },
  blower: {
    src: `${brochureBase}/yarbo-blower-module.webp`,
    alt: "Yarbo Blower Module clearing leaves near a home.",
    width: 1030,
    height: 600,
  },
  trimmer: {
    src: `${brochureBase}/yarbo-trimmer-package.webp`,
    alt: "Yarbo Trimmer Package trimming along a planted border.",
    width: 1030,
    height: 590,
  },
  obstacleDetection: {
    src: `${brochureBase}/yarbo-obstacle-detection.webp`,
    alt: "Yarbo obstacle detection illustrations showing sensor coverage and object avoidance.",
    width: 1015,
    height: 350,
  },
  stereoVision: {
    src: `${brochureBase}/yarbo-stereo-vision.webp`,
    alt: "Close-up illustration of Yarbo stereo vision binocular cameras.",
    width: 485,
    height: 350,
  },
  underTrees: {
    src: `${brochureBase}/yarbo-under-trees.webp`,
    alt: "Yarbo visual navigation coverage under trees.",
    width: 480,
    height: 340,
  },
  autoDocking: {
    src: `${brochureBase}/yarbo-auto-docking.webp`,
    alt: "Yarbo Core parked on its charging dock.",
    width: 995,
    height: 455,
  },
  battery: {
    src: `${brochureBase}/yarbo-battery.webp`,
    alt: "Yarbo Core with its battery compartment open.",
    width: 500,
    height: 365,
    fit: "contain",
  },
  trackedTerrain: {
    src: `${brochureBase}/yarbo-tracked-terrain.webp`,
    alt: "Yarbo crossing uneven terrain near a paved edge.",
    width: 500,
    height: 330,
  },
  app: {
    src: `${brochureBase}/yarbo-app-control.webp`,
    alt: "Yarbo mobile app screens for setup and control.",
    width: 330,
    height: 360,
    fit: "contain",
  },
  remote: {
    src: `${brochureBase}/yarbo-remote-control.webp`,
    alt: "Yarbo physical remote controller.",
    width: 330,
    height: 390,
    fit: "contain",
  },
} as const satisfies Record<string, YarboBrochureImage>;

export const YARBO_BROCHURE_IMAGE_PATHS = Object.values(yarboImages).map(
  (image) => image.src
);

export const YARBO_OMITTED_BROCHURE_SPECS = [
  "Machine-readable brochure text",
  "Warranty terms",
  "Standard Lawn Mower Module dimensions",
  "Standard Lawn Mower Module weight",
  "Lawn Mower Pro Module dimensions",
  "Lawn Mower Pro Module weight",
  "Blower Module dimensions",
  "Blower Module weight",
  "Trimmer Package dimensions",
  "Trimmer Package weight",
  "Charging station dimensions",
];

export const yarboCoreSpecs: YarboSpec[] = [
  { label: "Dimensions (L x W x H)", value: "27 x 22 x 20 in / 675 x 566 x 512 mm" },
  { label: "Weight without battery", value: "123.5 lbs / 56 kg" },
  { label: "Weight with battery", value: "145.5 lbs / 66 kg" },
  { label: "Operating temperature", value: "-13 F to 113 F (-25 C to 45 C)" },
  { label: "Battery capacity", value: "1.38 kWh" },
  { label: "Towing capacity", value: "GTW up to 500 lbs / 200 kg" },
  { label: "Module pitch angle", value: "0 to 18 degrees" },
  { label: "Connectivity", value: "4G, Wi-Fi, Bluetooth, Wi-Fi HaLow" },
  { label: "Navigation", value: "RTK-GPS, computer vision, sensors" },
  { label: "Charging", value: "Wired and wireless" },
  { label: "Obstacle avoidance", value: "Vision-based cameras" },
];

export const yarboPowerSpecs: YarboSpec[] = [
  { label: "Battery capacity", value: "1.38 kWh lithium-ion battery" },
  { label: "Charging time", value: "90 min from 20% to 80%" },
  { label: "Auto-recharge", value: "Yes" },
  { label: "Operating temperature", value: "-13 F to 113 F (-25 C to 45 C)" },
  { label: "Mower runtime", value: "120 min per charge" },
  { label: "Snow blower runtime", value: "90 min per charge" },
  { label: "Blower runtime", value: "70 min per charge" },
  { label: "Trimmer runtime", value: "135 min per charge" },
];

export const yarboNavigationSpecs: YarboSpec[] = [
  { label: "Positioning and navigation", value: "RTK, vision, IMU, ODOM" },
  { label: "Navigation under trees", value: "Vision, IMU, ODOM" },
  { label: "Vision system", value: "6 cameras with stereo vision support" },
  { label: "Obstacle sensing", value: "2 ultrasonic sensors and front bumper on mower configurations" },
  { label: "Boundary mapping", value: "Stereo vision supports automatic boundary mapping" },
  { label: "Non-GPS operation support", value: "Visual navigation, odometry, and IMU fusion" },
];

export const yarboTerrainSpecs: YarboSpec[] = [
  { label: "Tracked drive", value: "Rubber tracks for traction and weight distribution" },
  { label: "Mower, Pro, Blower, and Trimmer slope", value: "70% (35 degrees)" },
  { label: "Snow blower slope", value: "36% (20 degrees)" },
  { label: "Vertical obstacle clearance", value: "2 in / 50 mm on mower and trimmer configurations" },
  { label: "Snow surfaces", value: "Paved, concrete, and gravel" },
  { label: "Snow types", value: "Dry, wet, and packed snow" },
];

export const yarboFeatureSections: YarboFeatureSection[] = [
  {
    eyebrow: "Modular platform",
    title: "One Core, Multiple Seasons",
    body:
      "Yarbo is built around a single Core that supplies the shared tracked drive, power, navigation, and control platform. Compatible modules attach to that Core for mowing, snow removal, blowing, and trimming.",
    image: yarboImages.lineup,
    facts: [
      "Yarbo Core is the required base platform.",
      "Current active modules are shown as components below.",
      "Customers can build a one-season or multi-season system in Build Your System.",
    ],
  },
  {
    eyebrow: "Navigation",
    title: "Precision Mapping and Route Keeping",
    body:
      "RTK-GPS navigation, computer vision, IMU data, and odometry work together to support mapped operation and path keeping, including areas where GPS conditions are less reliable.",
    image: yarboImages.underTrees,
    facts: [
      "Positioning and navigation: RTK, vision, IMU, ODOM.",
      "Under-tree operation: vision, IMU, ODOM.",
      "Stereo vision supports automatic boundary mapping.",
    ],
  },
  {
    eyebrow: "Obstacle detection",
    title: "Vision-Led Obstacle Detection",
    body:
      "Yarbo uses cameras and supporting sensors for obstacle detection and avoidance. Mower configurations add ultrasonic sensors and bumper detection; snow-clearing configurations list binocular cameras and bumper detection.",
    image: yarboImages.obstacleDetection,
    secondaryImage: yarboImages.stereoVision,
    facts: [
      "Spatial AI system: 6 cameras and 2 ultrasonic sensors.",
      "Mower obstacle avoidance: binocular cameras, ultrasonic sensors, bumper.",
      "Snow obstacle detection: binocular cameras and bumper.",
    ],
  },
  {
    eyebrow: "Mobility",
    title: "Tracked Mobility for Challenging Terrain",
    body:
      "Rubber tracks help distribute weight and support traction on slopes and uneven ground. Mowing, Pro mowing, blower, and trimmer configurations are rated for 70% (35 degree) climbing ability, with a lower snow-blower slope rating.",
    image: yarboImages.trackedTerrain,
    facts: [
      "Mower, Pro, Blower, and Trimmer slope rating: 70% (35 degrees).",
      "Snow blower applicable slope: 36% (20 degrees).",
      "Mower and trimmer vertical obstacle clearance: 2 in / 50 mm.",
    ],
  },
  {
    eyebrow: "Charging",
    title: "Automatic Charging and Docking",
    body:
      "When work is complete or the battery is low, Yarbo is designed to return to its docking station autonomously. Auto-recharge support is listed across current task modules.",
    image: yarboImages.autoDocking,
    secondaryImage: yarboImages.battery,
    facts: [
      "Battery capacity: 1.38 kWh.",
      "Charging time: 90 min from 20% to 80%.",
      "Operating temperature: -13 F to 113 F (-25 C to 45 C).",
    ],
  },
  {
    eyebrow: "Controls",
    title: "App and Remote Operation",
    body:
      "Yarbo can be managed through the Yarbo app or physical controller. Teleoperation support is listed for the active task modules.",
    image: yarboImages.app,
    secondaryImage: yarboImages.remote,
    facts: [
      "Connectivity: 4G, Wi-Fi, Bluetooth, Wi-Fi HaLow.",
      "Wi-Fi HaLow wide coverage is listed up to 31 acres.",
      "Teleoperation is listed for current task modules.",
    ],
  },
];

export const yarboComponentContent: Record<string, YarboComponentContent> = {
  "yarbo-core": {
    category: "Core platform",
    description:
      "The shared tracked base that provides drive, power, navigation, charging, and control for compatible Yarbo modules.",
    job: "Provides the platform foundation for every Yarbo system.",
    image: yarboImages.core,
    specs: [
      { label: "Dimensions", value: "27 x 22 x 20 in" },
      { label: "Weight with battery", value: "145.5 lbs" },
      { label: "Battery", value: "1.38 kWh" },
      { label: "Navigation", value: "RTK-GPS, computer vision, sensors" },
    ],
  },
  "yarbo-mower-module": {
    category: "Mowing module",
    description:
      "The standard mowing module for autonomous lawn care on mapped grass areas.",
    job: "Cuts grass with a 20 in deck across configured mowing routes.",
    image: yarboImages.mower,
    specs: [
      { label: "Cutting width", value: "20 in / 500 mm" },
      { label: "Cutting height", value: "1.2 to 4.0 in / 30 to 102 mm" },
      { label: "Mowing time", value: "120 min per charge" },
      { label: "Max mowing area", value: "6.2 acres / 25,000 sq m" },
      { label: "Slope", value: "70% (35 degrees)" },
      { label: "IP rating", value: "IPX5" },
    ],
  },
  "yarbo-lawn-mower-pro-module": {
    category: "Mowing module",
    description:
      "A higher-output mowing module for demanding grass conditions, lower cutting-height goals, and Pro mowing setups.",
    job: "Adds dual 300 W mowing motors and a lower 0.8 in cutting range.",
    image: yarboImages.mowerPro,
    specs: [
      { label: "Cutting width", value: "20 in / 500 mm" },
      { label: "Cutting height", value: "0.8 to 4.0 in / 20 to 102 mm" },
      { label: "Mowing motors", value: "300 W x 2" },
      { label: "Peak power", value: "2,500 W" },
      { label: "Mowing time", value: "120 min per charge" },
      { label: "IP rating", value: "IPX6" },
    ],
  },
  "yarbo-snow-blower-module": {
    category: "Snow module",
    description:
      "A two-stage snow-clearing module for driveways, walks, and configured winter routes.",
    job: "Clears snow with a 24 in width and adjustable chute direction.",
    image: yarboImages.snowBlower,
    specs: [
      { label: "Stage type", value: "2-stage" },
      { label: "Clearing width", value: "24 in / 600 mm" },
      { label: "Intake height", value: "12 in / 300 mm" },
      { label: "Throwing distance", value: "6 to 40 ft / 1.8 to 12 m" },
      { label: "Runtime", value: "90 min per charge" },
      { label: "Module weight", value: "77 lbs / 35 kg" },
    ],
  },
  "yarbo-leaf-blower-module": {
    category: "Cleanup module",
    description:
      "A blower module for leaves, light debris, and hard-to-reach cleanup areas.",
    job: "Moves leaves and debris with high air velocity and volume.",
    image: yarboImages.blower,
    specs: [
      { label: "Air velocity", value: "174 MPH" },
      { label: "Air volume", value: "760 CFM" },
      { label: "Motor power", value: "2,000 W" },
      { label: "Runtime", value: "70 min per charge" },
      { label: "Slope", value: "70% (35 degrees)" },
      { label: "IP rating", value: "IPX5" },
    ],
  },
  "yarbo-trimmer-module": {
    category: "Trimming package",
    description:
      "A trimmer package for edges, borders, tight spaces, and detail zones around the lawn.",
    job: "Performs automated trimming with adjustable height and autonomous line feed.",
    image: yarboImages.trimmer,
    specs: [
      { label: "Trimming height", value: "2 to 4 in / 50 to 102 mm" },
      { label: "Motor power", value: "200 W" },
      { label: "No-load speed", value: "6,500 RPM" },
      { label: "Runtime", value: "135 min per charge" },
      { label: "Line", value: "0.06 in dia., 23 ft length" },
      { label: "Slope", value: "70% (35 degrees)" },
    ],
  },
};

export const inactiveYarboBrochureItems = [
  "Yarbo Snow Plow",
  "Yarbo Sweeper",
  "Yarbo VacBlow",
  "Yarbo Arm",
  "Yarbo Sprinkler",
  "Yarbo Guard",
  "Lawn Sweeper",
  "Lawn Roller",
  "Dump Cart",
  "Dethatcher",
  "Granular Spreader",
  "Liquid Sprayer",
  "Standalone Tow Hitch",
];
