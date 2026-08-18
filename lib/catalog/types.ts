export type CatalogPricePromotion = {
  context: "ids" | "sale";
  message: string | null;
  imageUrl: string | null;
};

export type CatalogPrice = {
  /** Informational MSRP only. Never use for selection, checkout, or totals. */
  displayMsrpPriceCents?: number | null;
  regularPriceCents: number | null;
  salePriceCents: number | null;
  currentPriceCents: number | null;
  /** Global IDS Everyday Low Price program state used for customer-facing display. */
  everydayLowPriceEnabled?: boolean;
  showPublicPrice: boolean;
  contactForPricing: boolean;
  promotionLabel: string | null;
  saleIsActive: boolean;
  saleEndsAt?: string | null;
  /** Public promotional content for the price that is actually active. */
  publicPromotion?: CatalogPricePromotion | null;
};

export type CatalogPublicStatus = "active" | "unavailable";

export type CatalogAvailability = {
  /** Normalized sellability. Never infer this from price presence. */
  isAvailable: boolean;
  /** Retained when the source record uses public_status. */
  publicStatus: CatalogPublicStatus | null;
};

export type CatalogSalesMode = "self_service" | "quote_only";

export type CatalogSpecificationCategory =
  | "applications"
  | "power"
  | "performance"
  | "battery"
  | "cuttingHeight"
  | "physical";

export type CatalogSpecification = {
  slug: string;
  label: string;
  category: CatalogSpecificationCategory;
  dataType: "numeric" | "text" | "boolean" | "text_list";
  canonicalUnit: string | null;
  numericValue: number | null;
  textValue: string | null;
  booleanValue: boolean | null;
  textValues: string[] | null;
  displayValue: string | null;
  sortOrder: number;
};

export type CatalogSpecifications = Record<
  CatalogSpecificationCategory,
  CatalogSpecification[]
>;

export type CatalogMedia = {
  id: string;
  mediaType: "image" | "video";
  url: string;
  altText: string | null;
  caption: string | null;
  isPrimary: boolean;
};

export type CatalogPageSection = {
  id: string;
  heading: string | null;
  bodyContent: string | null;
  mediaUrl: string | null;
  buttonLabel: string | null;
  buttonUrl: string | null;
  sortOrder: number;
};

export type CatalogProductPage = {
  heroHeading: string | null;
  heroSubheading: string | null;
  longFormContent: string | null;
  sections: CatalogPageSection[];
};

export type CatalogOption = CatalogPrice & CatalogAvailability & {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  optionGroupId: string | null;
  isRequired: boolean;
  isIncluded: boolean;
  isRecommended: boolean;
  defaultQuantity: number;
  minimumQuantity: number;
  maximumQuantity: number | null;
  sortOrder: number;
  accessoryListingEnabled?: boolean;
  accessoryTab?: "lymow" | "yarbo" | "aftermarket" | null;
  accessoryImageUrl?: string | null;
  accessoryImageAlt?: string | null;
  accessoryBadge?: string | null;
  idsExclusive?: boolean;
  showInBuilder?: boolean;
  accessoryActionType?: "builder" | "contact" | "external" | "none" | null;
  accessoryActionLabel?: string | null;
  accessoryActionUrl?: string | null;
  accessoryPriceText?: string | null;
  manufacturerName?: string | null;
};

export type CatalogOptionGroup = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  selectionType: "single" | "multiple" | "quantity" | "included";
  isRequired: boolean;
  minimumSelections: number;
  maximumSelections: number | null;
  sortOrder: number;
  options: CatalogOption[];
};

export type CatalogVariant = CatalogPrice & CatalogAvailability & {
  id: string;
  slug: string;
  sku: string | null;
  name: string;
  description: string | null;
  sortOrder: number;
  definingOptionIds: string[];
  specifications?: CatalogSpecifications;
};

export type CatalogPackageItem = {
  optionId: string;
  quantity: number;
  includedInPackagePrice: boolean;
  option: CatalogOption | null;
};

export type CatalogPackage = CatalogPrice & CatalogAvailability & {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
  items: CatalogPackageItem[];
};

export type CatalogServicePaymentOption = CatalogPrice & CatalogAvailability & {
  id: string;
  slug: string;
  name: string;
  billingType: string;
  seasonLengthMonths: number | null;
  savingsLabel: string | null;
  notes: string | null;
  sortOrder: number;
};

export type CatalogService = CatalogPrice & CatalogAvailability & {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string;
  billingType: string;
  requiresLocalService: boolean;
  requiresPropertyReview: boolean;
  estimatedHours: number | null;
  maximumVisitHours: number | null;
  seasonLength: string | null;
  isRecommended: boolean;
  isRequired: boolean;
  sortOrder: number;
  paymentOptions: CatalogServicePaymentOption[];
};

export type CatalogProduct = CatalogPrice & CatalogAvailability & {
  id: string;
  slug: string;
  brand: string;
  name: string;
  homepageSummary: string | null;
  fullDescription: string | null;
  capabilityLevel: string | null;
  propertyScale: string | null;
  customerGuidance: string | null;
  brochureUrl: string | null;
  videoUrl: string | null;
  imageUrl: string;
  imageAlt: string;
  sortOrder: number;
  /** Public sales-channel behavior; never a source of internal pricing data. */
  salesMode: CatalogSalesMode;
  page: CatalogProductPage | null;
  media: CatalogMedia[];
  variants: CatalogVariant[];
  optionGroups: CatalogOptionGroup[];
  ungroupedOptions: CatalogOption[];
  packages: CatalogPackage[];
};

export type CatalogResponse = {
  products: CatalogProduct[];
  generatedAt: string;
};

export type ProductBuildSelection = {
  variantId: string;
  packageId: string;
  optionQuantities: Record<string, number>;
  purchaseMode?: "complete-system" | "individual-equipment";
  includeBaseProduct?: boolean;
};

export type ServiceSelection = {
  serviceId: string;
  paymentOptionId: string;
};
