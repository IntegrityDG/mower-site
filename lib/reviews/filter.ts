import type { PublicReview, RatingCategory } from "./types";

export interface ReviewFilters { product?: string; category?: RatingCategory; minimum?: number; state?: string; sort?: "newest"|"oldest"|"highest"|"lowest"; }
export const categoryRating = (review: PublicReview, category: RatingCategory = "overall") => ({ overall: review.overallRating, ease: review.easeRating, speed: review.speedRating, price: review.priceRating, support: review.supportRating }[category]);
export function filterAndSortReviews(reviews: PublicReview[], filters: ReviewFilters) {
  const category = filters.category ?? "overall";
  return reviews.filter((review) => {
    const productMatch = !filters.product || filters.product === "all" || review.product === filters.product;
    const stateMatch = !filters.state || filters.state === "all" || review.state === filters.state;
    const score = categoryRating(review, category);
    return productMatch && stateMatch && (filters.minimum == null || (score != null && score >= filters.minimum));
  }).sort((a, b) => {
    if (filters.sort === "oldest") return +new Date(a.publishedAt) - +new Date(b.publishedAt);
    if (filters.sort === "highest" || filters.sort === "lowest") {
      const av = categoryRating(a, category) ?? -1, bv = categoryRating(b, category) ?? -1;
      return filters.sort === "highest" ? bv - av : av - bv;
    }
    return +new Date(b.publishedAt) - +new Date(a.publishedAt);
  });
}
