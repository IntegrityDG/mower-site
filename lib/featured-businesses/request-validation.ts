import { derivePhoneAreaCode, isCountyForState, isStateCode, normalizeServiceAreas, type ServiceArea } from "./location";
import type { FeaturedBusinessRequestInput } from "./request-types";

const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max + 1) : "";
const optional = (value: unknown, max: number) => clean(value, max) || null;
function url(value: unknown, facebook = false) {
  const raw = clean(value, 2000); if (!raw) return null;
  try { const parsed = new URL(raw); if (!["http:", "https:"].includes(parsed.protocol)) return null; if (facebook && !/(^|\.)facebook\.com$/i.test(parsed.hostname)) return null; return parsed.toString(); } catch { return null; }
}
function parseAreas(value: unknown): ServiceArea[] {
  const raw = typeof value === "string" ? JSON.parse(value) : value;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is Record<string, unknown> => !!item && typeof item === "object").map((item) => ({ stateCode: clean(item.stateCode, 2).toUpperCase(), countyName: optional(item.countyName, 120), statewide: item.statewide === true }));
}

export function validateFeaturedBusinessRequest(input: unknown, admin = false): { ok: true; value: FeaturedBusinessRequestInput } | { ok: false; errors: Record<string, string> } {
  const body = (input && typeof input === "object" ? input : {}) as Record<string, unknown>; const errors: Record<string, string> = {};
  const businessState = clean(body.businessState, 2).toUpperCase(), businessCounty = clean(body.businessCounty, 120);
  let areas: ServiceArea[] = []; try { areas = normalizeServiceAreas(parseAreas(body.serviceAreas), { stateCode: businessState, countyName: businessCounty }); } catch { errors.serviceAreas = "Service areas are invalid."; }
  const email = clean(body.contactEmail, 254).toLowerCase(), websiteUrl = url(body.websiteUrl), facebookUrl = url(body.facebookUrl, true), phone = optional(body.phone, 80);
  const value: FeaturedBusinessRequestInput = { contactName: clean(body.contactName, 120), contactEmail: email, businessName: clean(body.businessName, 160), description: clean(body.description, 3000), businessCity: optional(body.businessCity, 120), businessState, businessCounty, postalCode: optional(body.postalCode, 20), operatingRegion: optional(body.operatingRegion, 200), phone, phoneAreaCode: derivePhoneAreaCode(phone), address: optional(body.address, 500), websiteUrl, facebookUrl, specialOffer: optional(body.specialOffer, 1000), additionalNotes: optional(body.additionalNotes, 2000), adminNotes: admin ? optional(body.adminNotes, 2000) : null, consentConfirmed: body.consentConfirmed === true || body.consentConfirmed === "true" ? true : false as never, serviceAreas: areas };
  if (!value.contactName || value.contactName.length > 120) errors.contactName = "Contact name is required and must be 120 characters or fewer.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.contactEmail = "Enter a valid contact email.";
  if (!value.businessName || value.businessName.length > 160) errors.businessName = "Business name is required and must be 160 characters or fewer.";
  if (!value.description || value.description.length > 3000) errors.description = "Services description is required and must be 3,000 characters or fewer.";
  if (!isStateCode(businessState)) errors.businessState = "Select a valid state.";
  if (!isCountyForState(businessState, businessCounty)) errors.businessCounty = "Select a valid county or county-equivalent.";
  if (!areas.length) errors.serviceAreas = "Add at least one valid service area.";
  if (body.websiteUrl && !websiteUrl) errors.websiteUrl = "Enter a valid HTTP or HTTPS website URL.";
  if (body.facebookUrl && !facebookUrl) errors.facebookUrl = "Enter a valid Facebook URL.";
  if (!value.consentConfirmed) errors.consentConfirmed = "Publication consent is required.";
  const forbidden = ["referralCode","isPublic","isFeatured","isArchived","sortOrder","imagePath","imageUrl","status","approvedBusinessId","phoneAreaCode"];
  if (!admin && forbidden.some((key) => Object.hasOwn(body, key))) errors.form = "The submission contains unsupported fields.";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}
