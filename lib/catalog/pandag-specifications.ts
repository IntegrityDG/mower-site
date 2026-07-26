import type { CatalogSpecification, CatalogVariant } from "./types";

export const PANDAG_REQUIRED_SPECIFICATION_SLUGS = [
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

export function pandagSpecification(
  variant: CatalogVariant,
  slug: string
): CatalogSpecification | undefined {
  return variant.specifications
    ? Object.values(variant.specifications).flat().find((item) => item.slug === slug)
    : undefined;
}

export function pandagSpecificationDisplay(
  variant: CatalogVariant,
  slug: string
) {
  const specification = pandagSpecification(variant, slug);
  if (!specification) return "Not published";
  if (specification.displayValue) return specification.displayValue;
  if (specification.textValue) return specification.textValue;
  if (specification.textValues) return specification.textValues.join(", ");
  if (specification.numericValue !== null) {
    return `${specification.numericValue}${specification.canonicalUnit ? ` ${specification.canonicalUnit}` : ""}`;
  }
  if (specification.booleanValue !== null) {
    return specification.booleanValue ? "Yes" : "No";
  }
  return "Not published";
}

export function pandagApplications(variant: CatalogVariant) {
  return pandagSpecification(variant, "recommended_applications")?.textValues ?? [];
}

export function hasCompletePandagSpecifications(variant: CatalogVariant) {
  return PANDAG_REQUIRED_SPECIFICATION_SLUGS.every((slug) =>
    Boolean(pandagSpecification(variant, slug))
  );
}
