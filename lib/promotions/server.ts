import "server-only";

import { getSupabaseServiceClient } from "@/lib/supabase";
import { SALES_SPECIALS_COLUMNS, toPublicSalesSpecials } from "./public";
import type { SalesSpecialsConfig } from "./config";

const SINGLETON_ID = "homepage";

export async function readSalesSpecials(): Promise<SalesSpecialsConfig | null> {
  const { data, error } = await getSupabaseServiceClient()
    .from("homepage_sales_specials")
    .select(SALES_SPECIALS_COLUMNS)
    .eq("id", SINGLETON_ID)
    .maybeSingle();
  if (error || !data) return null;
  return toPublicSalesSpecials(data);
}

export async function saveSalesSpecials(config: SalesSpecialsConfig) {
  const { error } = await getSupabaseServiceClient()
    .from("homepage_sales_specials")
    .upsert({
      id: SINGLETON_ID,
      enabled: config.enabled,
      cartoon_key: config.cartoonKey,
      headline: config.headline,
      description: config.description,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
  if (error) throw new Error("Sales & Specials settings could not be saved.");
  return config;
}
