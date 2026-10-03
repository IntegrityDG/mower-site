import "server-only";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { PUBLIC_REVIEW_COLUMNS, toPublicReview } from "./public";

/** The same approved, public-only listing for initial HTML and filter requests. */
export async function readPublicReviews(params = new URLSearchParams()) {
  const page = Math.max(1, Number(params.get("page")) || 1);
  const limit = Math.min(24, Math.max(1, Number(params.get("limit")) || 9));
  const category = ["ease_rating", "speed_rating", "price_rating", "support_rating"].includes(params.get("category") ?? "") ? params.get("category")! : "overall_rating";
  const sort = params.get("sort") ?? "newest";
  const client = getSupabaseServiceClient();
  let query = client.from("customer_reviews").select(PUBLIC_REVIEW_COLUMNS, { count: "exact" }).eq("status", "approved");
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
  if (error) throw error;
  const { data: stateRows } = await client.from("customer_reviews").select("state").eq("status", "approved");
  return { reviews: (data ?? []).map((row) => toPublicReview(row)), count: count ?? 0, states: [...new Set((stateRows ?? []).map((row) => row.state as string))].sort(), page, hasMore: page * limit < (count ?? 0) };
}
