import type { CatalogPackage, CatalogProduct } from "./types";

export const LYMOW_ENHANCED_DISCHARGE_KIT_SLUG = "lymow-one-plus-enhanced-discharge-kit";
export function lymowEnhancedPackageIdentity(slug: string) {
  if (slug === "lymow-one-plus-5a-enhanced-discharge") return { variantSlug: "lymow-one-plus-5a", chargerSlug: "lymow-5a-charger" };
  if (slug === "lymow-one-plus-10a-enhanced-discharge") return { variantSlug: "lymow-one-plus-10a", chargerSlug: "lymow-10a-charger" };
  return null;
}
export function isLymowEnhancedPackage(pkg: Pick<CatalogPackage, "slug">) {
  return lymowEnhancedPackageIdentity(pkg.slug) !== null;
}
/** Structural identity only: unavailable configurations remain visible as unavailable. */
export function lymowEnhancedPackageVariant(product: CatalogProduct, pkg: CatalogPackage) {
  const identity = lymowEnhancedPackageIdentity(pkg.slug);
  if (product.slug !== "lymow-one-plus" || !identity || pkg.items.length !== 2 || pkg.items.some(item => item.quantity !== 1 || !item.includedInPackagePrice)) return null;
  const variant = product.variants.find(row => row.slug === identity.variantSlug);
  if (!variant || !pkg.items.some(item => item.component?.kind === "variant" && item.component.id === variant.id && item.component.slug === identity.variantSlug)) return null;
  const options = [...product.ungroupedOptions, ...product.optionGroups.flatMap(group => group.options)];
  const kit = options.find(option => option.slug === LYMOW_ENHANCED_DISCHARGE_KIT_SLUG);
  if (!kit || !pkg.items.some(item => (item.component?.kind === "option" && item.component.id === kit.id && item.component.slug === kit.slug) || (!item.component && item.optionId === kit.id && item.option?.slug === kit.slug))) return null;
  const charger = options.find(option => option.slug === identity.chargerSlug);
  // Defining charger rows are intentionally omitted from the public catalog.
  // Verify identity when exposed; checkout always validates the authoritative row.
  if (variant.definingOptionIds.length !== 1 || (charger && variant.definingOptionIds[0] !== charger.id)) return null;
  return variant;
}
