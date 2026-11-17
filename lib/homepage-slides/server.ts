import "server-only";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { slideIsActive, slideSchedule } from "./policy";
import type { AdminHomepageSlide, HomepageSlideInput, PublicHomepageSlide, PublicHomepageSlideSnapshot } from "./types";
export type SlideRow = { id: string; title: string; alt_text: string; button_label: string | null; button_href: string | null; start_date: string; end_date: string; starts_at: string; ends_at: string; enabled: boolean; sort_order: number; dwell_seconds: number; image_path: string | null; updated_at: string };
export const slideTable = () => getSupabaseServiceClient().from("homepage_slides");
export function adminSlide(row: SlideRow): AdminHomepageSlide {
  return { id: row.id, title: row.title, altText: row.alt_text, buttonLabel: row.button_label, buttonHref: row.button_href, startDate: row.start_date, endDate: row.end_date, startsAt: row.starts_at, endsAt: row.ends_at, enabled: row.enabled, sortOrder: row.sort_order, dwellSeconds: row.dwell_seconds, updatedAt: row.updated_at, imageUrl: row.image_path ? `/api/admin/homepage-slides/${row.id}/image?v=${encodeURIComponent(row.updated_at)}` : null };
}
export async function readPublicHomepageSlides(now = Date.now()): Promise<PublicHomepageSlideSnapshot> {
  const empty = { slides: [], serverTime: new Date(now).toISOString(), nextChangeAt: null };
  try {
    const { data, error } = await slideTable().select("id,alt_text,button_label,button_href,starts_at,ends_at,sort_order,dwell_seconds,enabled,image_path,updated_at").eq("enabled", true).gt("ends_at", new Date(now).toISOString()).not("image_path", "is", null).order("sort_order").order("id");
    if (error) { console.warn("Homepage slides unavailable", error.code); return empty; }
    const rows = data ?? [];
    const boundaries = rows.flatMap(row => [Date.parse(row.starts_at), Date.parse(row.ends_at)]).filter(time => Number.isFinite(time) && time > now);
    const slides = rows.filter(row => slideIsActive(row, now)).map(row => ({ id: row.id, imageUrl: `/api/homepage-slides/${row.id}/image?v=${encodeURIComponent(row.updated_at)}`, altText: row.alt_text, buttonLabel: row.button_label, buttonHref: row.button_href, startsAt: row.starts_at, endsAt: row.ends_at, sortOrder: row.sort_order, dwellSeconds: row.dwell_seconds }));
    return { slides, serverTime: empty.serverTime, nextChangeAt: boundaries.length ? new Date(Math.min(...boundaries)).toISOString() : null };
  } catch { return empty; }
}
export async function getActiveHomepageSlides(now = Date.now()): Promise<PublicHomepageSlide[]> { return (await readPublicHomepageSlides(now)).slides; }
export async function readAdminSlides() {
  const { data, error } = await slideTable().select("*").order("sort_order").order("id");
  if (error) throw new Error("Slides unavailable. Confirm the homepage slide migration is installed.");
  return (data as SlideRow[]).map(adminSlide);
}
export async function saveSlide(value: HomepageSlideInput, id?: string, expectedUpdatedAt?: string) {
  const { startsAt, endsAt } = slideSchedule(value.startDate, value.endDate);
  const row = { title: value.title, alt_text: value.altText, button_label: value.buttonLabel, button_href: value.buttonHref, start_date: value.startDate, end_date: value.endDate, starts_at: startsAt, ends_at: endsAt, enabled: value.enabled, sort_order: value.sortOrder, dwell_seconds: value.dwellSeconds, updated_at: new Date().toISOString() };
  if (id && !expectedUpdatedAt) throw new Error("Reload this slide before saving.");
  if (value.enabled) {
    if (!id) throw new Error("Save a draft and upload its image before enabling it.");
    const { data } = await slideTable().select("image_path").eq("id", id).maybeSingle();
    if (!data?.image_path) throw new Error("Upload an image before enabling this slide.");
  }
  const query = id ? slideTable().update(row).eq("id", id).eq("updated_at", expectedUpdatedAt!) : slideTable().insert(row);
  const { data, error } = await query.select("*").maybeSingle();
  if (error || !data) throw new Error("Slide changed or could not be saved. Reload and try again.");
  return adminSlide(data as SlideRow);
}
