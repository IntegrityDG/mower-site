export const AFTERMARKET_DISCLAIMER = "Aftermarket Product Disclaimer: Integrity Distribution Systems (IDS) does not test, verify, or endorse any product listed in this section unless the product is specifically identified as an IDS Exclusive. All product claims, specifications, warranties, guarantees, availability, and pricing are the sole responsibility of the product's manufacturer or supplier.";

export type AccessoryTab = "lymow" | "yarbo" | "pandag" | "aftermarket";
export type AccessoryAction = "builder" | "contact" | "external" | "none";

export type AccessorySettings = {
  lymowEnabled: boolean; lymowLabel: string;
  yarboEnabled: boolean; yarboLabel: string;
  pandagEnabled: boolean; pandagLabel: string; pandagMessage: string;
  aftermarketEnabled: boolean; aftermarketLabel: string;
  featuredAftermarketEnabled: boolean; featuredAftermarketImageUrl: string | null;
  featuredAftermarketImageAlt: string | null; featuredAftermarketHeading: string | null;
  featuredAftermarketDescription: string | null; featuredAftermarketIdsExclusive: boolean;
  aftermarketDisclaimer: string;
};

export type AccessoryItem = {
  id: string; slug: string; tab: AccessoryTab; name: string; description: string | null;
  imageUrl: string | null; imageAlt: string | null; badge: string | null; idsExclusive: boolean;
  manufacturer: string | null; regularPriceCents: number | null; salePriceCents: number | null;
  currentPriceCents: number | null; promotionLabel: string | null; showPublicPrice: boolean;
  contactForPricing: boolean; showInBuilder: boolean; actionType: AccessoryAction;
  actionLabel: string | null; actionUrl: string | null; priceText: string | null; sortOrder: number;
  visible?: boolean; publicStatus?: string;
};

export type AccessoryCatalogResponse = { settings: AccessorySettings; items: AccessoryItem[] };
