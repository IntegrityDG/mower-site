import "server-only";

import { getSupabaseServiceClient } from "@/lib/supabase";

const SETTINGS_ID = "default";

export type PricingProgramSettings = {
  everydayLowPriceEnabled: boolean;
};

export async function readPricingProgramSettings(): Promise<PricingProgramSettings> {
  const { data, error } = await getSupabaseServiceClient()
    .schema("catalog_private")
    .from("catalog_pricing_settings")
    .select("everyday_low_price_enabled")
    .eq("id", SETTINGS_ID)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Pricing program settings are unavailable.");
  }

  return {
    everydayLowPriceEnabled: data.everyday_low_price_enabled !== false,
  };
}

export async function readPricingProgramSettingsFailSafe(): Promise<PricingProgramSettings> {
  try {
    return await readPricingProgramSettings();
  } catch {
    // Preserve today's pricing behavior if settings cannot be read.
    return { everydayLowPriceEnabled: true };
  }
}

export async function saveEverydayLowPriceEnabled(enabled: boolean) {
  const { data, error } = await getSupabaseServiceClient()
    .schema("catalog_private")
    .from("catalog_pricing_settings")
    .update({
      everyday_low_price_enabled: enabled,
      updated_at: new Date().toISOString(),
    })
    .eq("id", SETTINGS_ID)
    .select("everyday_low_price_enabled")
    .single();

  if (error || !data) {
    throw new Error("Pricing program setting could not be saved.");
  }

  return {
    everydayLowPriceEnabled: data.everyday_low_price_enabled !== false,
  };
}
