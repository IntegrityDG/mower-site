import "server-only";

import { getSupabaseServiceClient } from "@/lib/supabase";
import { DEFAULT_TICKER_CONFIG, toPublicTickerSnapshot, validateTickerConfig, type TickerConfig, type TickerRecord } from "./ticker";

export async function readAdminSalesTicker(): Promise<TickerRecord | null> {
  const { data, error } = await getSupabaseServiceClient()
    .from("homepage_sales_specials")
    .select("ticker,ticker_revision")
    .eq("id", "homepage")
    .maybeSingle();
  if (error || !data) return null;
  const parsed = validateTickerConfig(data.ticker);
  if (!parsed.ok || !Number.isSafeInteger(data.ticker_revision) || data.ticker_revision < 0) return null;
  return { ticker: parsed.value, revision: data.ticker_revision };
}

export async function readPublicSalesTicker(now?: Date) {
  try {
    const record = await readAdminSalesTicker();
    return toPublicTickerSnapshot(record?.ticker ?? DEFAULT_TICKER_CONFIG, now ?? new Date());
  } catch {
    return toPublicTickerSnapshot(DEFAULT_TICKER_CONFIG, now ?? new Date());
  }
}

export async function saveSalesTicker(ticker: TickerConfig, revision: number): Promise<TickerRecord | null> {
  // The database function atomically saves sequence + settings and advances the
  // revision, attributing the edit to the existing shared Administrator actor.
  const { data, error } = await getSupabaseServiceClient().rpc("save_homepage_sales_ticker", { p_ticker: ticker, p_revision: revision });
  if (error) throw new Error("Homepage Sales Ticker settings could not be saved.");
  if (!data) return null;
  const parsed = validateTickerConfig(data.ticker);
  if (!parsed.ok || !Number.isSafeInteger(data.revision)) throw new Error("Saved ticker settings are invalid.");
  return { ticker: parsed.value, revision: data.revision };
}
