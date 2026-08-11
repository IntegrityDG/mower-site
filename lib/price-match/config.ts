export const PRICE_MATCH_HEADING_MAX = 250;
export const PRICE_MATCH_DESCRIPTION_MAX = 1500;
export const PRICE_MATCH_BUTTON_LABEL_MAX = 60;

export type PriceMatchConfig = {
  enabled: boolean;
  heading: string;
  description: string;
  buttonLabel: string;
};

export const DEFAULT_PRICE_MATCH: PriceMatchConfig = {
  enabled: true,
  heading: "We’ll Do Our Absolute Best To Meet or Beat Any Verified Competitor Price",
  description: "Found a better price? Send us the competitor’s current advertised price and give us the opportunity to save you even more.",
  buttonLabel: "Contact Us",
};

export function validatePriceMatch(value: unknown): { ok: true; value: PriceMatchConfig } | { ok: false; error: string } {
  if (!value || typeof value !== "object") return { ok: false, error: "Invalid Meet or Beat settings." };
  const input = value as Record<string, unknown>;
  const fields = [
    ["heading", PRICE_MATCH_HEADING_MAX],
    ["description", PRICE_MATCH_DESCRIPTION_MAX],
    ["buttonLabel", PRICE_MATCH_BUTTON_LABEL_MAX],
  ] as const;
  if (typeof input.enabled !== "boolean") return { ok: false, error: "Enabled must be true or false." };
  for (const [field, maximum] of fields) {
    if (typeof input[field] !== "string" || !input[field].trim() || input[field].length > maximum) return { ok: false, error: `${field} is required and must be ${maximum} characters or fewer.` };
  }
  return { ok: true, value: { enabled: input.enabled, heading: (input.heading as string).trim(), description: (input.description as string).trim(), buttonLabel: (input.buttonLabel as string).trim() } };
}

export function toPriceMatchConfig(row: Record<string, unknown>): PriceMatchConfig | null {
  const result = validatePriceMatch({ enabled: row.enabled, heading: row.heading, description: row.description, buttonLabel: row.button_label });
  return result.ok ? result.value : null;
}
