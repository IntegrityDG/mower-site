import "server-only";

import { getSupabaseServiceClient } from "@/lib/supabase";
import { SALES_SPECIALS_COLUMNS, toPublicSalesSpecials } from "./public";
import {
  DEFAULT_SALES_SPECIALS,
  type SalesSpecialsConfig,
  type SalesSpecialsSlot,
  type SalesSpecialsSlots,
} from "./config";

export const SALES_SPECIALS_SLOT_IDS: Record<SalesSpecialsSlot, string> = {
  primary: "homepage",
  secondary: "homepage-secondary",
};

export async function readSalesSpecialsSlots(): Promise<SalesSpecialsSlots | null> {
  const { data, error } = await getSupabaseServiceClient()
    .from("homepage_sales_specials")
    .select(`id,${SALES_SPECIALS_COLUMNS}`)
    .in("id", [SALES_SPECIALS_SLOT_IDS.primary, SALES_SPECIALS_SLOT_IDS.secondary]);
  if (error || !data) return null;
  const byId = new Map(data.map((row) => [row.id, toPublicSalesSpecials(row)]));
  return {
    primary: byId.get(SALES_SPECIALS_SLOT_IDS.primary) ?? { ...DEFAULT_SALES_SPECIALS },
    secondary: byId.get(SALES_SPECIALS_SLOT_IDS.secondary) ?? { ...DEFAULT_SALES_SPECIALS },
  };
}

export async function saveSalesSpecial(slot: SalesSpecialsSlot, config: SalesSpecialsConfig) {
  const { error } = await getSupabaseServiceClient()
    .from("homepage_sales_specials")
    .upsert({
      id: SALES_SPECIALS_SLOT_IDS[slot],
      enabled: config.enabled,
      cartoon_key: config.cartoonKey,
      headline: config.headline,
      description: config.description,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
  if (error) throw new Error("Sales & Specials settings could not be saved.");
  return config;
}
