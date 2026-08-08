export const SALES_SPECIALS_HEADLINE_MAX = 120;
export const SALES_SPECIALS_DESCRIPTION_MAX = 500;

export const SALES_SPECIALS_CARTOONS = {
  none: null,
  lymow: {
    label: "Lymow",
    src: "/products/lymow-one-plus-thumb.PNG",
    alt: "Lymow autonomous mower",
  },
  yarbo: {
    label: "Yarbo",
    src: "/products/yarbo-thumb.png",
    alt: "Yarbo autonomous mower",
  },
  pandag: {
    label: "Pandag",
    src: "/products/pandag-thumb.png",
    alt: "Pandag commercial autonomous mower",
  },
  all: {
    label: "All Three Machines",
    src: "/images/cartoon-mowers.png",
    alt: "Integrity Distribution Systems autonomous mower lineup",
  },
} as const;

export type SalesSpecialsCartoonKey = keyof typeof SALES_SPECIALS_CARTOONS;

export type SalesSpecialsConfig = {
  enabled: boolean;
  cartoonKey: SalesSpecialsCartoonKey;
  headline: string;
  description: string;
};

export const DEFAULT_SALES_SPECIALS: SalesSpecialsConfig = {
  enabled: false,
  cartoonKey: "none",
  headline: "Promotion headline",
  description: "Promotion details will appear here when this feature is enabled.",
};

export function isSalesSpecialsCartoonKey(
  value: unknown
): value is SalesSpecialsCartoonKey {
  return typeof value === "string" && value in SALES_SPECIALS_CARTOONS;
}
