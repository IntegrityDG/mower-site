/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { scheduledPublicPrice } from "@/lib/catalog/public-price";
import type { ActivePriceSchedule } from "@/lib/catalog/active-price-schedule";
import { readPricingProgramSettingsFailSafe } from "@/lib/pricing-program/server";
import { AFTERMARKET_DISCLAIMER, type AccessoryAvailabilityStatus, type AccessoryCatalogResponse, type AccessoryItem, type AccessoryRelationshipTarget, type AccessorySettings, type AccessoryTab } from "./types";
import type { validateItem } from "./validation";

const SETTINGS_ID = "accessories";
type ValidItem = NonNullable<ReturnType<typeof validateItem>>;
const parentSlug: Record<AccessoryTab, string> = { lymow: "lymow-one-plus", yarbo: "yarbo", pandag: "pandag-g1", aftermarket: "ids-aftermarket" };

function currentPrice(row: Record<string, any>) {
  const now = Date.now();
  const starts = row.sale_starts_at ? Date.parse(row.sale_starts_at) : -Infinity;
  const ends = row.sale_ends_at ? Date.parse(row.sale_ends_at) : Infinity;
  return row.sale_price_cents !== null && now >= starts && now <= ends ? row.sale_price_cents : row.regular_price_cents;
}
export function mapSettings(row: Record<string, any>): AccessorySettings {
  return { lymowEnabled: row.lymow_enabled, lymowLabel: row.lymow_label, yarboEnabled: row.yarbo_enabled, yarboLabel: row.yarbo_label, pandagEnabled: row.pandag_enabled, pandagLabel: row.pandag_label, pandagMessage: row.pandag_message, aftermarketEnabled: row.aftermarket_enabled, aftermarketLabel: row.aftermarket_label, featuredAftermarketEnabled: row.featured_aftermarket_enabled, featuredAftermarketImageUrl: row.featured_aftermarket_image_url, featuredAftermarketImageAlt: row.featured_aftermarket_image_alt, featuredAftermarketHeading: row.featured_aftermarket_heading, featuredAftermarketDescription: row.featured_aftermarket_description, featuredAftermarketIdsExclusive: row.featured_aftermarket_ids_exclusive, aftermarketDisclaimer: row.aftermarket_disclaimer?.trim() || AFTERMARKET_DISCLAIMER };
}
export function mapItem(row: Record<string, any>, pricing?: { schedules: readonly ActivePriceSchedule[]; now: number; everydayLowPriceEnabled: boolean }): AccessoryItem {
  const price = pricing
    ? scheduledPublicPrice(row as Parameters<typeof scheduledPublicPrice>[0], pricing.schedules, "option", row.id, pricing.now, pricing.everydayLowPriceEnabled).price
    : { regularPriceCents: row.regular_price_cents, salePriceCents: row.sale_price_cents, currentPriceCents: currentPrice(row), promotionLabel: row.promotion_label, showPublicPrice: row.show_public_price, contactForPricing: row.contact_for_pricing };
  return { id: row.id, slug: row.option_slug, tab: row.accessory_tab, name: row.name, description: row.description, imageUrl: row.accessory_image_url, imageAlt: row.accessory_image_alt, badge: row.accessory_badge, idsExclusive: row.ids_exclusive, manufacturer: row.manufacturer_name, regularPriceCents: price.regularPriceCents, salePriceCents: price.salePriceCents, currentPriceCents: price.currentPriceCents, promotionLabel: price.promotionLabel, showPublicPrice: price.showPublicPrice, contactForPricing: price.contactForPricing, showInBuilder: row.show_in_builder, actionType: row.accessory_action_type ?? "none", actionLabel: row.accessory_action_label, actionUrl: row.accessory_action_url, priceText: row.accessory_price_text, sortOrder: row.sort_order, visible: row.accessory_listing_enabled && row.public_status !== "hidden", publicStatus: row.public_status, isIncluded: row.is_included, isRecommended: row.is_recommended, variantRelationships: [], packageRelationships: [], compatibilityLabels: [] };
}
export async function readAccessoryCatalog(admin = false): Promise<AccessoryCatalogResponse> {
  const client = getSupabaseServiceClient();
  const [settingsResult, itemsResult, schedulesResult, pricingProgram] = await Promise.all([
    client.from("accessory_catalog_settings").select("*").eq("id", SETTINGS_ID).single(),
    client.from("catalog_options").select("*").not("accessory_tab", "is", null).eq("admin_managed", true).order("sort_order").order("name"),
    admin ? Promise.resolve({ data: [], error: null }) : client.from("catalog_price_schedules").select("*").eq("public_status", "active").not("option_id", "is", null),
    admin ? Promise.resolve({ everydayLowPriceEnabled: true }) : readPricingProgramSettingsFailSafe(),
  ]);
  if (settingsResult.error || !settingsResult.data || itemsResult.error || schedulesResult.error) throw new Error("Accessory catalog is unavailable.");
  const settings = mapSettings(settingsResult.data);
  const pricing = admin ? undefined : { schedules: (schedulesResult.data ?? []) as ActivePriceSchedule[], now: Date.now(), everydayLowPriceEnabled: pricingProgram.everydayLowPriceEnabled };
  let items = (itemsResult.data ?? []).map((row) => mapItem(row, pricing));
  if (!admin) items = items.filter((item) => item.visible && settings[`${item.tab}Enabled`]);
  const optionIds = items.map((item) => item.id);
  const [variantLinks, packageLinks, variantsResult, packagesResult] = await Promise.all([
    optionIds.length ? client.from("catalog_variant_options").select("option_id,variant_id,relationship_type").in("option_id", optionIds).neq("relationship_type", "defines_variant") : Promise.resolve({ data: [], error: null }),
    admin && optionIds.length ? client.from("catalog_package_items").select("option_id,package_id,quantity,included_in_package_price").in("option_id", optionIds) : Promise.resolve({ data: [], error: null }),
    client.from("catalog_product_variants").select("id,product_id,name,public_status").order("sort_order"),
    admin ? client.from("catalog_packages").select("id,product_id,package_name,public_status").order("sort_order") : Promise.resolve({ data: [], error: null }),
  ]);
  if (variantLinks.error || packageLinks.error || variantsResult.error || packagesResult.error) throw new Error("Accessory relationships are unavailable.");
  const productIds = [...new Set((variantsResult.data ?? []).map((row) => row.product_id).concat((packagesResult.data ?? []).map((row) => row.product_id)))];
  const productsResult = productIds.length ? await client.from("catalog_products").select("id,slug").in("id", productIds) : { data: [], error: null };
  if (productsResult.error) throw new Error("Accessory relationship products are unavailable.");
  const tabs = new Map((productsResult.data ?? []).map((row) => [row.id, Object.entries(parentSlug).find(([, slug]) => slug === row.slug)?.[0] as AccessoryTab | undefined]));
  const variants: AccessoryRelationshipTarget[] = (variantsResult.data ?? []).filter((row) => tabs.get(row.product_id) && (admin || row.public_status !== "hidden")).map((row) => ({ id: row.id, productId: row.product_id, name: row.name, tab: tabs.get(row.product_id)! }));
  const packages: AccessoryRelationshipTarget[] = (packagesResult.data ?? []).filter((row) => tabs.get(row.product_id)).map((row) => ({ id: row.id, productId: row.product_id, name: row.package_name, tab: tabs.get(row.product_id)! }));
  const variantById = new Map(variants.map((variant) => [variant.id, variant]));
  items = items.map((item) => {
    const links = (variantLinks.data ?? []).filter((link) => link.option_id === item.id);
    return { ...item,
      variantRelationships: links.map((link) => ({ variantId: link.variant_id, relationshipType: link.relationship_type as AccessoryItem["variantRelationships"][number]["relationshipType"] })),
      packageRelationships: (packageLinks.data ?? []).filter((link) => link.option_id === item.id).map((link) => ({ packageId: link.package_id, quantity: link.quantity, includedInPackagePrice: link.included_in_package_price })),
      compatibilityLabels: links.filter((link) => link.relationship_type !== "excluded").map((link) => variantById.get(link.variant_id)?.name).filter((label): label is string => Boolean(label)),
      visible: admin ? item.visible : undefined,
    };
  });
  return admin ? { settings, items, variants, packages } : { settings, items };
}
export async function saveAccessorySettings(settings: AccessorySettings) {
  const { data, error } = await getSupabaseServiceClient().from("accessory_catalog_settings").update({ lymow_enabled: settings.lymowEnabled, lymow_label: settings.lymowLabel, yarbo_enabled: settings.yarboEnabled, yarbo_label: settings.yarboLabel, pandag_enabled: settings.pandagEnabled, pandag_label: settings.pandagLabel, pandag_message: settings.pandagMessage, aftermarket_enabled: settings.aftermarketEnabled, aftermarket_label: settings.aftermarketLabel, featured_aftermarket_enabled: settings.featuredAftermarketEnabled, featured_aftermarket_image_url: settings.featuredAftermarketImageUrl || null, featured_aftermarket_image_alt: settings.featuredAftermarketImageAlt || null, featured_aftermarket_heading: settings.featuredAftermarketHeading || null, featured_aftermarket_description: settings.featuredAftermarketDescription || null, featured_aftermarket_ids_exclusive: settings.featuredAftermarketIdsExclusive, aftermarket_disclaimer: settings.aftermarketDisclaimer, updated_at: new Date().toISOString() }).eq("id", SETTINGS_ID).select("id").single();
  if (error || !data) throw new Error("Accessory settings could not be saved.");
  return settings;
}
function slugify(name: string) { return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120) || "accessory"; }
export async function saveAccessoryItem(item: ValidItem, id?: string) {
  const client = getSupabaseServiceClient();
  const { data: parent, error: parentError } = await client.from("catalog_products").select("id").eq("slug", parentSlug[item.tab]).single();
  if (parentError || !parent) throw new Error("Accessory parent product is unavailable.");
  const currentResult = id ? await client.from("catalog_options").select("*").eq("id", id).eq("admin_managed", true).not("accessory_tab", "is", null).single() : null;
  if (id && (currentResult?.error || !currentResult?.data || currentResult.data.accessory_tab !== item.tab)) throw new Error("Accessory could not be updated.");
  const current = currentResult?.data;
  if (item.variantRelationships !== null || item.packageRelationships !== null) {
    const [variants, packages] = await Promise.all([
      item.variantRelationships?.length ? client.from("catalog_product_variants").select("id").eq("product_id", parent.id).in("id", item.variantRelationships.map((row) => row.variantId)) : Promise.resolve({ data: [], error: null }),
      item.packageRelationships?.length ? client.from("catalog_packages").select("id").eq("product_id", parent.id).in("id", item.packageRelationships.map((row) => row.packageId)) : Promise.resolve({ data: [], error: null }),
    ]);
    if (variants.error || packages.error || (item.variantRelationships && variants.data?.length !== item.variantRelationships.length) || (item.packageRelationships && packages.data?.length !== item.packageRelationships.length)) throw new Error("Accessory relationships must belong to its product.");
  }
  const row = { product_id: parent.id, name: item.name, description: item.description || null, public_status: item.publicStatus, is_included: item.isIncluded, is_recommended: item.isRecommended, regular_price_cents: item.regularPriceCents, sale_price_cents: item.salePriceCents, promotion_label: item.promotionLabel || null, show_public_price: item.showPublicPrice, contact_for_pricing: item.contactForPricing, sort_order: item.sortOrder, admin_managed: true, accessory_listing_enabled: item.visible, accessory_tab: item.tab, accessory_image_url: item.imageUrl || null, accessory_image_alt: item.imageAlt || null, accessory_badge: item.badge || null, ids_exclusive: item.idsExclusive, show_in_builder: item.showInBuilder, accessory_action_type: item.actionType, accessory_action_label: item.actionLabel || null, accessory_action_url: item.actionUrl || null, accessory_price_text: item.priceText || null, manufacturer_name: item.manufacturer || null, updated_at: new Date().toISOString(), ...(current?.sale_price_cents !== item.salePriceCents ? { sale_starts_at: null, sale_ends_at: null } : {}) };
  let saved;
  if (id) {
    const { data, error } = await client.from("catalog_options").update(row).eq("id", id).eq("admin_managed", true).select("*").single();
    if (error || !data) throw new Error("Accessory could not be updated.");
    saved = data;
  } else {
    const base = slugify(item.name!);
    for (let suffix = 1; suffix <= 100; suffix++) {
      const option_slug = suffix === 1 ? base : `${base}-${suffix}`;
      const { data, error } = await client.from("catalog_options").insert({ ...row, option_slug, option_group_id: null, is_required: false, default_quantity: 0, minimum_quantity: 0, maximum_quantity: null }).select("*").single();
      if (!error && data) { saved = data; break; }
      if (error?.code !== "23505") throw new Error("Accessory could not be created.");
    }
    if (!saved) throw new Error("Accessory could not be created.");
  }
  if (item.variantRelationships !== null || item.packageRelationships !== null) {
    const { error } = await client.rpc("save_accessory_relationships", { accessory_id: saved.id, variant_relationships: item.variantRelationships, package_relationships: item.packageRelationships });
    if (error) throw new Error("Accessory saved, but relationships could not be updated.");
  }
  return mapItem(saved);
}
export async function setAccessoryAvailability(id: string, status: AccessoryAvailabilityStatus) {
  const client = getSupabaseServiceClient();
  const { data: current, error: readError } = await client.from("catalog_options").select("public_status,accessory_listing_enabled").eq("id", id).eq("admin_managed", true).not("accessory_tab", "is", null).single();
  if (readError || !current) throw new Error("Accessory status could not be changed.");
  const listing = status === "hidden" ? false : current.public_status === "hidden" ? true : current.accessory_listing_enabled;
  const { data, error } = await client.from("catalog_options").update({ public_status: status, accessory_listing_enabled: listing, updated_at: new Date().toISOString() }).eq("id", id).eq("admin_managed", true).not("accessory_tab", "is", null).select("*").single();
  if (error || !data) throw new Error("Accessory status could not be changed.");
  return mapItem(data);
}
