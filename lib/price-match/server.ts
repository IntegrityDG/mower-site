import "server-only";

import { getSupabaseServiceClient } from "@/lib/supabase";
import { DEFAULT_PRICE_MATCH, toPriceMatchConfig, type PriceMatchConfig } from "./config";

const ID = "price-match";
const COLUMNS = "enabled,heading,description,button_label";

export async function readPriceMatch(): Promise<PriceMatchConfig | null> {
  const { data, error } = await getSupabaseServiceClient().from("homepage_price_match_settings").select(COLUMNS).eq("id", ID).maybeSingle();
  if (error || !data) return null;
  return toPriceMatchConfig(data);
}

export async function readPublicPriceMatch(): Promise<PriceMatchConfig> {
  try { return (await readPriceMatch()) ?? DEFAULT_PRICE_MATCH; } catch { return DEFAULT_PRICE_MATCH; }
}

export async function savePriceMatch(config: PriceMatchConfig): Promise<PriceMatchConfig> {
  const { error } = await getSupabaseServiceClient().from("homepage_price_match_settings").upsert({ id: ID, enabled: config.enabled, heading: config.heading, description: config.description, button_label: config.buttonLabel, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) throw new Error("Meet or Beat settings could not be saved.");
  return config;
}
