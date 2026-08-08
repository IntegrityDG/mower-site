import {
  SALES_SPECIALS_DESCRIPTION_MAX,
  SALES_SPECIALS_HEADLINE_MAX,
  isSalesSpecialsCartoonKey,
  type SalesSpecialsConfig,
} from "./config";

export type SalesSpecialsValidation =
  | { ok: true; value: SalesSpecialsConfig }
  | { ok: false; errors: Record<string, string> };

export function validateSalesSpecials(value: unknown): SalesSpecialsValidation {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const errors: Record<string, string> = {};
  const headline = typeof input.headline === "string" ? input.headline.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";

  if (typeof input.enabled !== "boolean") errors.enabled = "Visibility must be enabled or disabled.";
  if (!isSalesSpecialsCartoonKey(input.cartoonKey)) errors.cartoonKey = "Choose an approved product cartoon.";
  if (!headline) errors.headline = "Headline is required.";
  else if (headline.length > SALES_SPECIALS_HEADLINE_MAX) errors.headline = `Headline must be ${SALES_SPECIALS_HEADLINE_MAX} characters or fewer.`;
  if (!description) errors.description = "Description is required.";
  else if (description.length > SALES_SPECIALS_DESCRIPTION_MAX) errors.description = `Description must be ${SALES_SPECIALS_DESCRIPTION_MAX} characters or fewer.`;

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      enabled: input.enabled as boolean,
      cartoonKey: input.cartoonKey as SalesSpecialsConfig["cartoonKey"],
      headline,
      description,
    },
  };
}
