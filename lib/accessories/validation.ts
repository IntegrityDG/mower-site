import { ACCESSORY_AVAILABILITY_STATUSES, AFTERMARKET_DISCLAIMER, type AccessoryAction, type AccessoryAvailabilityStatus, type AccessoryTab } from "./types";

const text = (value: unknown, max: number, required = false) => {
  if (typeof value !== "string") return required ? null : "";
  const result = value.trim();
  return (!result && required) || result.length > max ? null : result;
};
export function safeImageUrl(value: unknown) {
  const url = text(value, 2000); if (url === null) return null; if (!url) return "";
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  try { const parsed = new URL(url); return ["https:", "http:"].includes(parsed.protocol) ? parsed.toString() : null; } catch { return null; }
}
export function safeActionUrl(value: unknown, external: boolean) {
  const url = safeImageUrl(value); if (url === null) return null;
  return external && url && !/^https?:/.test(url) ? null : url;
}
export function dollarsToCents(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const raw = String(value).trim(); if (!/^\d+(\.\d{1,2})?$/.test(raw)) return undefined;
  const [whole, decimal = ""] = raw.split("."); const cents = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : undefined;
}
export function validateSettings(input: unknown) {
  if (!input || typeof input !== "object") return null; const value = input as Record<string, unknown>;
  const result = {
    lymowEnabled: value.lymowEnabled === true, lymowLabel: text(value.lymowLabel, 50, true),
    yarboEnabled: value.yarboEnabled === true, yarboLabel: text(value.yarboLabel, 50, true),
    pandagEnabled: value.pandagEnabled === true, pandagLabel: text(value.pandagLabel, 50, true), pandagMessage: text(value.pandagMessage, 200, true),
    aftermarketEnabled: value.aftermarketEnabled === true, aftermarketLabel: text(value.aftermarketLabel, 50, true),
    featuredAftermarketEnabled: value.featuredAftermarketEnabled === true,
    featuredAftermarketImageUrl: safeImageUrl(value.featuredAftermarketImageUrl), featuredAftermarketImageAlt: text(value.featuredAftermarketImageAlt, 300),
    featuredAftermarketHeading: text(value.featuredAftermarketHeading, 200), featuredAftermarketDescription: text(value.featuredAftermarketDescription, 2000),
    featuredAftermarketIdsExclusive: value.featuredAftermarketIdsExclusive === true,
    aftermarketDisclaimer: text(value.aftermarketDisclaimer, 3000, true),
  };
  if (Object.values(result).some((item) => item === null)) return null;
  if (result.aftermarketEnabled && !result.aftermarketDisclaimer?.trim()) return null;
  if (result.aftermarketEnabled && result.featuredAftermarketEnabled && (!result.featuredAftermarketImageUrl || !result.featuredAftermarketHeading || !result.featuredAftermarketDescription)) return null;
  return { ...result, aftermarketDisclaimer: result.aftermarketDisclaimer || AFTERMARKET_DISCLAIMER };
}
export function validateItem(input: unknown) {
  if (!input || typeof input !== "object") return null; const value = input as Record<string, unknown>;
  const tab = value.tab as AccessoryTab; const actionType = value.actionType as AccessoryAction; const publicStatus = value.publicStatus as AccessoryAvailabilityStatus;
  if (!["lymow", "yarbo", "pandag", "aftermarket"].includes(tab) || !["builder", "contact", "external", "none"].includes(actionType) || !ACCESSORY_AVAILABILITY_STATUSES.includes(publicStatus)) return null;
  const regularPriceCents = dollarsToCents(value.regularPrice); const salePriceCents = dollarsToCents(value.salePrice);
  const actionUrl = safeActionUrl(value.actionUrl, actionType === "external" || tab === "aftermarket");
  const result = { tab, publicStatus, name: text(value.name, 160, true), description: text(value.description, 2000), imageUrl: safeImageUrl(value.imageUrl), imageAlt: text(value.imageAlt, 300), badge: text(value.badge, 80), manufacturer: text(value.manufacturer, 160), idsExclusive: value.idsExclusive === true, visible: value.visible === undefined ? publicStatus !== "hidden" : value.visible === true, isIncluded: value.isIncluded === true, isRecommended: value.isRecommended === true, showInBuilder: value.showInBuilder === true, sortOrder: Number(value.sortOrder), regularPriceCents, salePriceCents, promotionLabel: text(value.promotionLabel, 80), showPublicPrice: value.showPublicPrice === true, contactForPricing: value.contactForPricing === true, actionType, actionLabel: text(value.actionLabel, 80), actionUrl, priceText: text(value.priceText, 100), variantRelationships: validateVariantRelationships(value.variantRelationships), packageRelationships: validatePackageRelationships(value.packageRelationships) };
  if (!result.name || result.description === null || result.imageUrl === null || result.imageAlt === null || result.badge === null || result.manufacturer === null || result.promotionLabel === null || result.actionLabel === null || result.actionUrl === null || result.priceText === null || result.variantRelationships === undefined || result.packageRelationships === undefined || regularPriceCents === undefined || salePriceCents === undefined || !Number.isSafeInteger(result.sortOrder) || result.sortOrder < 0 || (salePriceCents !== null && (regularPriceCents === null || salePriceCents > regularPriceCents))) return null;
  if (result.publicStatus === "hidden") result.visible = false;
  if (tab === "pandag" && result.showInBuilder) return null;
  if ((tab === "pandag" || tab === "aftermarket") && result.actionType === "builder") return null;
  if (tab === "aftermarket") {
    result.actionLabel ||= "Go to Manufacturer's Site";
    if (result.showInBuilder && (result.contactForPricing || result.regularPriceCents === null)) return null;
  }
  if (result.actionType === "builder" && (!result.showInBuilder || result.contactForPricing || result.regularPriceCents === null)) return null;
  if (result.isIncluded && result.showInBuilder) return null;
  return result;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validateVariantRelationships(value: unknown) {
  if (value === undefined) return null;
  if (!Array.isArray(value) || value.length > 100) return undefined;
  const rows = value as { variantId?: unknown; relationshipType?: unknown }[];
  if (rows.some((row) => !row || typeof row.variantId !== "string" || !UUID.test(row.variantId) || !["compatible", "included", "required", "excluded"].includes(String(row.relationshipType)))) return undefined;
  if (new Set(rows.map((row) => row.variantId)).size !== rows.length) return undefined;
  return rows as { variantId: string; relationshipType: "compatible" | "included" | "required" | "excluded" }[];
}
function validatePackageRelationships(value: unknown) {
  if (value === undefined) return null;
  if (!Array.isArray(value) || value.length > 100) return undefined;
  const rows = value as { packageId?: unknown; quantity?: unknown; includedInPackagePrice?: unknown }[];
  if (rows.some((row) => !row || typeof row.packageId !== "string" || !UUID.test(row.packageId) || !Number.isSafeInteger(row.quantity) || Number(row.quantity) < 1 || Number(row.quantity) > 10 || typeof row.includedInPackagePrice !== "boolean")) return undefined;
  if (new Set(rows.map((row) => row.packageId)).size !== rows.length) return undefined;
  return rows as { packageId: string; quantity: number; includedInPackagePrice: boolean }[];
}
