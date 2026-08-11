/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { AFTERMARKET_DISCLAIMER, type AccessoryAvailabilityStatus, type AccessoryCatalogResponse, type AccessoryItem, type AccessorySettings } from "./types";

const SETTINGS_ID = "accessories";
function currentPrice(row: Record<string, any>) {
  const now = Date.now(); const starts = row.sale_starts_at ? Date.parse(row.sale_starts_at) : -Infinity; const ends = row.sale_ends_at ? Date.parse(row.sale_ends_at) : Infinity;
  return row.sale_price_cents !== null && now >= starts && now <= ends ? row.sale_price_cents : row.regular_price_cents;
}
export function mapSettings(row: Record<string, any>): AccessorySettings {
  return { lymowEnabled: row.lymow_enabled, lymowLabel: row.lymow_label, yarboEnabled: row.yarbo_enabled, yarboLabel: row.yarbo_label, pandagEnabled: row.pandag_enabled, pandagLabel: row.pandag_label, pandagMessage: row.pandag_message, aftermarketEnabled: row.aftermarket_enabled, aftermarketLabel: row.aftermarket_label, featuredAftermarketEnabled: row.featured_aftermarket_enabled, featuredAftermarketImageUrl: row.featured_aftermarket_image_url, featuredAftermarketImageAlt: row.featured_aftermarket_image_alt, featuredAftermarketHeading: row.featured_aftermarket_heading, featuredAftermarketDescription: row.featured_aftermarket_description, featuredAftermarketIdsExclusive: row.featured_aftermarket_ids_exclusive, aftermarketDisclaimer: row.aftermarket_disclaimer?.trim() || AFTERMARKET_DISCLAIMER };
}
export function mapItem(row: Record<string, any>): AccessoryItem {
  return { id: row.id, slug: row.option_slug, tab: row.accessory_tab, name: row.name, description: row.description, imageUrl: row.accessory_image_url, imageAlt: row.accessory_image_alt, badge: row.accessory_badge, idsExclusive: row.ids_exclusive, manufacturer: row.manufacturer_name, regularPriceCents: row.regular_price_cents, salePriceCents: row.sale_price_cents, currentPriceCents: currentPrice(row), promotionLabel: row.promotion_label, showPublicPrice: row.show_public_price, contactForPricing: row.contact_for_pricing, showInBuilder: row.show_in_builder, actionType: row.accessory_action_type ?? "none", actionLabel: row.accessory_action_label, actionUrl: row.accessory_action_url, priceText: row.accessory_price_text, sortOrder: row.sort_order, visible: row.accessory_listing_enabled && row.public_status !== "hidden", publicStatus: row.public_status };
}
export async function readAccessoryCatalog(admin = false): Promise<AccessoryCatalogResponse> {
  const client = getSupabaseServiceClient();
  const [settingsResult, itemsResult] = await Promise.all([
    client.from("accessory_catalog_settings").select("*").eq("id", SETTINGS_ID).single(),
    client.from("catalog_options").select("*").not("accessory_tab", "is", null).eq("admin_managed", true).order("sort_order").order("name"),
  ]);
  if (settingsResult.error || !settingsResult.data || itemsResult.error) throw new Error("Accessory catalog is unavailable.");
  const settings = mapSettings(settingsResult.data); let items = (itemsResult.data ?? []).map(mapItem);
  if (!admin) items = items.filter((item) => item.visible && (item.tab !== "aftermarket" || settings.aftermarketEnabled)).map((item) => ({...item, visible: undefined}));
  return { settings, items };
}
export async function saveAccessorySettings(settings: AccessorySettings) {
  const { error } = await getSupabaseServiceClient().from("accessory_catalog_settings").update({ lymow_enabled: settings.lymowEnabled, lymow_label: settings.lymowLabel, yarbo_enabled: settings.yarboEnabled, yarbo_label: settings.yarboLabel, pandag_enabled: settings.pandagEnabled, pandag_label: settings.pandagLabel, pandag_message: settings.pandagMessage, aftermarket_enabled: settings.aftermarketEnabled, aftermarket_label: settings.aftermarketLabel, featured_aftermarket_enabled: settings.featuredAftermarketEnabled, featured_aftermarket_image_url: settings.featuredAftermarketImageUrl || null, featured_aftermarket_image_alt: settings.featuredAftermarketImageAlt || null, featured_aftermarket_heading: settings.featuredAftermarketHeading || null, featured_aftermarket_description: settings.featuredAftermarketDescription || null, featured_aftermarket_ids_exclusive: settings.featuredAftermarketIdsExclusive, aftermarket_disclaimer: settings.aftermarketDisclaimer, updated_at: new Date().toISOString() }).eq("id", SETTINGS_ID);
  if (error) throw new Error("Accessory settings could not be saved."); return settings;
}
function slugify(name: string) { return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120) || "accessory"; }
export async function saveAccessoryItem(item: any, id?: string) {
  const client = getSupabaseServiceClient();
  const parentSlug = item.tab === "lymow" ? "lymow-one-plus" : item.tab === "yarbo" ? "yarbo" : "ids-aftermarket";
  const { data: parent, error: parentError } = await client.from("catalog_products").select("id").eq("slug", parentSlug).single(); if (parentError || !parent) throw new Error("Accessory parent product is unavailable.");
  const row = { product_id: parent.id, option_group_id: null, name: item.name, description: item.description || null, public_status: item.publicStatus, is_required: false, is_included: false, is_recommended: false, default_quantity: 0, minimum_quantity: 0, maximum_quantity: 10, regular_price_cents: item.regularPriceCents, sale_price_cents: item.salePriceCents, promotion_label: item.promotionLabel || null, show_public_price: item.showPublicPrice, contact_for_pricing: item.contactForPricing, sort_order: item.sortOrder, admin_managed: true, accessory_listing_enabled: item.publicStatus !== "hidden", accessory_tab: item.tab, accessory_image_url: item.imageUrl || null, accessory_image_alt: item.imageAlt || null, accessory_badge: item.badge || null, ids_exclusive: item.idsExclusive, show_in_builder: item.showInBuilder, accessory_action_type: item.actionType, accessory_action_label: item.actionLabel || null, accessory_action_url: item.actionUrl || null, accessory_price_text: item.priceText || null, manufacturer_name: item.manufacturer || null, updated_at: new Date().toISOString() };
  if (id) { const { data, error } = await client.from("catalog_options").update(row).eq("id", id).eq("admin_managed", true).not("accessory_tab", "is", null).select("*").single(); if (error) throw new Error("Accessory could not be updated."); return mapItem(data); }
  const base = slugify(item.name); let option_slug = base;
  for (let suffix = 1; suffix < 100; suffix++) { const { data } = await client.from("catalog_options").select("id").eq("product_id", parent.id).eq("option_slug", option_slug).maybeSingle(); if (!data) break; option_slug = `${base}-${suffix + 1}`; }
  const { data, error } = await client.from("catalog_options").insert({ ...row, option_slug }).select("*").single(); if (error) throw new Error("Accessory could not be created."); return mapItem(data);
}
export async function setAccessoryAvailability(id: string, status: AccessoryAvailabilityStatus) {
  const { data, error } = await getSupabaseServiceClient().from("catalog_options").update({ public_status: status, accessory_listing_enabled: status !== "hidden", updated_at: new Date().toISOString() }).eq("id", id).eq("admin_managed", true).not("accessory_tab", "is", null).select("*").single();
  if (error) throw new Error("Accessory status could not be changed."); return mapItem(data);
}
