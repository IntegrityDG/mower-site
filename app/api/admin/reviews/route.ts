import { NextRequest, NextResponse } from "next/server";
import { isReviewAdmin } from "@/lib/reviews/admin-auth";
import { getSupabaseServiceClient } from "@/lib/supabase";
const adminColumns = "id,first_name,last_name,last_initial,state,email,product,other_description,ease_rating,speed_rating,price_rating,support_rating,overall_rating,written_review,publishing_consent,contact_consent,status,submitted_at,published_at,moderated_at,ids_response,ids_response_at";
export async function GET(request: NextRequest) {
  if (!(await isReviewAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const status = request.nextUrl.searchParams.get("status");
  let query = getSupabaseServiceClient().from("customer_reviews").select(adminColumns).order("submitted_at", { ascending: false }).limit(200);
  if (status && status !== "all") query = query.eq("status", status);
  const { data, error } = await query;
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ reviews: data });
}
