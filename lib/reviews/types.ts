export const REVIEW_PRODUCTS = [
  "Lymow One Plus", "Yarbo", "Yarbo Pro", "Pandag G1",
  "Equipment Demonstration", "Installation or Deployment",
  "Repair or Technical Support", "Personal Review", "Other",
] as const;

export const US_STATES = [
  "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan","Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia","Wisconsin","Wyoming",
] as const;

export type ReviewProduct = typeof REVIEW_PRODUCTS[number];
export type ReviewStatus = "pending" | "approved" | "rejected" | "hidden";
export type RatingCategory = "overall" | "ease" | "speed" | "price" | "support";

export interface PublicReview {
  /** Never serialized by the public API; retained only for in-memory test fixtures. */
  id?: string; firstName: string; lastInitial: string; state: string;
  product: ReviewProduct; otherDescription: string | null;
  easeRating: number; speedRating: number; priceRating: number;
  supportRating: number | null; overallRating: number; writtenReview: string;
  publishedAt: string; idsResponse: string | null; idsResponseAt: string | null;
  verifiedPurchase: true;
}

export interface PrivateReview extends PublicReview {
  lastName: string; email: string; publishingConsent: boolean;
  contactConsent: boolean; status: ReviewStatus; submittedAt: string;
  moderatedAt: string | null;
}

export interface ReviewSubmission {
  firstName: string; lastName: string; state: string; email: string;
  product: ReviewProduct; otherDescription?: string; easeRating: number;
  speedRating: number; priceRating: number; supportRating?: number | null;
  writtenReview: string; publishingConsent: boolean; contactConsent?: boolean;
  website?: string;
}
