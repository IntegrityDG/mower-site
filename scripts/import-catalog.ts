import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

const WORKBOOK_PATH = "catalog-data/IDS_Master_Catalog_Product_Pages_Ready.xlsx";
const LYMOW_PRICING_OVERRIDES_PATH = "catalog-data/overrides/lymow-pricing.json";
const PRODUCT_VARIANTS_SHEET = "Product Variants";
const REQUIRED_LYMOW_PRICING_VARIANT_SLUGS = [
  "lymow-one-plus-5a",
  "lymow-one-plus-10a",
] as readonly string[];
type Row = Record<string, unknown>;
type IdMap = Map<string, string>;
export type CatalogRows = Map<string, Row[]>;

type DbClient = ReturnType<ReturnType<typeof createClient>["schema"]>;

type LymowVariantPricingOverride = {
  variant_slug: string;
  regular_price_cents: number;
  sale_price_cents: number;
  sale_starts_at: null;
  sale_ends_at: null;
  promotion_label: string;
};

type LymowPricingOverrides = {
  productVariants: LymowVariantPricingOverride[];
};

type OverrideLogger = Pick<Console, "warn">;

function normalizeWorkbookRow(row: Row): Row {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.trim(),
      typeof value === "string" ? value.trim() || null : value,
    ]),
  );
}

export function parseWorkbookRows(workbook: XLSX.WorkBook): CatalogRows {
  const catalogRows: CatalogRows = new Map();

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    catalogRows.set(
      sheetName,
      XLSX.utils
        .sheet_to_json<Row>(sheet, { defval: null, raw: true })
        .map(normalizeWorkbookRow),
    );
  }

  return catalogRows;
}

function loadWorkbookRows(workbookPath = WORKBOOK_PATH): CatalogRows {
  return parseWorkbookRows(XLSX.readFile(workbookPath, { cellDates: true }));
}

function rows(catalogRows: CatalogRows, sheetName: string): Row[] {
  return catalogRows.get(sheetName) ?? [];
}

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const result = String(value).trim();
  return result === "" ? null : result;
}

function slug(value: unknown): string | null {
  return text(value)?.trim() ?? null;
}

function bool(value: unknown, fallback = false): boolean {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "yes", "y", "1", "active", "approved"].includes(normalized)) return true;
  if (["false", "no", "n", "0", "inactive", "unapproved"].includes(normalized)) return false;
  throw new Error(`Cannot convert ${JSON.stringify(value)} to a boolean.`);
}

function number(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(/[$,]/g, ""));
  if (!Number.isFinite(parsed)) throw new Error(`Cannot convert ${JSON.stringify(value)} to a number.`);
  return parsed;
}

function integer(value: unknown, fallback: number | null = null): number | null {
  const parsed = number(value);
  return parsed === null ? fallback : Math.trunc(parsed);
}

function cents(row: Row, centsColumn: string, dollarsColumn: string): number | null {
  const storedCents = number(row[centsColumn]);
  if (storedCents !== null) return Math.round(storedCents);
  const storedDollars = number(row[dollarsColumn]);
  return storedDollars === null ? null : Math.round(storedDollars * 100);
}

function iso(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid date: ${JSON.stringify(value)}`);
  return parsed.toISOString();
}

function required(value: string | null, label: string): string {
  if (!value) throw new Error(`Missing required ${label}.`);
  return value;
}

function lookup(map: IdMap, value: unknown, label: string): string {
  const key = required(slug(value), label);
  const id = map.get(key);
  if (!id) throw new Error(`Unknown ${label}: ${key}`);
  return id;
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requiredInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a safe integer.`);
  }
  return value;
}

function requiredNull(value: unknown, label: string): null {
  if (value !== null) throw new Error(`${label} must be null.`);
  return null;
}

