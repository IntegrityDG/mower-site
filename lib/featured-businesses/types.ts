export type FeaturedBusiness = {
  id: string;
  businessName: string;
  description: string;
  operatingRegion: string | null;
  imageUrl: string | null;
  imagePath: string | null;
  imageAlt: string | null;
  websiteUrl: string | null;
  facebookUrl: string | null;
  phone: string | null;
  address: string | null;
  businessCity: string | null;
  businessState: string | null;
  businessCounty: string | null;
  postalCode: string | null;
  phoneAreaCode: string | null;
  serviceAreas: import("./location").ServiceArea[];
  referralCode: string | null;
  specialOffer: string | null;
  isPublic: boolean;
  isFeatured: boolean;
  isArchived: boolean;
  sortOrder: number;
  listingStartedAt: string | null;
  listingExpiresAt: string | null;
  listingGraceUntil: string | null;
  listingExpiredAt: string | null;
  lastRenewedAt: string | null;
  renewalCount: number;
  createdAt: string;
  updatedAt: string;
};

export type FeaturedBusinessInput = Omit<FeaturedBusiness, "id" | "createdAt" | "updatedAt" | "listingStartedAt" | "listingExpiresAt" | "listingGraceUntil" | "listingExpiredAt" | "lastRenewedAt" | "renewalCount">;

export type FeaturedBusinessRenewalContact={featuredBusinessId:string;contactName:string|null;contactEmail:string|null;reminder30SentAt:string|null;reminder7SentAt:string|null};
