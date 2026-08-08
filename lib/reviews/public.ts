import type { PublicReview } from "./types";

export const PUBLIC_REVIEW_COLUMNS = "first_name,last_initial,state,product,other_description,ease_rating,speed_rating,price_rating,support_rating,overall_rating,written_review,published_at,ids_response,ids_response_at";

export function toPublicReview(row: Record<string, unknown>): PublicReview {
  return {
    firstName: String(row.first_name), lastInitial: String(row.last_initial),
    state: String(row.state), product: row.product as PublicReview["product"],
    otherDescription: row.other_description ? String(row.other_description) : null,
    easeRating: Number(row.ease_rating), speedRating: Number(row.speed_rating), priceRating: Number(row.price_rating),
    supportRating: row.support_rating == null ? null : Number(row.support_rating), overallRating: Number(row.overall_rating),
    writtenReview: String(row.written_review), publishedAt: String(row.published_at),
    idsResponse: row.ids_response ? String(row.ids_response) : null,
    idsResponseAt: row.ids_response_at ? String(row.ids_response_at) : null, verifiedPurchase: true,
  };
}