export function validateLymowPricingOverrides(value: unknown): LymowPricingOverrides {
  const root = record(value, "Lymow pricing override file");
  if (!Array.isArray(root.productVariants)) {
    throw new Error("Lymow pricing override file must contain productVariants.");
  }

  const seen = new Set<string>();
  const productVariants = root.productVariants.map((item, index) => {
    const override = record(item, `Lymow pricing override productVariants[${index}]`);
    const variantSlug = required(text(override.variant_slug), `productVariants[${index}].variant_slug`);

    if (seen.has(variantSlug)) {
      throw new Error(`Duplicate Lymow pricing override for variant_slug ${variantSlug}.`);
    }
    if (!REQUIRED_LYMOW_PRICING_VARIANT_SLUGS.includes(variantSlug)) {
      throw new Error(`Unsupported Lymow pricing override variant_slug ${variantSlug}.`);
    }
    seen.add(variantSlug);

    return {
      variant_slug: variantSlug,
      regular_price_cents: requiredInteger(
        override.regular_price_cents,
        `productVariants[${index}].regular_price_cents`,
      ),
      sale_price_cents: requiredInteger(
        override.sale_price_cents,
        `productVariants[${index}].sale_price_cents`,
      ),
      sale_starts_at: requiredNull(override.sale_starts_at, `productVariants[${index}].sale_starts_at`),
      sale_ends_at: requiredNull(override.sale_ends_at, `productVariants[${index}].sale_ends_at`),
      promotion_label: required(text(override.promotion_label), `productVariants[${index}].promotion_label`),
    };
  });

  for (const variantSlug of REQUIRED_LYMOW_PRICING_VARIANT_SLUGS) {
    if (!seen.has(variantSlug)) {
      throw new Error(`Lymow pricing override file is missing expected variant_slug ${variantSlug}.`);
    }
  }

  return { productVariants };
}

export function loadLymowPricingOverrides(
  overridesPath = LYMOW_PRICING_OVERRIDES_PATH,
): LymowPricingOverrides {
  return validateLymowPricingOverrides(JSON.parse(fs.readFileSync(overridesPath, "utf8")));
}

function rawLogValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "null";
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value) ?? String(value);
}

export function applyTrackedCatalogOverrides(
  catalogRows: CatalogRows,
  lymowPricingOverrides = loadLymowPricingOverrides(),
  logger: OverrideLogger = console,
) {
  const variantRows = rows(catalogRows, PRODUCT_VARIANTS_SHEET);
  const variantsBySlug = new Map<string, Row>();

  for (const row of variantRows) {
    const variantSlug = slug(row.variant_slug);
    if (!variantSlug) continue;
    if (variantsBySlug.has(variantSlug)) {
      throw new Error(`Tracked Lymow pricing override found duplicate Product Variants row ${variantSlug}.`);
    }
    variantsBySlug.set(variantSlug, row);
  }

  for (const override of lymowPricingOverrides.productVariants) {
    const row = variantsBySlug.get(override.variant_slug);
    if (!row) {
      throw new Error(
        `Tracked Lymow pricing override expected Product Variants row ${override.variant_slug}, but it is missing.`,
      );
    }

    const previous = {
      regular_price_cents: row.regular_price_cents ?? row.regular_price_dollars,
      sale_price_cents: row.sale_price_cents ?? row.sale_price_dollars,
      sale_starts_at: row.sale_starts_at,
      sale_ends_at: row.sale_ends_at,
      promotion_label: row.promotion_label,
    };

    row.regular_price_cents = override.regular_price_cents;
    row.sale_price_cents = override.sale_price_cents;
    row.sale_starts_at = override.sale_starts_at;
    row.sale_ends_at = override.sale_ends_at;
    row.promotion_label = override.promotion_label;

    logger.warn(
      `Tracked Lymow pricing override applied to ${PRODUCT_VARIANTS_SHEET}.${override.variant_slug}: ` +
        `regular_price_cents ${rawLogValue(previous.regular_price_cents)} -> ${override.regular_price_cents}; ` +
        `sale_price_cents ${rawLogValue(previous.sale_price_cents)} -> ${override.sale_price_cents}; ` +
        `promotion_label ${rawLogValue(previous.promotion_label)} -> ${rawLogValue(override.promotion_label)}; ` +
        `sale_starts_at ${rawLogValue(previous.sale_starts_at)} -> null; ` +
        `sale_ends_at ${rawLogValue(previous.sale_ends_at)} -> null.`,
    );
  }
}

function loadCatalogRows(
  workbookPath = WORKBOOK_PATH,
  lymowPricingOverrides: LymowPricingOverrides | null = null,
  logger: OverrideLogger = console,
): CatalogRows {
  const catalogRows = loadWorkbookRows(workbookPath);
  applyTrackedCatalogOverrides(catalogRows, lymowPricingOverrides ?? loadLymowPricingOverrides(), logger);
  return catalogRows;
}

function createCatalogClients() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing environment variables. Set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return {
    supabase,
    publicCatalog: supabase.schema("public"),
    privateCatalog: supabase.schema("catalog_private"),
  };
}

const LYMOW_CHARGER_CONFIGURATIONS = new Set([
  "lymow-5a-charger",
  "lymow-10a-charger",
]);

