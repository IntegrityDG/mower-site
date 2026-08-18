import "server-only";

import {
  getSupabaseServiceClient,
} from "@/lib/supabase";

import type {
  PublicPromotionRecord,
} from "@/lib/catalog/public-price-promotion";


export async function readPublicPromotionRecordsFailSafe(): Promise<
  PublicPromotionRecord[]
> {
  const { data, error } =
    await getSupabaseServiceClient()
      .schema("catalog_private")
      .from("catalog_price_messages")
      .select(
        "product_id,variant_id,option_id,package_id,price_schedule_id,price_context,message,image_path,is_public",
      )
      .eq("is_public", true);

  if (error) {
    console.error(
      "Public pricing promotions unavailable:",
      error.message,
    );

    return [];
  }

  return (
    data ?? []
  ) as PublicPromotionRecord[];
}
