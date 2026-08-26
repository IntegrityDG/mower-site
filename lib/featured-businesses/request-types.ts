import type { ServiceArea } from "./location";

export type FeaturedBusinessRequestStatus = "pending" | "needs_info" | "approved" | "denied";
export type FeaturedBusinessRequestInput = {
  contactName: string; contactEmail: string; businessName: string; description: string;
  businessCity: string | null; businessState: string; businessCounty: string; postalCode: string | null;
  operatingRegion: string | null; phone: string | null; phoneAreaCode: string | null; address: string | null;
  websiteUrl: string | null; facebookUrl: string | null; specialOffer: string | null;
  additionalNotes: string | null; adminNotes: string | null; consentConfirmed: true; serviceAreas: ServiceArea[];
};
export type FeaturedBusinessRequest = FeaturedBusinessRequestInput & {
  id: string; status: FeaturedBusinessRequestStatus; logoPath: string; logoContentType: string;
  moreInfoMessage: string | null; moreInfoRequestedAt: string | null; approvedBusinessId: string | null;
  approvedAt: string | null; deniedAt: string | null; createdAt: string; updatedAt: string;
};
