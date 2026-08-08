import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { PUBLIC_REVIEW_COLUMNS, toPublicReview } from "@/lib/reviews/public";
import { validateReviewSubmission } from "@/lib/reviews/validation";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const limit = Math.min(24, Math.max(1, Number(params.get("limit")) || 9));
  const category = ["ease_rating","speed_rating","price_rating","support_rating"].includes(params.get("category") ?? "") ? params.get("category")! : "overall_rating";
  const sort = params.get("sort") ?? "newest";
  let query = getSupabaseServiceClient().from("customer_reviews").select(PUBLIC_REVIEW_COLUMNS, { count: "exact" }).eq("status", "approved");
  const requestedProduct = params.get("product");
  const product = requestedProduct === "Equipment Demonstrations" ? "Equipment Demonstration" : requestedProduct;
  const state = params.get("state"), minimum = Number(params.get("minimum"));
  if (product && product !== "all") query = query.eq("product", product);
  if (state && state !== "all") query = query.eq("state", state);
  if (Number.isFinite(minimum) && minimum >= 1) query = query.gte(category, minimum);
  if (category === "support_rating" && params.has("minimum")) query = query.not("support_rating", "is", null);
  const sortColumn = sort === "highest" || sort === "lowest" ? category : "published_at";
  const ascending = sort === "oldest" || sort === "lowest";
  const { data, error, count } = await query.order(sortColumn, { ascending, nullsFirst: false }).range((page - 1) * limit, page * limit - 1);
  if (error) return NextResponse.json({ error: "Reviews are temporarily unavailable." }, { status: 503 });
  const { data: stateRows } = await getSupabaseServiceClient().from("customer_reviews").select("state").eq("status", "approved");
  return NextResponse.json({ reviews: (data ?? []).map((row) => toPublicReview(row)), count: count ?? 0, states: [...new Set((stateRows ?? []).map((row) => row.state))].sort(), page, hasMore: page * limit < (count ?? 0) });
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
  return NextResponse.json({ success: true }, { status: 201 });
}
