import { PRICING_KINDS, type PricingKind } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const common = ["display_msrp_price_cents", "regular_price_cents", "sale_price_cents", "sale_starts_at", "sale_ends_at", "promotion_label", "show_public_price", "contact_for_pricing"] as const;
const statusFields = [...common, "public_status"] as const;
const fields: Record<PricingKind, readonly string[]> = {
  products: statusFields,
  variants: statusFields,
  packages: statusFields,
  options: statusFields,
  services: statusFields,
  "service-payment-options": ["display_msrp_price_cents", "regular_price_cents", "sale_price_cents", "is_available"],
  "product-services": ["override_display_msrp_price_cents", "override_regular_price_cents", "override_sale_price_cents", "override_sale_starts_at", "override_sale_ends_at", "override_promotion_label", "override_show_public_price", "override_contact_for_pricing", "is_available"],
  schedules: ["schedule_name", "starts_at", "ends_at", "regular_price_cents", "sale_price_cents", "promotion_label", "show_public_price", "contact_for_pricing", "public_status"],
};
const priceFields = new Set(["display_msrp_price_cents", "regular_price_cents", "sale_price_cents", "override_display_msrp_price_cents", "override_regular_price_cents", "override_sale_price_cents"]);
const dateFields = new Set(["sale_starts_at", "sale_ends_at", "override_sale_starts_at", "override_sale_ends_at", "starts_at", "ends_at"]);
const booleanFields = new Set(["show_public_price", "contact_for_pricing", "override_show_public_price", "override_contact_for_pricing", "is_available"]);
const stringFields = new Set(["promotion_label", "override_promotion_label", "schedule_name"]);
const statuses = new Set(["active", "unavailable", "coming_soon", "hidden"]);

export function isPricingKind(value: string): value is PricingKind { return (PRICING_KINDS as readonly string[]).includes(value); }
export function isUuid(value: string) { return UUID.test(value); }

export type PricingPatchResult = { ok: true; value: Record<string, unknown> } | { ok: false; error: string };

export function validatePricingDateWindow(kind: PricingKind, values: Record<string, unknown>): string | null {
  const startKey = kind === "product-services" ? "override_sale_starts_at" : kind === "schedules" ? "starts_at" : "sale_starts_at";
  const endKey = kind === "product-services" ? "override_sale_ends_at" : kind === "schedules" ? "ends_at" : "sale_ends_at";
  const start = values[startKey]; const end = values[endKey];
  if (kind === "schedules" && (typeof start !== "string" || Number.isNaN(new Date(start).getTime()))) return "starts_at is required and must be a valid date.";
  if (typeof start === "string" && typeof end === "string" && new Date(start) >= new Date(end)) return kind === "schedules" ? "Schedule start must be before schedule end." : "Sale start must be before sale end.";
  return null;
}

export function validatePricingPatch(kind: PricingKind, input: unknown): PricingPatchResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "A JSON object is required." };
  const body = input as Record<string, unknown>;
  const allowed = new Set(fields[kind]);
  if (!Object.keys(body).length) return { ok: false, error: "At least one pricing field is required." };
  const unknown = Object.keys(body).find((key) => !allowed.has(key));
  if (unknown) return { ok: false, error: `Unknown property: ${unknown}.` };
  const value: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(body)) {
    if (priceFields.has(key)) {
      if (raw === null) value[key] = null;
      else if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < 0) return { ok: false, error: `${key} must be null or a non-negative integer number of cents.` };
      else value[key] = raw;
    } else if (dateFields.has(key)) {
      if (kind === "schedules" && key === "starts_at" && (raw === null || raw === "")) return { ok: false, error: "starts_at is required and must be a valid date." };
      if (raw === null || raw === "") value[key] = null;
      else if (typeof raw !== "string" || Number.isNaN(new Date(raw).getTime())) return { ok: false, error: `${key} must be a valid date.` };
      else value[key] = new Date(raw).toISOString();
    } else if (booleanFields.has(key)) {
      if (raw === null && key.startsWith("override_")) value[key] = null;
      else if (typeof raw !== "boolean") return { ok: false, error: `${key} must be boolean${key.startsWith("override_") ? " or null" : ""}.` };
      else value[key] = raw;
    } else if (stringFields.has(key)) {
      if ((raw === null || raw === "") && key !== "schedule_name") value[key] = null;
      else if (typeof raw !== "string" || !raw.trim() || raw.trim().length > 160) return { ok: false, error: `${key} must be 1 to 160 characters.` };
      else value[key] = raw.trim();
    } else if (key === "public_status") {
      if (typeof raw !== "string" || !statuses.has(raw)) return { ok: false, error: "public_status is invalid." };
      value[key] = raw;
    }
  }
  const dateError = validatePricingDateWindow(kind, value);
  if (dateError && (kind === "schedules" ? "starts_at" in value || "ends_at" in value : true)) return { ok: false, error: dateError };
  return { ok: true, value };
}

export const editablePricingFields = fields;
