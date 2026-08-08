import { isSalesSpecialsCartoonKey, type SalesSpecialsConfig } from "./config";

export const SALES_SPECIALS_COLUMNS = "enabled,cartoon_key,headline,description";

export function toPublicSalesSpecials(row: Record<string, unknown>): SalesSpecialsConfig | null {
  const candidate = {
    enabled: row.enabled,
    cartoonKey: row.cartoon_key,
    headline: row.headline,
    description: row.description,
  };
  if (
    typeof candidate.enabled !== "boolean" ||
    !isSalesSpecialsCartoonKey(candidate.cartoonKey) ||
    typeof candidate.headline !== "string" ||
    !candidate.headline.trim() ||
    typeof candidate.description !== "string" ||
    !candidate.description.trim()
  ) return null;
  return {
    enabled: candidate.enabled,
    cartoonKey: candidate.cartoonKey,
    headline: candidate.headline.trim(),
    description: candidate.description.trim(),
  };
}
