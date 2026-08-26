import type { FeaturedBusinessInput } from "./types";
import { derivePhoneAreaCode, isCountyForState, isStateCode, normalizeServiceAreas } from "./location";

const text = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max + 1) : "";
function externalUrl(value: unknown) {
  const raw = text(value, 2000);
  if (!raw) return null;
  try { const url = new URL(raw); return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null; } catch { return null; }
}

export function validateFeaturedBusiness(input: unknown): { ok: true; value: FeaturedBusinessInput } | { ok: false; errors: Record<string, string> } {
  const body = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const errors: Record<string, string> = {};
  const websiteUrl = externalUrl(body.websiteUrl), facebookUrl = externalUrl(body.facebookUrl);
  const value: FeaturedBusinessInput = {
    businessName: text(body.businessName, 160), description: text(body.description, 3000), operatingRegion: text(body.operatingRegion, 200) || null,
    imageUrl: externalUrl(body.imageUrl), imagePath: text(body.imagePath, 500) || null, imageAlt: text(body.imageAlt, 240) || null,
    websiteUrl, facebookUrl, phone: text(body.phone, 80) || null, address: text(body.address, 500) || null,
    businessCity:text(body.businessCity,120)||null,businessState:text(body.businessState,2).toUpperCase()||null,businessCounty:text(body.businessCounty,120)||null,postalCode:text(body.postalCode,20)||null,phoneAreaCode:null,
    serviceAreas:normalizeServiceAreas(Array.isArray(body.serviceAreas)?body.serviceAreas.map((area)=>{const item=(area&&typeof area==="object"?area:{}) as Record<string,unknown>;return{stateCode:text(item.stateCode,2).toUpperCase(),countyName:text(item.countyName,120)||null,statewide:item.statewide===true}}):[]),
    referralCode: text(body.referralCode, 100) || null, specialOffer: text(body.specialOffer, 1000) || null,
    isPublic: body.isPublic === true, isFeatured: body.isFeatured === true, isArchived: body.isArchived === true,
    sortOrder: Number.isInteger(Number(body.sortOrder)) ? Number(body.sortOrder) : 100,
  };
  if (!value.businessName || value.businessName.length > 160) errors.businessName = "Business name is required and must be 160 characters or fewer.";
  if (!value.description || value.description.length > 3000) errors.description = "Services description is required and must be 3,000 characters or fewer.";
  if (body.websiteUrl && !websiteUrl) errors.websiteUrl = "Enter a valid HTTP or HTTPS website URL.";
  if (body.facebookUrl && !facebookUrl) errors.facebookUrl = "Enter a valid HTTP or HTTPS Facebook URL.";
  if (value.imagePath && !/^businesses\/[0-9a-f-]+\/[0-9a-f-]+\.(jpg|png|webp)$/.test(value.imagePath)) errors.imagePath = "Image path is invalid.";
  if (value.sortOrder < 0 || value.sortOrder > 100000) errors.sortOrder = "Sort order must be between 0 and 100,000.";
  value.phoneAreaCode=derivePhoneAreaCode(value.phone);
  if(value.businessState&&!isStateCode(value.businessState))errors.businessState="Select a valid state.";
  if(value.businessState&&value.businessCounty&&!isCountyForState(value.businessState,value.businessCounty))errors.businessCounty="Select a valid county or county-equivalent.";
  if(!value.businessState&&value.businessCounty)errors.businessState="A state is required when a county is supplied.";
  if ((value.isArchived || !value.isPublic) && value.isFeatured) errors.isFeatured = "A hidden or archived business cannot be featured.";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

export function phoneHref(phone: string) { return `tel:${phone.replace(/[^\d+]/g, "")}`; }
export function addressHref(address: string) { return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`; }
export const FEATURED_BUSINESS_IMAGE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
export const FEATURED_BUSINESS_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