function optionPublicStatus(productSlug: string, optionSlug: string, value: unknown) {
  if (productSlug === "lymow-one-plus" && LYMOW_CHARGER_CONFIGURATIONS.has(optionSlug)) {
    return "active";
  }
  return text(value) ?? "hidden";
}

function expectedLymowCharger(variantSlug: string) {
  return variantSlug === "lymow-one-plus-5a"
    ? "lymow-5a-charger"
    : variantSlug === "lymow-one-plus-10a"
      ? "lymow-10a-charger"
      : null;
}

function variantOptionRelationship(variantSlug: string, optionSlug: string, isDefault: unknown) {
  const expectedCharger = expectedLymowCharger(variantSlug);
  return expectedCharger === optionSlug || bool(isDefault) ? "defines_variant" : "compatible";
}

async function upsert(
  client: DbClient,
  table: string,
  records: Record<string, unknown>[],
  onConflict: string,
) {
  if (!records.length) return [];
  const { data, error } = await client.from(table).upsert(records, { onConflict }).select("id");
  if (error) throw new Error(`${table}: ${error.message}`);
  return data ?? [];
}

async function refreshMap(
  client: DbClient,
  table: string,
  keyColumn: string,
  scopeColumn?: string,
): Promise<IdMap> {
  const columns = scopeColumn ? `id,${keyColumn},${scopeColumn}` : `id,${keyColumn}`;
  const { data, error } = await client.from(table).select(columns);
  if (error) throw new Error(`${table} lookup: ${error.message}`);
  const map: IdMap = new Map();
  for (const item of (data ?? []) as unknown as Row[]) {
    const key = required(slug(item[keyColumn]), `${table}.${keyColumn}`);
    const scopedKey = scopeColumn ? `${item[scopeColumn]}:${key}` : key;
    map.set(scopedKey, String(item.id));
  }
  return map;
}

async function updateOrInsert(
  client: DbClient,
  table: string,
  record: Record<string, unknown>,
  match: Record<string, unknown>,
) {
  let query = client.from(table).select("id");
  for (const [column, value] of Object.entries(match)) {
    query = value === null ? query.is(column, null) : query.eq(column, value);
  }
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw new Error(`${table} lookup: ${error.message}`);
  const result = data
    ? await client.from(table).update(record).eq("id", data.id)
    : await client.from(table).insert(record);
  if (result.error) throw new Error(`${table}: ${result.error.message}`);
}

