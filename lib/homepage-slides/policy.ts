import { chicagoInputToIso } from "@/lib/promotions/ticker-editor";
import { isWithinPriceWindow } from "@/lib/pricing-program/window";
import type { HomepageSlideInput } from "./types";
export const HOMEPAGE_SLIDE_BUCKET = "homepage-slide-images";
export const HOMEPAGE_SLIDE_MAX_BYTES = 10 * 1024 * 1024;
export const HOMEPAGE_SLIDE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
export const isSlideId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
export function safeSlideLink(value: string) {
  if (!value.startsWith("/") || value.startsWith("//") || /[\\\s\u0000-\u001f\u007f]/.test(value)) return false;
  try { const decoded = decodeURIComponent(value); return !decoded.startsWith("//") && !/[\\\s\u0000-\u001f\u007f]/.test(decoded) && new URL(value, "https://integrityautomowers.com").origin === "https://integrityautomowers.com"; } catch { return false; }
}
export function slideSchedule(startDate: string, endDate: string) {
  if (![startDate, endDate].every(date => /^\d{4}-\d{2}-\d{2}$/.test(date))) throw new Error("Choose valid start and stop dates.");
  const startsAt = chicagoInputToIso(`${startDate}T00:01`)!;
  const endsAt = chicagoInputToIso(`${endDate}T23:59`)!;
  if (Date.parse(endsAt) <= Date.parse(startsAt)) throw new Error("Stop date cannot be before start date.");
  return { startsAt, endsAt };
}
export function slideIsActive(row: { enabled: boolean; image_path: string | null; starts_at: string; ends_at: string }, now = Date.now()) {
  return row.enabled && Boolean(row.image_path) && Number.isFinite(Date.parse(row.starts_at)) && Number.isFinite(Date.parse(row.ends_at)) && isWithinPriceWindow({ startsAt: row.starts_at, endsAt: row.ends_at }, now);
}
export function validateSlideInput(body: unknown): HomepageSlideInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid slide details.");
  const value = body as Record<string, unknown>;
  if (Object.keys(value).some(key => !["title", "altText", "buttonLabel", "buttonHref", "startDate", "endDate", "sortOrder", "enabled", "dwellSeconds"].includes(key))) throw new Error("Unknown slide field.");
  const text = (key: string, max: number, required = false) => { const raw = value[key]; if (raw !== null && raw !== undefined && typeof raw !== "string") throw new Error(`Invalid ${key}.`); const result = typeof raw === "string" ? raw.trim() : ""; if (result.length > max || (required && !result)) throw new Error(`Enter ${key} (${max} characters or fewer).`); return result; };
  const title = text("title", 120, true), altText = text("altText", 500, true);
  const buttonLabel = text("buttonLabel", 80) || null, buttonHref = text("buttonHref", 1000) || null;
  if (Boolean(buttonLabel) !== Boolean(buttonHref) || (buttonHref && !safeSlideLink(buttonHref))) throw new Error("Add both a button label and an internal site destination, or leave both blank.");
  const startDate = text("startDate", 10, true), endDate = text("endDate", 10, true); slideSchedule(startDate, endDate);
  if (typeof value.enabled !== "boolean" || !Number.isSafeInteger(value.sortOrder) || Number(value.sortOrder) < 0 || Number(value.sortOrder) > 100000) throw new Error("Invalid visibility or display order.");
  if (!Number.isInteger(value.dwellSeconds) || Number(value.dwellSeconds) < 4 || Number(value.dwellSeconds) > 30) throw new Error("Seconds on screen must be a whole number from 4 to 30.");
  return { dwellSeconds: Number(value.dwellSeconds), title, altText, buttonLabel, buttonHref, startDate, endDate, enabled: value.enabled, sortOrder: Number(value.sortOrder) };
}
export function validSlideUploadPath(id: string, path: string) {
  return isSlideId(id) && new RegExp(`^uploads/${id}/[0-9a-f-]{36}\\.(jpg|png|webp)$`).test(path);
}
