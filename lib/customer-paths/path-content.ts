import type { CustomerPath, PathCard, PathContent } from "./types";

export const pathContent: Record<CustomerPath, PathContent> = {
  nationwide: {
    eyebrow: "Nationwide Purchasing",
    title: "Build your equipment order.",
    description:
      "Compare available systems, select equipment and accessories, choose purchase or financing, and begin the self-ordering process.",
  },

  "local-services": {
    eyebrow: "IDS Regional Services",
    title: "Build your equipment and service package.",
    description:
      "Eligible customers can select equipment along with professional installation, setup, support, and other locally available IDS services.",
  },

  recommendation: {
    eyebrow: "Guided Recommendation",
    title: "Let us help identify the right system.",
    description:
      "Answer questions about acreage, terrain, obstacles, maintenance goals, and desired capabilities to receive a guided equipment recommendation.",
  },
};

export const pathLabels: Record<CustomerPath, string> = {
  nationwide: "Purchase Equipment Nationwide",
  "local-services": "IDS Local Setup & Support Services",
  recommendation: "Get Help Choosing the Right System",
};

export const pathCardsByKey: Record<CustomerPath, PathCard> = {
  nationwide: {
    key: "nationwide",
    badge: "Nationwide",
    title: "Purchase Equipment Nationwide",
    description:
      "Purchase equipment for direct shipment anywhere in the United States. Ideal for customers who prefer self-setup or optional remote guidance.",
  },

  "local-services": {
    key: "local-services",
    badge: "Regional Service",
    title: "IDS Local Setup & Support Services",
    description:
      "Purchase equipment with professional installation, setup, and ongoing hands-on support throughout the IDS regional service area.",
  },

  recommendation: {
    key: "recommendation",
    badge: "Guided Selection",
    title: "Get Help Choosing the Right System",
    description:
      "Use our guided recommendation process to compare systems based on acreage, terrain, obstacles, maintenance needs, and long-term goals.",
  },
};
