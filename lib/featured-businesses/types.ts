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
  referralCode: string | null;
  specialOffer: string | null;
  isPublic: boolean;
  isFeatured: boolean;
  isArchived: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type FeaturedBusinessInput = Omit<FeaturedBusiness, "id" | "createdAt" | "updatedAt">;
