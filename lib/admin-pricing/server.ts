import "server-only";
import { getSupabaseServiceClient } from "@/lib/supabase";
import type { PricingCatalog, PricingItem, PricingKind } from "./types";
import { editablePricingFields } from "./validation";
import { applyActivePriceSchedule, selectActivePriceSchedule, type ActivePriceSchedule, type PriceScheduleTarget, type SchedulePriceRow } from "@/lib/catalog/active-price-schedule";

const tables: Record<PricingKind, string> = { products: "catalog_products", variants: "catalog_product_variants", packages: "catalog_packages", options: "catalog_options", services: "catalog_services", "service-payment-options": "catalog_service_payment_options", "product-services": "catalog_product_services", schedules: "catalog_price_schedules" };
const category: Record<PricingKind, string> = { products: "Equipment", variants: "Product Variants", packages: "Packages", options: "Modules / Options", services: "Services", "service-payment-options": "Service Payment Options", "product-services": "Product-Service Overrides", schedules: "Price Schedules" };

function effective(values: Record<string, unknown>) {
  const regular = (values.regular_price_cents ?? values.override_regular_price_cents) as number | null | undefined;
  const sale = (values.sale_price_cents ?? values.override_sale_price_cents) as number | null | undefined;
  const starts = (values.sale_starts_at ?? values.override_sale_starts_at) as string | null | undefined;
  const ends = (values.sale_ends_at ?? values.override_sale_ends_at) as string | null | undefined;
  const now = Date.now();
  const active = sale !== null && sale !== undefined && (!starts || new Date(starts).getTime() <= now) && (!ends || new Date(ends).getTime() >= now);
  return active ? sale! : regular ?? null;
}

function basePriceRow(kind: PricingKind, row: Record<string, unknown>): SchedulePriceRow {
  if (kind === "product-services") return { regular_price_cents: row.override_regular_price_cents as number|null, sale_price_cents: row.override_sale_price_cents as number|null, sale_starts_at: row.override_sale_starts_at as string|null, sale_ends_at: row.override_sale_ends_at as string|null, promotion_label: row.override_promotion_label as string|null, show_public_price: row.override_show_public_price as boolean|undefined, contact_for_pricing: row.override_contact_for_pricing as boolean|undefined };
  return row as unknown as SchedulePriceRow;
}

function rowToItem(kind: PricingKind, row: Record<string, unknown>, maps: { products: Map<string,string>; variants: Map<string,string>; options: Map<string,string>; packages: Map<string,string>; services: Map<string,string>; productServices: Map<string,string> }, activeSchedule: ActivePriceSchedule | null): PricingItem {
  const productId = String(row.product_id ?? "");
  const product = maps.products.get(productId) ?? null;
  const names: Record<PricingKind, unknown> = { products: row.name, variants: row.name, packages: row.package_name, options: row.name, services: row.name, "service-payment-options": row.payment_option_name, "product-services": `${maps.products.get(productId) ?? "Product"} — ${maps.services.get(String(row.service_id ?? "")) ?? "Service"}`, schedules: row.schedule_name };
  const slugs: Record<PricingKind, unknown> = { products: row.slug, variants: row.variant_slug, packages: row.package_slug, options: row.option_slug, services: row.service_slug, "service-payment-options": row.payment_option_slug, "product-services": row.id, schedules: row.id };
  let targetLabel: string | null = null;
  if (kind === "schedules") for (const [column, map] of [["product_id", maps.products], ["variant_id", maps.variants], ["option_id", maps.options], ["package_id", maps.packages], ["service_id", maps.services], ["product_service_id", maps.productServices]] as const) if (row[column]) targetLabel = map.get(String(row[column])) ?? String(row[column]);
  const values = Object.fromEntries(Object.entries(row).filter(([key, item]) => !["id", "created_at", "updated_at"].includes(key) && (item === null || ["string", "number", "boolean"].includes(typeof item)))) as Record<string, string | number | boolean | null>;
  const slugValue = String(slugs[kind] ?? "");
  return { id: String(row.id), kind, category: category[kind], name: String(names[kind] ?? "Unnamed"), slug: slugValue, brand: kind === "products" ? String(row.brand ?? "") || null : null, productName: product, publicStatus: typeof row.public_status === "string" ? row.public_status : null, quoteOnly: (kind === "products" && slugValue === "pandag-g1") || product?.toLowerCase().includes("pandag") === true, targetLabel, values, effectivePriceCents: effective(applyActivePriceSchedule(basePriceRow(kind, row), activeSchedule)), activeScheduleName: activeSchedule?.schedule_name ?? null };
}

export async function readPricingCatalog(): Promise<PricingCatalog> {
  const client = getSupabaseServiceClient();
  const entries = await Promise.all((Object.entries(tables) as [PricingKind,string][]).map(async ([kind, table]) => { const { data, error } = await client.from(table).select("*"); if (error) throw error; return [kind, (data ?? []) as Record<string,unknown>[]] as const; }));
  const byKind = new Map(entries);
  const makeMap = (kind: PricingKind, label: (row: Record<string,unknown>) => string) => new Map((byKind.get(kind) ?? []).map((row) => [String(row.id), label(row)]));
  const products = makeMap("products", (row) => `${row.brand} ${row.name}`); const services = makeMap("services", (row) => String(row.name));
  const maps = { products, variants: makeMap("variants", (row) => String(row.name)), options: makeMap("options", (row) => String(row.name)), packages: makeMap("packages", (row) => String(row.package_name)), services, productServices: makeMap("product-services", (row) => `${products.get(String(row.product_id)) ?? "Product"} — ${services.get(String(row.service_id)) ?? "Service"}`) };
  const schedules = (byKind.get("schedules") ?? []) as unknown as ActivePriceSchedule[];
  const targets: Partial<Record<PricingKind, PriceScheduleTarget>> = { products:"product", variants:"variant", packages:"package", options:"option", services:"service", "product-services":"product_service" };
  const now = Date.now();
  return { items: entries.flatMap(([kind, rows]) => rows.map((row) => { const target = targets[kind]; const activeSchedule = target ? selectActivePriceSchedule(schedules, target, String(row.id), now) : null; return rowToItem(kind, row, maps, activeSchedule); })) };
}

export async function updatePricingRecord(kind: PricingKind, id: string, values: Record<string, unknown>): Promise<PricingItem> {
  const client = getSupabaseServiceClient();
  const { error } = await client.from(tables[kind]).update({ ...values, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
  const catalog = await readPricingCatalog();
  const item = catalog.items.find((candidate) => candidate.kind === kind && candidate.id === id);
  if (!item) throw new Error("Pricing record not found.");
  return item;
}

export async function readPricingRecordValues(kind: PricingKind, id: string) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client.from(tables[kind]).select(editablePricingFields[kind].join(",")).eq("id", id).limit(1).maybeSingle();
  if (error) throw error;
  return data as Record<string, unknown> | null;
}
