import { sendIdsNotification } from "@/lib/email";

type ReviewNotification = {
  firstName: string; lastName: string; state: string; email: string; product: string;
  overallRating: number; easeRating: number; speedRating: number; priceRating: number;
  supportRating: number | null; writtenReview: string; publishingConsent: boolean; contactConsent?: boolean;
};

export async function notifyReviewSubmitted(value: ReviewNotification, sender = sendIdsNotification) {
  try {
    await sender({
      subject: "IDS Website — New Review Submitted",
      text: [
        `Reviewer: ${value.firstName} ${value.lastName}`, `Email: ${value.email}`, `State: ${value.state}`,
        `Product: ${value.product}`, `Overall rating: ${value.overallRating}`, `Ease rating: ${value.easeRating}`,
        `Speed rating: ${value.speedRating}`, `Price rating: ${value.priceRating}`,
        `Support rating: ${value.supportRating ?? "Not supplied"}`,
        `Written review: ${value.writtenReview.trim() || "None supplied"}`,
        `Publishing consent: ${value.publishingConsent ? "Yes" : "No"}`,
        `Contact consent: ${value.contactConsent ? "Yes" : "No"}`, "Review at: /admin/reviews",
      ].join("\n"),
    });
  } catch {
    console.error("Review notification failed");
  }
}