export function validateWorkbook(catalogRows: CatalogRows) {
  const productSlugs = new Set(rows(catalogRows, "Products").map((row) => required(slug(row.product_slug), "product_slug")));
  const serviceSlugs = new Set(rows(catalogRows, "Services").map((row) => required(slug(row.service_slug), "service_slug")));
  const groupKeys = new Set(
    rows(catalogRows, "Option Groups").map((row) => `${required(slug(row.product_slug), "product_slug")}:${required(slug(row.group_slug), "group_slug")}`),
  );
  const optionRows = [...rows(catalogRows, "Options"), ...rows(catalogRows, "Accessories")];
  const optionSlugs = new Set(
    optionRows.map((row) => required(slug(row.option_slug ?? row.accessory_slug), "option_slug/accessory_slug")),
  );
  const packageSlugs = new Set(rows(catalogRows, "Packages").map((row) => required(slug(row.package_slug), "package_slug")));
  const variantSlugs = new Set(rows(catalogRows, "Product Variants").map((row) => required(slug(row.variant_slug), "variant_slug")));

  if (productSlugs.has("yarbo-pro")) throw new Error("Invalid product_slug yarbo-pro; Yarbo Pro is a package/configuration, not a product.");
  if (optionSlugs.has("yarbo-core")) throw new Error("Invalid option_slug yarbo-core.");

  const productReferences = [
    "Product Variants", "Option Groups", "Options", "Accessories", "Packages", "Product Services", "Media", "Product Pages",
  ];
  for (const sheet of productReferences) {
    for (const row of rows(catalogRows, sheet)) {
      const value = required(slug(row.product_slug), `${sheet}.product_slug`);
      if (!productSlugs.has(value)) throw new Error(`${sheet} references unknown product_slug ${value}.`);
    }
  }
  for (const row of rows(catalogRows, "Options")) {
    const group = slug(row.group_slug);
    if (group && !groupKeys.has(`${slug(row.product_slug)}:${group}`)) throw new Error(`Options references unknown group_slug ${group}.`);
  }
  for (const row of rows(catalogRows, "Package Items")) {
    const packageSlug = required(slug(row.package_slug), "Package Items.package_slug");
    const optionSlug = required(slug(row.option_slug), "Package Items.option_slug");
    if (!packageSlugs.has(packageSlug)) throw new Error(`Package Items references unknown package_slug ${packageSlug}.`);
    if (!optionSlugs.has(optionSlug)) throw new Error(`Package Items references unknown option_slug ${optionSlug}.`);
  }
  for (const row of rows(catalogRows, "Variant Option Links")) {
    const variant = required(slug(row.variant_slug), "Variant Option Links.variant_slug");
    const option = required(slug(row.option_slug), "Variant Option Links.option_slug");
    if (!variantSlugs.has(variant)) throw new Error(`Variant Option Links references unknown variant_slug ${variant}.`);
    if (!optionSlugs.has(option)) throw new Error(`Variant Option Links references unknown option_slug ${option}.`);
    const expectedCharger = expectedLymowCharger(variant);
    if (LYMOW_CHARGER_CONFIGURATIONS.has(option) && expectedCharger !== option) {
      throw new Error(`Variant Option Links crosses Lymow variant ${variant} with charger ${option}.`);
    }
  }
  for (const sheet of ["Service Payment Options", "Product Services", "Service Regions"]) {
    for (const row of rows(catalogRows, sheet)) {
      const value = required(slug(row.service_slug), `${sheet}.service_slug`);
      if (!serviceSlugs.has(value)) throw new Error(`${sheet} references unknown service_slug ${value}.`);
    }
  }

  // Pandag prices are allowed only as workbook-entered values. Source monitoring must remain manual/private.
  for (const row of rows(catalogRows, "Sources")) {
    if (/pandag/i.test(text(row.source_name) ?? "") && !/manual-only|private/i.test(text(row.notes) ?? "")) {
      throw new Error("The Pandag source is not marked manual/private in Sources.notes.");
    }
  }

  for (const row of rows(catalogRows, "Price Schedule")) {
    const pandagRelated = /pandag/i.test(
      [row.item_type, row.item_slug, row.item_name].map(text).filter(Boolean).join(" "),
    );
    const notesRequirePrivateHandling = /private|manual-only|dealer|internal/i.test(text(row.notes) ?? "");
    const markedPublic =
      bool(row.show_public_price, true) && (text(row.public_status) ?? "active") !== "hidden";

    if (pandagRelated && markedPublic && notesRequirePrivateHandling) {
      throw new Error(
        `Price Schedule row ${text(row.item_slug) ?? "(missing item_slug)"} is Pandag-related and marked public, ` +
        "but its notes indicate private/manual-only pricing. Keep Pandag dealer/internal pricing in Internal Pricing.",
      );
    }
  }
}

