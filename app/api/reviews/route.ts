import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { readPublicReviews } from "@/lib/reviews/server";
import { validateReviewSubmission } from "@/lib/reviews/validation";
import { notifyReviewSubmitted } from "@/lib/reviews/notification";

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(await readPublicReviews(request.nextUrl.searchParams));
  } catch {
    return NextResponse.json({ error: "Reviews are temporarily unavailable." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const parsed = validateReviewSubmission(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ errors: parsed.errors }, { status: 400 });
  const rateLimitSalt = process.env.REVIEW_RATE_LIMIT_SALT;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (!rateLimitSalt || rateLimitSalt.length < 32 || !forwarded) {
    console.error("Review submission rate limiting is not configured.");
    return NextResponse.json({ error: "Review submission is temporarily unavailable." }, { status: 503 });
  }
  const fingerprint = createHash("sha256").update(`${rateLimitSalt}:${forwarded}`).digest("hex");
  const client = getSupabaseServiceClient();
  const { data: allowed, error: rateLimitError } = await client.rpc("review_consume_submission_rate_limit", { p_fingerprint: fingerprint });
  if (rateLimitError) return NextResponse.json({ error: "Review submission is temporarily unavailable." }, { status: 503 });
  if (!allowed) return NextResponse.json({ error: "Too many recent submissions. Please try again later." }, { status: 429 });
  const value = parsed.value;
  const { error } = await client.from("customer_reviews").insert({
    first_name: value.firstName, last_name: value.lastName, state: value.state, email: value.email,
    product: value.product, other_description: value.product === "Other" ? value.otherDescription : null,
    ease_rating: value.easeRating, speed_rating: value.speedRating, price_rating: value.priceRating,
    support_rating: value.supportRating, written_review: value.writtenReview,
    publishing_consent: value.publishingConsent, contact_consent: value.contactConsent,
    status: "pending", submission_fingerprint: fingerprint,
  });
  if (error) return NextResponse.json({ error: "Your review could not be saved. Please try again." }, { status: 500 });
  await notifyReviewSubmitted(value);
  return NextResponse.json({ success: true }, { status: 201 });
}
