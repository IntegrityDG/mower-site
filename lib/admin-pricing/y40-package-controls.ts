import type { PricingItem } from "./types";
import { editablePricingFields } from "./validation";

export const Y40_RELATIONSHIP_VISIBILITY_FIELDS = [
  "core_show_public_price", "core_contact_for_pricing",
] as const;

export function hasY40PackageRelationship(item: PricingItem) {
  return item.kind === "packages" && item.productSlug === "yarbo" &&
    item.values.core_selectable === true && Boolean(item.coreAvailabilityUpdatedAt);
}

export function pricingEditorFields(item: PricingItem) {
  const fields = editablePricingFields[item.kind].filter(field =>
    !item.coreAvailabilityUpdatedAt || (field !== "name" && field !== "package_name"));
  return hasY40PackageRelationship(item) ? [...fields, ...Y40_RELATIONSHIP_VISIBILITY_FIELDS] : fields;
}
