import { APPROVED_SEO_PATHS } from "./property-seo";
import type { SeoPageExpectation } from "../helpers/regional-seo-assertions";

const root = "/robot-mower-guides";
const products = ["/equipment/lymow-one-plus", "/equipment/yarbo", "/equipment/pandag-g1"];
export const GUIDE_SEO_CASES: readonly (SeoPageExpectation & { intent: string })[] = [
  {
    path: root, title: "Robot Mower Guides & Buying Resources | IDS",
    description: "Research robot mower connectivity, navigation, terrain and ownership costs with IDS educational guides. Turn practical questions into a better equipment plan.",
    h1: "Robot Mower Guides & Buying Resources", intent: "Educational research hub",
    breadcrumb: ["Home", "Robot Mower Guides"], breadcrumbPaths: ["/", root], minWords: 350,
    text: "These educational resources explain the questions behind a robot mower decision",
    links: ["/robot-mowers", "/equipment", "/professional-installation", "/services-scheduling", ...["do-robot-mowers-need-internet", "rtk-gps-vslam-vision", "robot-mower-vs-zero-turn", "commercial-roi-labor-planning", "tracked-vs-wheeled"].map((slug) => `${root}/${slug}`)],
  },
  {
    path: `${root}/do-robot-mowers-need-internet`, title: "Do Robot Mowers Need Internet or Wi-Fi? | IDS",
    description: "Learn how robot mower internet, Wi-Fi, cellular and RTK connections differ. Plan setup, remote monitoring and outages around your selected IDS platform.",
    h1: "Do Robot Mowers Need Internet or Wi-Fi?", intent: "Connectivity requirements by function and platform",
    text: "There is no single internet requirement for every robot mower",
    links: [root, "/robot-mowers", "/robot-mowers/wire-free", ...products, "/remote-assistance"],
    breadcrumb: ["Home", "Robot Mower Guides", "Do Robot Mowers Need Internet or Wi-Fi?"],
    breadcrumbPaths: ["/", root, `${root}/do-robot-mowers-need-internet`], minWords: 900,
  },
  {
    path: `${root}/rtk-gps-vslam-vision`, title: "RTK vs GPS, VSLAM & Vision in Robot Mowers | IDS",
    description: "Understand GNSS, RTK, VSLAM, vision and sensor fusion in robot mowers. Compare their roles, property limitations and verified IDS navigation combinations.",
    h1: "RTK, GPS, VSLAM & Vision: How Robot Mowers Navigate", intent: "Navigation terminology and complementary sensor roles",
    text: "GPS is one of those systems", links: [root, "/robot-mowers/wire-free", ...products, "/professional-installation"],
    breadcrumb: ["Home", "Robot Mower Guides", "RTK, GPS, VSLAM & Vision: How Robot Mowers Navigate"],
    breadcrumbPaths: ["/", root, `${root}/rtk-gps-vslam-vision`], minWords: 900,
  },
  {
    path: `${root}/robot-mower-vs-zero-turn`, title: "Robot Mower vs Zero-Turn Mower | Cost, Labor & Time | IDS",
    description: "Compare robot mowers and zero-turn mowers by operator time, ownership cost, maintenance and property fit. Build a practical plan without assumed savings.",
    h1: "Robot Mower vs Zero-Turn Mower", intent: "Ownership, labor and retained grounds tasks",
    text: "Neither approach automatically costs less", links: [root, "/robot-mowers", "/robot-mowers/large-acreage", "/commercial-robot-mowers", "/robot-mower-financing", "/equipment"],
    breadcrumb: ["Home", "Robot Mower Guides", "Robot Mower vs Zero-Turn Mower"],
    breadcrumbPaths: ["/", root, `${root}/robot-mower-vs-zero-turn`], minWords: 900,
  },
  {
    path: `${root}/commercial-roi-labor-planning`, title: "Commercial Robot Mower ROI & Labor Planning Guide | IDS",
    description: "Plan commercial robot mower ROI using your own labor, equipment, installation and service costs. Separate operating differences, staff capacity and cash flow.",
    h1: "Commercial Robot Mower ROI & Labor Planning", intent: "Organization-specific ROI and labor planning",
    text: "Current mowing cost – future robotic mowing cost = potential operating difference",
    links: [root, "/commercial-robot-mowers", "/equipment/pandag-g1", "/equipment/yarbo", "/robot-mower-financing", "/professional-installation", "/pandag/project-quote"],
    breadcrumb: ["Home", "Robot Mower Guides", "Commercial Robot Mower ROI & Labor Planning"],
    breadcrumbPaths: ["/", root, `${root}/commercial-roi-labor-planning`], minWords: 900,
  },
  {
    path: `${root}/tracked-vs-wheeled`, title: "Tracked vs Wheeled Robot Mowers | Terrain & Traction Guide | IDS",
    description: "Compare tracked and wheeled robot mowers by traction, turning, turf disturbance and maintenance. Assess uneven ground and verified Lymow and Yarbo examples.",
    h1: "Tracked vs Wheeled Robot Mowers", intent: "Terrain, traction and turf tradeoffs",
    text: "Neither design is the best choice for every lawn",
    links: [root, "/robot-mowers/hills-rough-terrain", "/robot-mowers/large-acreage", "/equipment/lymow-one-plus", "/equipment/yarbo", "/services-scheduling"],
    breadcrumb: ["Home", "Robot Mower Guides", "Tracked vs Wheeled Robot Mowers"],
    breadcrumbPaths: ["/", root, `${root}/tracked-vs-wheeled`], minWords: 900,
  },
];
export const BATCH_FIVE_SITEMAP_PATHS = [...APPROVED_SEO_PATHS, ...GUIDE_SEO_CASES.map((entry) => entry.path)];
