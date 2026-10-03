import ReviewsPageContent from "@/components/reviews/ReviewsPageContent";
import { readPublicReviews } from "@/lib/reviews/server";

export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  const initialData = await readPublicReviews().catch(() => undefined);
  return <ReviewsPageContent initialData={initialData} />;
}
