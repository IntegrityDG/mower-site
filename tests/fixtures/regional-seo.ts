export const EXISTING_SITEMAP_PATHS = [
  "/", "/equipment", "/equipment/accessories", "/equipment/lymow-one-plus",
  "/equipment/yarbo", "/equipment/pandag-g1", "/services-scheduling",
  "/professional-installation", "/remote-assistance", "/service", "/reviews",
  "/referral-program", "/featured-businesses", "/dealer-tech-resources",
  "/ids-in-action", "/troubleshoot-your-robot",
] as const;

const buyerLinks = [
  "/robot-mowers", "/equipment", "/equipment/lymow-one-plus", "/equipment/yarbo",
  "/equipment/pandag-g1", "/professional-installation", "/services-scheduling",
  "/service", "/commercial-robot-mowers",
];

export const REGIONAL_SEO_CASES = [
  {
    path: "/robot-mowers", breadcrumb: ["Home", "Robot Mowers"],
    title: "Robot Mowers & Robotic Lawn Mowers | IDS",
    description: "Compare Lymow, Yarbo and Pandag robot mowers with IDS, a multi-brand specialist helping residential, large-property and commercial buyers plan the right system.",
    h1: "Robot Mowers for Residential, Large-Property & Commercial Lawn Care",
    text: "Older boundary-wire-only systems define the work area",
    links: [...buyerLinks.filter((path) => path !== "/robot-mowers"),
      "/robot-mowers/missouri", "/robot-mowers/southern-illinois", "/robot-mowers/northeast-arkansas",
      "/robot-mowers/western-kentucky", "/robot-mowers/western-tennessee"],
    cluster: "robot mower; robot lawn mower; robotic mower; robotic lawn mower",
  },
  {
    path: "/commercial-robot-mowers", breadcrumb: ["Home", "Commercial Robot Mowers"],
    title: "Commercial Robot Mowers & Municipal Robotic Mowing | IDS",
    description: "Plan commercial and municipal robotic mowing with IDS. Evaluate Pandag and suitable Yarbo systems, site conditions, fleet needs, charging and ongoing support.",
    h1: "Commercial & Municipal Robotic Mowing Solutions",
    text: "Record current mowing hours and labor costs",
    links: ["/equipment/pandag-g1", "/equipment/yarbo", "/professional-installation",
      "/services-scheduling", "/service", "/pandag/project-quote", "/robot-mowers"],
    cluster: "commercial robot mower; commercial robotic mower; municipal robot mower; robotic mower for commercial property",
  },
  {
    path: "/robot-mowers/missouri", breadcrumb: ["Home", "Robot Mowers", "Missouri"],
    title: "Robot Mowers in Missouri | Sales, Demos & Installation | IDS",
    description: "Explore Lymow, Yarbo and Pandag robot mowers in Missouri with IDS. Plan residential or commercial equipment, demos, installation and support around your property.",
    h1: "Robot Mowers & Robotic Lawn Care in Missouri",
    text: "A wooded parcel may have a small lawn plus long corridors",
    links: buyerLinks,
    cluster: "robot mower Missouri; robot lawn mower Missouri; robotic mower Missouri; robot mower dealer Missouri",
  },
  {
    path: "/robot-mowers/southern-illinois", breadcrumb: ["Home", "Robot Mowers", "Southern Illinois"],
    title: "Robot Mowers in Southern Illinois | IDS",
    description: "Compare robot mowers for Southern Illinois lawns, acreage and institutional grounds. IDS helps review Lymow, Yarbo and Pandag, setup, demos and support options.",
    h1: "Robot Mowers & Robotic Lawn Care in Southern Illinois",
    text: "A narrow connection between two lawns may determine the mowing plan",
    links: buyerLinks,
    cluster: "robot mower Southern Illinois; robot lawn mower Southern Illinois; robotic mower Southern Illinois; robot mower dealer Southern Illinois",
  },
  {
    path: "/robot-mowers/northeast-arkansas", breadcrumb: ["Home", "Robot Mowers", "Northeast Arkansas"],
    title: "Robot Mowers in Northeast Arkansas | IDS",
    description: "Evaluate robot mowers for Northeast Arkansas home acreage and managed grounds. Compare Lymow, Yarbo and Pandag with IDS and plan demos, setup and service.",
    h1: "Robot Mowers & Robotic Lawn Care in Northeast Arkansas",
    text: "Model fit should be decided by the hardest part",
    links: buyerLinks,
    cluster: "robot mower Northeast Arkansas; robot lawn mower Northeast Arkansas; robotic mower Northeast Arkansas; robot mower dealer Northeast Arkansas",
  },
  {
    path: "/robot-mowers/western-kentucky", breadcrumb: ["Home", "Robot Mowers", "Western Kentucky"],
    title: "Robot Mowers in Western Kentucky | IDS",
    description: "Explore robot mowers for Western Kentucky homes, shared-use lawns and commercial sites. IDS helps compare Lymow, Yarbo and Pandag, installation and support.",
    h1: "Robot Mowers & Robotic Lawn Care in Western Kentucky",
    text: "adjust the schedule when events change normal use",
    links: buyerLinks,
    cluster: "robot mower Western Kentucky; robot lawn mower Western Kentucky; robotic mower Western Kentucky; robot mower dealer Western Kentucky",
  },
  {
    path: "/robot-mowers/western-tennessee", breadcrumb: ["Home", "Robot Mowers", "Western Tennessee"],
    title: "Robot Mowers in Western Tennessee | IDS",
    description: "Plan robotic mowing for Western Tennessee acreage, neighborhood lawns and managed properties. Compare IDS equipment, demo, installation and service options.",
    h1: "Robot Mowers & Robotic Lawn Care in Western Tennessee",
    text: "separate units, transported equipment and existing crew mowing",
    links: buyerLinks,
    cluster: "robot mower Western Tennessee; robot lawn mower Western Tennessee; robotic mower Western Tennessee; robot mower dealer Western Tennessee",
  },
] as const;

export type RegionalSeoCase = typeof REGIONAL_SEO_CASES[number];
