import { EXISTING_SITEMAP_PATHS, REGIONAL_SEO_CASES } from "./regional-seo";

export const PRE_BATCH_THREE_PATHS = [...EXISTING_SITEMAP_PATHS, ...REGIONAL_SEO_CASES.map((entry) => entry.path)];
const products = ["/equipment/lymow-one-plus", "/equipment/yarbo", "/equipment/pandag-g1"];

export const PROPERTY_SEO_CASES = [
  {
    path: "/robot-mowers/large-acreage", breadcrumb: ["Home", "Robot Mowers", "Large Acreage"],
    title: "Robot Mowers for Large Acreage & Large Properties | IDS",
    description: "Choose a robot mower for large acreage by assessing maintained turf, zones, terrain and charging. Compare Lymow, Yarbo and Pandag with IDS property guidance.",
    h1: "Robot Mowers for Large Acreage & Large Properties",
    text: "Travel without cutting still uses time and energy",
    links: ["/robot-mowers", "/equipment", ...products, "/commercial-robot-mowers", "/professional-installation", "/services-scheduling", "/robot-mowers/hills-rough-terrain", "/#contact"],
    cluster: "robot mower for large acreage; robot mower for large property; robot mower for 5 acres; robot mower for 10 acres; robot mower for 20 acres",
  },
  {
    path: "/robot-mowers/hills-rough-terrain", breadcrumb: ["Home", "Robot Mowers", "Hills & Rough Terrain"],
    title: "Robot Mowers for Hills, Slopes & Rough Terrain | IDS",
    description: "Evaluate robot mowers for hills, slopes and uneven ground with IDS. Review traction, side slopes, hazards and verified Lymow, Yarbo and Pandag equipment fit.",
    h1: "Robot Mowers for Hills, Slopes & Rough Terrain",
    text: "Obstacle detection and navigation should not be treated as the only safety measure",
    links: ["/robot-mowers", "/robot-mowers/large-acreage", ...products, "/professional-installation", "/services-scheduling", "/service", "/#contact"],
    cluster: "robot mower for hills; robot mower for steep hills; robot mower for slopes; robot mower for rough terrain; robot mower for uneven ground",
  },
  {
    path: "/robot-mowers/wire-free", breadcrumb: ["Home", "Robot Mowers", "Wire-Free Robot Mowers"],
    title: "Robot Mowers Without Boundary Wire | RTK & Virtual Boundaries | IDS",
    description: "Understand robot mowers without boundary wire: RTK, GPS, vision and virtual boundaries. Compare IDS platforms and plan mapping, no-go zones and professional setup.",
    h1: "Robot Mowers Without Boundary Wire",
    text: "Wire-free does not mean zero setup",
    links: ["/robot-mowers", ...products, "/professional-installation", "/services-scheduling", "/troubleshoot-your-robot"],
    cluster: "robot mower without boundary wire; wire free robot mower; robot mower no perimeter wire; RTK robot mower",
  },
  {
    path: "/robot-mower-financing", breadcrumb: ["Home", "Robot Mower Financing"],
    title: "Robot Mower Financing & Payment Options | IDS",
    description: "Explore robot mower financing through the existing IDS Hearth process. Review equipment choices, lender approval, final terms and separate payment options.",
    h1: "Robot Mower Financing & Payment Options",
    text: "Those requests are not prepaid service charges in the configured equipment estimate",
    links: ["/equipment", ...products, "/robot-mowers", "/commercial-robot-mowers", "/professional-installation", "/services-scheduling", "/#location-and-customer-path", "https://app.gethearth.com/requests/930af233-2a7b-4f52-a836-bd11173d6fee", "mailto:IntegrityDistributionSystems@gmail.com"],
    cluster: "robot mower financing; robot lawn mower financing; robotic mower financing; finance robot mower",
  },
] as const;

export const APPROVED_SEO_PATHS = [...PRE_BATCH_THREE_PATHS, ...PROPERTY_SEO_CASES.map((entry) => entry.path)];
