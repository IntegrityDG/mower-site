import type { ExtractedValue, SourceTarget } from "./types";

export const PANDAG_PARENT_ID = "6364d86a-d5e5-4f17-8849-cea66cb6ff0c";
export const PANDAG_VARIANT_IDS = {
  m1500_sd: "17be81bd-cf7b-424a-a57e-95423e7a10db",
  m1500_rd: "9fcc8558-576b-4df7-93bd-12ceff29dcb2",
  pro_m3000: "7dd2ce98-59a7-4a0d-b912-8d4916efa415",
} as const;

export type PandagScope = "platform" | keyof typeof PANDAG_VARIANT_IDS;

export const PANDAG_PROTECTED_SPECIFICATION_FIELDS = [
  "recommended_applications",
  "discharge_type",
  "blade_type",
  "rated_power",
  "cutting_deck_power",
  "cutting_motor_configuration",
  "maximum_runtime",
  "mowable_acreage_per_day",
  "maximum_speed",
  "maximum_climbing_slope",
  "grade_equivalent",
  "battery_chemistry",
  "battery_capacity",
  "suggested_cutting_height",
  "minimum_cutting_height",
  "maximum_cutting_height",
  "weight",
] as const;

export const PANDAG_PROTECTED_FIELDS = new Set<string>([
  "id", "product_id", "variant_id", "slug", "variant_slug", "name", "brand", "sort_order",
  "regular_price_cents", "sale_price_cents", "current_price", "price", "msrp",
  "show_public_price", "contact_for_pricing", "promotion_label", "sale_starts_at", "sale_ends_at",
  "sales_mode", "checkout_eligibility", "financing", "hearth", "stripe", "ids_price",
  "dealer_cost", "dealer_cost_cents", "distributor_cost", "distributor_cost_cents",
  "internal_project_price", "internal_price_cents", "margin", "target_margin_basis_points",
  ...PANDAG_PROTECTED_SPECIFICATION_FIELDS,
]);

export const PANDAG_ALLOWED_REVIEW_FIELDS = new Set<string>([
  "short_description",
  "navigation_system",
  "obstacle_detection",
  "drive_system",
  "warranty",
  "official_image_url",
  "official_document_url",
]);

const modelPatterns: Record<Exclude<PandagScope, "platform">, RegExp> = {
  m1500_sd: /\b(?:m1500\s*sd|side\s+discharge)\b/i,
  m1500_rd: /\b(?:m1500\s*rd|rear\s+discharge)\b/i,
  pro_m3000: /\b(?:g1\s+pro\s+m3000|pro\s+m3000|m3000)\b/i,
};

function configuredScope(source: SourceTarget): PandagScope | null {
  const value = source.fields_to_monitor.model_scope;
  return value === "platform" || value === "m1500_sd" || value === "m1500_rd" || value === "pro_m3000"
    ? value
    : null;
}

export function validatePandagSourceTarget(source: SourceTarget): PandagScope {
  if (source.source_brand?.trim().toLowerCase() !== "pandag") throw new Error("Pandag policy received a non-Pandag source.");
  const scope = configuredScope(source);
  if (!scope) throw new Error("Pandag source is missing an explicit model_scope.");
  if (source.manual_only !== true || source.allow_automated_fetch !== false) {
    throw new Error("Pandag sources must remain manual-only with automated fetch disabled.");
  }
  if (scope === "platform") {
    if (source.target_type !== "product" || source.product_id !== PANDAG_PARENT_ID || source.variant_id !== null) {
      throw new Error("Pandag platform scope must target only the approved parent product.");
    }
  } else if (
    source.target_type !== "variant" ||
    source.variant_id !== PANDAG_VARIANT_IDS[scope] ||
    source.product_id !== null
  ) {
    throw new Error(`Pandag ${scope} scope does not match its approved variant.`);
  }
  return scope;
}

function containsMixedModels(value: string) {
  return /\bm1500\s*sd\s*(?:\/|&|and)\s*(?:m1500\s*)?rd\b/i.test(value)
    || Object.values(modelPatterns).filter((pattern) => pattern.test(value)).length > 1;
}

function containsUnsafeNoise(value: string) {
  return /<\/?(?:script|style|div|span|html)\b|\\{2,}["']|(?:children|verticalAlign|lineHeight)\\?"?\s*:|(?:home|products|explore|blog|get in touch)\s+(?:home|products|explore|blog|get in touch)|\b(?:lymow|yarbo)\b/i.test(value);
}

function hasIncompatibleUnits(value: string) {
  const unitGroups = [
    /\b(?:kg|kilograms?|lb|pounds?)\b/gi,
    /\b(?:kwh|wh|ah)\b/gi,
    /\b(?:hours?|minutes?)\b/gi,
    /(?:°|\bdegrees?\b|%)/gi,
  ];
  return unitGroups.filter((pattern) => pattern.test(value)).length > 1;
}

export function validatePandagCandidate(
  source: SourceTarget,
  candidate: ExtractedValue
): { accepted: boolean; reason: string; value?: ExtractedValue } {
  let scope: PandagScope;
  try {
    scope = validatePandagSourceTarget(source);
  } catch (error) {
    return { accepted: false, reason: error instanceof Error ? error.message : String(error) };
  }
  if (PANDAG_PROTECTED_FIELDS.has(candidate.field)) return { accepted: false, reason: `Protected Pandag field: ${candidate.field}.` };
  if (!PANDAG_ALLOWED_REVIEW_FIELDS.has(candidate.field)) return { accepted: false, reason: `Field is not allowed for Pandag review: ${candidate.field}.` };
  const cleanValue = candidate.value.replace(/\s+/g, " ").trim();
  if (!cleanValue || cleanValue.length > 500) return { accepted: false, reason: "Candidate is empty or exceeds 500 characters." };
  if (containsUnsafeNoise(cleanValue)) return { accepted: false, reason: "Candidate contains page-layout, HTML, script, or escaped JSON noise." };
  if (containsMixedModels(cleanValue)) return { accepted: false, reason: "Candidate mixes more than one Pandag model." };
  if (hasIncompatibleUnits(cleanValue)) return { accepted: false, reason: "Candidate contains multiple incompatible unit groups." };
  if (scope === "platform" && Object.values(modelPatterns).some((pattern) => pattern.test(cleanValue))) {
    return { accepted: false, reason: "Platform candidate contains model-specific content." };
  }
  if (scope !== "platform" && !modelPatterns[scope].test(cleanValue)) {
    return { accepted: false, reason: `Candidate lacks the required ${scope} model marker.` };
  }
  return {
    accepted: true,
    reason: "Pandag candidate passed protected-field, scope, and content validation.",
    value: {
      ...candidate,
      value: cleanValue,
      sourceTargetId: source.id,
      sourceUrl: source.source_url ?? "",
      modelScope: scope,
      evidence: cleanValue.slice(0, 240),
      notes: `${candidate.notes} Source: ${source.source_url}; scope: ${scope}; evidence: ${cleanValue.slice(0, 160)}`,
    },
  };
}

export function isPandagSuggestionAllowed(source: SourceTarget, candidate: ExtractedValue) {
  return validatePandagCandidate(source, candidate).accepted;
}