async function main() {
  const catalogRows = loadCatalogRows();
  validateWorkbook(catalogRows);
  const { supabase, publicCatalog, privateCatalog } = createCatalogClients();
  const summary = {
    products: 0, variants: 0, options: 0, packages: 0, services: 0,
    servicePaymentOptions: 0, productPages: 0, media: 0, internalPricing: 0,
    skippedTestimonials: 0,
  };

  const productRecords = rows(catalogRows, "Products").map((row) => ({
    slug: required(slug(row.product_slug), "Products.product_slug"),
    brand: required(text(row.brand), "Products.brand"),
    name: required(text(row.product_name), "Products.product_name"),
    homepage_summary: text(row.homepage_summary), full_description: text(row.full_description),
    capability_level: text(row.capability_level), property_scale: text(row.property_scale),
    customer_guidance: text(row.customer_guidance), is_featured: bool(row.featured),
    public_status: text(row.public_status) ?? "hidden", sort_order: integer(row.sort_order, 0),
    brochure_url: text(row.brochure_url), video_url: text(row.video_url),
    regular_price_cents: cents(row, "regular_price_cents", "regular_price_dollars"),
    sale_price_cents: cents(row, "sale_price_cents", "sale_price_dollars"),
    sale_starts_at: iso(row.sale_starts_at), sale_ends_at: iso(row.sale_ends_at),
    promotion_label: text(row.promotion_label), show_public_price: bool(row.show_public_price),
    contact_for_pricing: bool(row.contact_for_pricing, true), updated_at: new Date().toISOString(),
  }));
  await upsert(publicCatalog, "catalog_products", productRecords, "slug");
  summary.products = productRecords.length;
  const products = await refreshMap(publicCatalog, "catalog_products", "slug");

  const variantRecords = rows(catalogRows, "Product Variants").map((row) => ({
    product_id: lookup(products, row.product_slug, "product_slug"),
    variant_slug: required(slug(row.variant_slug), "variant_slug"), sku: text(row.sku),
    name: required(text(row.variant_name), "variant_name"), description: text(row.description),
    public_status: text(row.public_status) ?? "hidden", sort_order: integer(row.sort_order, 0),
    regular_price_cents: cents(row, "regular_price_cents", "regular_price_dollars"),
    sale_price_cents: cents(row, "sale_price_cents", "sale_price_dollars"),
    sale_starts_at: iso(row.sale_starts_at), sale_ends_at: iso(row.sale_ends_at),
    promotion_label: text(row.promotion_label), show_public_price: bool(row.show_public_price),
    contact_for_pricing: bool(row.contact_for_pricing, true), updated_at: new Date().toISOString(),
  }));
  await upsert(publicCatalog, "catalog_product_variants", variantRecords, "product_id,variant_slug");
  summary.variants = variantRecords.length;
  const variants = await refreshMap(publicCatalog, "catalog_product_variants", "variant_slug");

  for (const row of rows(catalogRows, "Media")) {
    const record = {
      product_id: lookup(products, row.product_slug, "product_slug"), media_type: text(row.media_type) ?? "image",
      url: required(text(row.file_or_url), "Media.file_or_url"), alt_text: text(row.alt_text), caption: text(row.caption),
      is_primary: bool(row.is_primary), show_on_product_page: bool(row.show_on_product_page, true),
      sort_order: integer(row.sort_order, 0), updated_at: new Date().toISOString(),
    };
    await updateOrInsert(publicCatalog, "catalog_product_media", record, { product_id: record.product_id, url: record.url });
    summary.media++;
  }

  for (const row of rows(catalogRows, "Product Pages")) {
    const productId = lookup(products, row.product_slug, "product_slug");
    await upsert(publicCatalog, "catalog_product_pages", [{
      product_id: productId, seo_title: text(row.seo_title), seo_description: text(row.seo_description),
      hero_heading: text(row.hero_heading), hero_subheading: text(row.hero_subheading), long_form_content: null,
      is_published: bool(row.published), updated_at: new Date().toISOString(),
    }], "product_id");
    summary.productPages++;
  }
  const pages = await refreshMap(publicCatalog, "catalog_product_pages", "product_id");
  for (const row of rows(catalogRows, "Product Pages")) {
    const productId = lookup(products, row.product_slug, "product_slug");
    const pageId = lookup(pages, productId, "product page");
    const sections = [1, 2, 3].flatMap((position) => {
      const heading = text(row[`section_${position}_heading`]);
      const body = text(row[`section_${position}_body`]);
      return heading || body ? [{ heading, body, position }] : [];
    });
    for (const section of sections) {
      const record = {
        product_page_id: pageId, section_type: "content", heading: section.heading,
        body_content: section.body, sort_order: section.position, is_published: bool(row.published),
        updated_at: new Date().toISOString(),
      };
      await updateOrInsert(publicCatalog, "catalog_product_page_sections", record, {
        product_page_id: pageId, sort_order: section.position,
      });
    }
  }

  const groupRecords = rows(catalogRows, "Option Groups").map((row) => ({
    product_id: lookup(products, row.product_slug, "product_slug"),
    group_slug: required(slug(row.group_slug), "group_slug"), group_name: required(text(row.group_name), "group_name"),
    group_description: text(row.description), selection_type: text(row.selection_type) ?? "multiple",
    is_required: bool(row.required), minimum_selections: integer(row.minimum_selections, 0),
    maximum_selections: integer(row.maximum_selections), sort_order: integer(row.sort_order, 0),
    updated_at: new Date().toISOString(),
  }));
  await upsert(publicCatalog, "catalog_option_groups", groupRecords, "product_id,group_slug");
  const groups = await refreshMap(publicCatalog, "catalog_option_groups", "group_slug", "product_id");

  const optionRecords = rows(catalogRows, "Options").map((row) => {
    const productId = lookup(products, row.product_slug, "product_slug");
    const productSlug = required(slug(row.product_slug), "product_slug");
    const groupSlug = slug(row.group_slug);
    const optionSlug = required(slug(row.option_slug), "option_slug");
    return {
      product_id: productId, option_group_id: groupSlug ? lookup(groups, `${productId}:${groupSlug}`, "group_slug") : null,
      option_slug: optionSlug, name: required(text(row.option_name), "option_name"),
      description: text(row.description), public_status: optionPublicStatus(productSlug, optionSlug, row.public_status),
      is_required: bool(row.required), is_included: bool(row.included), is_recommended: bool(row.recommended),
      default_quantity: integer(row.default_quantity, 0), minimum_quantity: integer(row.minimum_quantity, 0),
      maximum_quantity: integer(row.maximum_quantity), regular_price_cents: cents(row, "regular_price_cents", "regular_price_dollars"),
      sale_price_cents: cents(row, "sale_price_cents", "sale_price_dollars"), sale_starts_at: iso(row.sale_starts_at),
      sale_ends_at: iso(row.sale_ends_at), promotion_label: text(row.promotion_label),
      show_public_price: bool(row.show_public_price), contact_for_pricing: bool(row.contact_for_pricing, true),
      sort_order: integer(row.sort_order, 0), updated_at: new Date().toISOString(),
    };
  });
  const accessoryRecords = rows(catalogRows, "Accessories").map((row) => ({
    product_id: lookup(products, row.product_slug, "product_slug"), option_group_id: null,
    option_slug: required(slug(row.accessory_slug), "accessory_slug"), name: required(text(row.accessory_name), "accessory_name"),
    description: [text(row.description), text(row.compatibility_notes)].filter(Boolean).join("\n\n") || null,
    public_status: text(row.public_status) ?? "hidden", is_required: false, is_included: false, is_recommended: false,
    default_quantity: 0, minimum_quantity: 0, maximum_quantity: null,
    regular_price_cents: cents(row, "regular_price_cents", "regular_price_dollars"),
    sale_price_cents: cents(row, "sale_price_cents", "sale_price_dollars"), sale_starts_at: iso(row.sale_starts_at),
    sale_ends_at: iso(row.sale_ends_at), promotion_label: text(row.promotion_label),
    show_public_price: bool(row.show_public_price), contact_for_pricing: bool(row.contact_for_pricing, true),
    sort_order: integer(row.sort_order, 0), updated_at: new Date().toISOString(),
  }));
  const incomingOptions = [...optionRecords, ...accessoryRecords];
  const { data: protectedRows, error: protectedError } = await publicCatalog
    .from("catalog_options").select("product_id,option_slug").eq("admin_managed", true);
  if (protectedError) throw new Error(`Unable to read admin-managed catalog options: ${protectedError.message}`);
  const protectedKeys = new Set((protectedRows ?? []).map((row) => `${row.product_id}:${row.option_slug}`));
  const importableOptions = incomingOptions.filter((row) => {
    const protectedOption = protectedKeys.has(`${row.product_id}:${row.option_slug}`);
    if (protectedOption) console.warn(`Skipped admin-managed catalog option ${row.option_slug}; Admin value remains authoritative.`);
    return !protectedOption;
  });
  await upsert(publicCatalog, "catalog_options", importableOptions, "product_id,option_slug");
  summary.options = importableOptions.length;
  const options = await refreshMap(publicCatalog, "catalog_options", "option_slug");

  for (const row of rows(catalogRows, "Variant Option Links")) {
    const variantSlug = required(slug(row.variant_slug), "variant_slug");
    const optionSlug = required(slug(row.option_slug), "option_slug");
    await upsert(publicCatalog, "catalog_variant_options", [{
      variant_id: lookup(variants, variantSlug, "variant_slug"),
      option_id: lookup(options, optionSlug, "option_slug"),
      relationship_type: variantOptionRelationship(variantSlug, optionSlug, row.is_default), quantity: 1,
      updated_at: new Date().toISOString(),
    }], "variant_id,option_id,relationship_type");
  }

  const packageRecords = rows(catalogRows, "Packages").map((row) => ({
    product_id: lookup(products, row.product_slug, "product_slug"), package_slug: required(slug(row.package_slug), "package_slug"),
    package_name: required(text(row.package_name), "package_name"), description: text(row.description),
    public_status: text(row.public_status) ?? "hidden", regular_price_cents: cents(row, "regular_price_cents", "regular_price_dollars"),
    sale_price_cents: cents(row, "sale_price_cents", "sale_price_dollars"), sale_starts_at: iso(row.sale_starts_at),
    sale_ends_at: iso(row.sale_ends_at), promotion_label: text(row.promotion_label),
    show_public_price: bool(row.show_public_price), contact_for_pricing: bool(row.contact_for_pricing, true),
    sort_order: integer(row.sort_order, 0), updated_at: new Date().toISOString(),
  }));
  await upsert(publicCatalog, "catalog_packages", packageRecords, "product_id,package_slug");
  summary.packages = packageRecords.length;
  const packages = await refreshMap(publicCatalog, "catalog_packages", "package_slug");
  for (const row of rows(catalogRows, "Package Items")) {
    await upsert(publicCatalog, "catalog_package_items", [{
      package_id: lookup(packages, row.package_slug, "package_slug"), option_id: lookup(options, row.option_slug, "option_slug"),
      quantity: integer(row.quantity, 1), included_in_package_price: bool(row.included_in_package_price, true),
      updated_at: new Date().toISOString(),
    }], "package_id,option_id");
  }

  const serviceRecords = rows(catalogRows, "Services").map((row) => ({
    service_slug: required(slug(row.service_slug), "service_slug"), name: required(text(row.service_name), "service_name"),
    description: text(row.description), service_category: text(row.service_category), billing_type: text(row.billing_type),
    requires_local_service: bool(row.requires_local_service), requires_property_review: bool(row.requires_property_review),
    estimated_hours: number(row.estimated_hours), maximum_visit_hours: number(row.maximum_visit_hours),
    season_length: text(row.season_length_months), public_status: text(row.public_status) ?? "hidden",
    regular_price_cents: cents(row, "regular_price_cents", "regular_price_dollars"),
    sale_price_cents: cents(row, "sale_price_cents", "sale_price_dollars"), sale_starts_at: iso(row.sale_starts_at),
    sale_ends_at: iso(row.sale_ends_at), promotion_label: text(row.promotion_label),
    show_public_price: bool(row.show_public_price), contact_for_pricing: bool(row.contact_for_pricing, true),
    sort_order: integer(row.sort_order, 0), updated_at: new Date().toISOString(),
  }));
  await upsert(publicCatalog, "catalog_services", serviceRecords, "service_slug");
  summary.services = serviceRecords.length;
  const services = await refreshMap(publicCatalog, "catalog_services", "service_slug");

  const paymentRecords = rows(catalogRows, "Service Payment Options").map((row) => ({
    service_id: lookup(services, row.service_slug, "service_slug"),
    payment_option_slug: required(slug(row.payment_option_slug), "payment_option_slug"),
    payment_option_name: required(text(row.display_name), "display_name"), billing_type: text(row.billing_type),
    regular_price_cents: cents(row, "price_cents", "price_dollars"), sale_price_cents: null,
    season_length_months: integer(row.term_months), savings_label: number(row.listed_savings_dollars) === null ? null : `$${number(row.listed_savings_dollars)} savings`,
    is_available: bool(row.is_selectable), sort_order: integer(row.sort_order, 0), notes: text(row.notes),
    updated_at: new Date().toISOString(),
  }));
  await upsert(publicCatalog, "catalog_service_payment_options", paymentRecords, "payment_option_slug");
  summary.servicePaymentOptions = paymentRecords.length;

  const productServiceRecords = rows(catalogRows, "Product Services").map((row) => ({
    product_id: lookup(products, row.product_slug, "product_slug"), service_id: lookup(services, row.service_slug, "service_slug"),
    is_available: bool(row.is_available, true), is_recommended: bool(row.is_recommended), is_required: bool(row.is_required),
    override_regular_price_cents: cents(row, "price_override_cents", "price_override_dollars"), sort_order: 0,
    updated_at: new Date().toISOString(),
  }));
  await upsert(publicCatalog, "catalog_product_services", productServiceRecords, "product_id,service_id");
  const productServices = new Map<string, string>();
  const { data: psData, error: psError } = await supabase.from("catalog_product_services").select("id,product_id,service_id");
  if (psError) throw new Error(`catalog_product_services lookup: ${psError.message}`);
  for (const item of psData ?? []) productServices.set(`${item.product_id}:${item.service_id}`, item.id);

  // The current schema stores regions globally, not per-service. Service slugs are validated above, then regions are deduplicated.
  const regionRecords = [...new Map(rows(catalogRows, "Service Regions").map((row) => {
    const state = required(text(row.state), "Service Regions.state");
    const region = required(text(row.region), "Service Regions.region");
    return [`${state}:${region}`, {
      state, region_name: region, public_status: bool(row.is_active) ? "active" : "hidden",
      local_services_available: bool(row.is_active), sort_order: 0, updated_at: new Date().toISOString(),
    }];
  })).values()];
  await upsert(publicCatalog, "catalog_service_regions", regionRecords, "state,region_name");

  const targetFor = (itemType: string, itemSlug: string) => {
    const type = itemType === "accessory" ? "option" : itemType;
    const maps: Record<string, IdMap> = { product: products, variant: variants, option: options, package: packages, service: services };
    if (!maps[type]) throw new Error(`Unsupported item_type ${itemType}.`);
    return { type, id: lookup(maps[type], itemSlug, `${itemType} item_slug`) };
  };

  for (const row of rows(catalogRows, "Price Schedule")) {
    const itemType = required(slug(row.item_type), "Price Schedule.item_type");
    const itemSlug = required(slug(row.item_slug), "Price Schedule.item_slug");
    const target = targetFor(itemType, itemSlug);
    const targetColumn = `${target.type}_id`;
    const record = compact({
      product_id: null, variant_id: null, option_id: null, package_id: null, service_id: null, product_service_id: null,
      [targetColumn]: target.id, schedule_name: required(text(row.promotion_phase), "promotion_phase"),
      starts_at: required(iso(row.starts_at), "Price Schedule.starts_at"), ends_at: iso(row.ends_at),
      regular_price_cents: cents(row, "public_price_cents", "public_price_dollars"), sale_price_cents: null,
      promotion_label: text(row.promotion_label), show_public_price: bool(row.show_public_price, true),
      contact_for_pricing: bool(row.contact_for_pricing, false),
      public_status: text(row.public_status) ?? "active", updated_at: new Date().toISOString(),
    });
    await updateOrInsert(publicCatalog, "catalog_price_schedules", record, {
      [targetColumn]: target.id, schedule_name: record.schedule_name, starts_at: record.starts_at,
    });
  }

  for (const row of rows(catalogRows, "Internal Pricing")) {
    const itemType = slug(row.item_type);
    const itemSlug = slug(row.item_slug);
    if (!itemType && !itemSlug) continue;
    if (!itemType || !itemSlug) throw new Error("Internal Pricing row has only one of item_type/item_slug.");
    const target = targetFor(itemType, itemSlug);
    const targetColumn = `${target.type}_id`;
    const tierDetails = [
      text(row.price_tier) && `Tier: ${text(row.price_tier)}`,
      number(row.minimum_quantity) !== null && `Minimum quantity: ${number(row.minimum_quantity)}`,
      number(row.maximum_quantity) !== null && `Maximum quantity: ${number(row.maximum_quantity)}`,
      text(row.freight_terms) && `Freight: ${text(row.freight_terms)}`,
      text(row.effective_or_availability) && `Effective/availability: ${text(row.effective_or_availability)}`,
      text(row.private_notes),
    ].filter(Boolean).join("\n");
    const record = compact({
      product_id: null, variant_id: null, option_id: null, package_id: null, service_id: null, product_service_id: null,
      [targetColumn]: target.id, supplier_name: text(row.source_document), supplier_sku: null,
      dealer_cost_cents: cents(row, "cost_cents", "dealer_or_internal_cost_dollars"), internal_price_cents: null,
      target_margin_basis_points: null, supplier_notes: text(row.freight_terms), private_notes: tierDetails || null,
      starts_at: null, ends_at: null, updated_at: new Date().toISOString(),
    });
    await updateOrInsert(privateCatalog, "catalog_internal_pricing", record, {
      [targetColumn]: target.id, supplier_name: record.supplier_name, private_notes: record.private_notes,
    });
    summary.internalPricing++;
  }

  // Sources lacks target_type/item_slug, source_url, and source_kind, so it cannot safely map to catalog_source_targets.
  const sourceRowsSkipped = rows(catalogRows, "Sources").length;
  if (sourceRowsSkipped) console.warn(`Skipped ${sourceRowsSkipped} Sources rows: the sheet does not identify a catalog target or source URL.`);

  const testimonialRows = rows(catalogRows, "Testimonials");
  for (const row of testimonialRows) {
    const approved = text(row.permission_status) === "approved" && text(row.public_status) === "active";
    const demo = /demo|sample|placeholder/i.test([row.testimonial_slug, row.customer_display_name, row.testimonial_text].map(text).join(" "));
    if (!approved || demo) summary.skippedTestimonials++;
    else throw new Error("Approved testimonial import is not mapped because this workbook version did not contain a Testimonials sheet during development.");
  }

  console.log("\nCatalog import complete");
  console.table({
    "Products imported": summary.products, "Variants imported": summary.variants,
    "Options imported (including Accessories)": summary.options, "Packages imported": summary.packages,
    "Services imported": summary.services, "Service payment options imported": summary.servicePaymentOptions,
    "Product pages imported": summary.productPages, "Media records imported": summary.media,
    "Internal pricing records imported": summary.internalPricing,
    "Testimonials skipped (demo/unapproved)": summary.skippedTestimonials,
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error("Catalog import failed:", error instanceof Error ? error.message : error);
    if (String(error).includes("schema") || String(error).includes("permission denied")) {
      console.error("Ensure catalog_private is exposed to the Data API for service_role only and has the required service_role grants.");
    }
    process.exitCode = 1;
  });
}
