import "server-only";
import { getSupabaseServiceClient } from "@/lib/supabase";
import type {
  PricingCatalog,
  PricingItem,
  PricingKind,
  PricingMessageContext,
  PricingPromotionMessage,
} from "./types";
import { editablePricingFields } from "./validation";
import {
  applyActivePriceSchedule,
  selectActivePriceSchedule,
  type ActivePriceSchedule,
  type PriceScheduleTarget,
  type SchedulePriceRow,
} from "@/lib/catalog/active-price-schedule";
import { sellingPriceDecision } from "@/lib/pricing-program/policy";
import { isWithinPriceWindow } from "@/lib/pricing-program/window";
import { readPricingProgramSettingsFailSafe } from "@/lib/pricing-program/server";
import { salesModeForProductSlug } from "@/lib/catalog/sales-mode";

const tables: Record<PricingKind, string> = {
  products: "catalog_products",
  variants: "catalog_product_variants",
  packages: "catalog_packages",
  options: "catalog_options",
  services: "catalog_services",
  "service-payment-options": "catalog_service_payment_options",
  "product-services": "catalog_product_services",
  schedules: "catalog_price_schedules",
};

const category: Record<PricingKind, string> = {
  products: "Equipment",
  variants: "Product Variants",
  packages: "Packages",
  options: "Modules / Options",
  services: "Services",
  "service-payment-options": "Service Payment Options",
  "product-services": "Product-Service Overrides",
  schedules: "Price Schedules",
};

const EMPTY_MESSAGE: PricingPromotionMessage = {
  message: null,
  imagePath: null,
  isPublic: false,
};

function basePriceRow(
  kind: PricingKind,
  row: Record<string, unknown>,
  maps: Maps,
): SchedulePriceRow {
  if (kind === "product-services") {
    const service = maps.serviceRows.get(String(row.service_id ?? ""));
    return {
      regular_price_cents: (row.override_regular_price_cents ?? service?.regular_price_cents ?? null) as number | null,
      sale_price_cents: (row.override_sale_price_cents ?? service?.sale_price_cents ?? null) as number | null,
      sale_starts_at: (row.override_sale_starts_at ?? service?.sale_starts_at ?? null) as string | null,
      sale_ends_at: (row.override_sale_ends_at ?? service?.sale_ends_at ?? null) as string | null,
      promotion_label: (row.override_promotion_label ?? service?.promotion_label ?? null) as string | null,
      show_public_price: (row.override_show_public_price ?? service?.show_public_price ?? true) as boolean,
      contact_for_pricing: (row.override_contact_for_pricing ?? service?.contact_for_pricing ?? false) as boolean,
    };
  }

  if (kind === "schedules") {
    return {
      regular_price_cents: row.regular_price_cents as number | null,
      sale_price_cents: row.sale_price_cents as number | null,
      sale_starts_at: row.starts_at as string | null,
      sale_ends_at: row.ends_at as string | null,
      promotion_label: row.promotion_label as string | null,
      show_public_price: row.show_public_price as boolean | undefined,
      contact_for_pricing: row.contact_for_pricing as boolean | undefined,
    };
  }

  return row as unknown as SchedulePriceRow;
}

type Maps = {
  products: Map<string, string>;
  productBrands: Map<string, string>;
  productSlugs: Map<string, string>;
  variants: Map<string, string>;
  options: Map<string, string>;
  packages: Map<string, string>;
  services: Map<string, string>;
  productServices: Map<string, string>;
  serviceRows: Map<string, Record<string, unknown>>;
  targetProductIds: Map<string, string>;
};

type ActivePromotionalCost = {
  dealerCostCents: number;
  startsAt: string | null;
  endsAt: string | null;
};

function targetKey(kind: PricingKind, id: string) {
  return `${kind}:${id}`;
}

function targetKeyFromPrivateRow(
  row: Record<string, unknown>,
): string | null {
  const mappings = [
    ["product_id", "products"],
    ["variant_id", "variants"],
    ["option_id", "options"],
    ["package_id", "packages"],
    ["service_id", "services"],
    ["service_payment_option_id", "service-payment-options"],
    ["product_service_id", "product-services"],
    ["price_schedule_id", "schedules"],
  ] as const;

  for (const [column, kind] of mappings) {
    if (row[column]) return targetKey(kind, String(row[column]));
  }

  return null;
}

function activePromotionalCost(
  rows: Record<string, unknown>[],
  now = Date.now(),
): ActivePromotionalCost | null {
  const active = rows
    .filter((row) => {
      const start =
        typeof row.starts_at === "string"
          ? new Date(row.starts_at).getTime()
          : null;
      const end =
        typeof row.ends_at === "string"
          ? new Date(row.ends_at).getTime()
          : null;

      return typeof row.dealer_cost_cents === "number" &&
        isWithinPriceWindow({
          startsAt: start === null ? null : new Date(start).toISOString(),
          endsAt: end === null ? null : new Date(end).toISOString(),
        }, now);
    })
    .sort((a, b) => {
      const aStart =
        typeof a.starts_at === "string"
          ? new Date(a.starts_at).getTime()
          : Number.NEGATIVE_INFINITY;
      const bStart =
        typeof b.starts_at === "string"
          ? new Date(b.starts_at).getTime()
          : Number.NEGATIVE_INFINITY;
      return bStart - aStart;
    })[0];

  if (!active || typeof active.dealer_cost_cents !== "number") {
    return null;
  }

  return {
    dealerCostCents: active.dealer_cost_cents,
    startsAt: typeof active.starts_at === "string" ? active.starts_at : null,
    endsAt: typeof active.ends_at === "string" ? active.ends_at : null,
  };
}

function rowToItem(
  kind: PricingKind,
  row: Record<string, unknown>,
  maps: Maps,
  activeSchedule: ActivePriceSchedule | null,
  normalDealerCostCents: number | null,
  promotionalCost: ActivePromotionalCost | null,
  idsPriceMessage: PricingPromotionMessage,
  salePriceMessage: PricingPromotionMessage,
  everydayLowPriceEnabled: boolean,
  now: number,
): PricingItem {
  const relationProductId = String(row.product_id ?? "");
  const scheduleTargetProductId = kind === "schedules"
    ? relationProductId || (["variant", "option", "package", "product_service"] as const)
      .map((target) => row[`${target}_id`] ? maps.targetProductIds.get(`${target}:${String(row[`${target}_id`])}`) : null)
      .find(Boolean) || ""
    : "";
  const ownProductId = kind === "products" ? String(row.id) : relationProductId || scheduleTargetProductId;
  const product = maps.products.get(ownProductId) ?? null;
  const productSlug = kind === "products"
    ? String(row.slug ?? "") || null
    : maps.productSlugs.get(ownProductId) ?? null;
  const brand = kind === "products"
    ? String(row.brand ?? "") || null
    : maps.productBrands.get(ownProductId) ?? null;

  const names: Record<PricingKind, unknown> = {
    products: row.name,
    variants: row.name,
    packages: row.package_name,
    options: row.name,
    services: row.name,
    "service-payment-options": row.payment_option_name,
    "product-services": `${maps.products.get(ownProductId) ?? "Product"} / ${maps.services.get(String(row.service_id ?? "")) ?? "Service"}`,
    schedules: row.schedule_name,
  };

  const slugs: Record<PricingKind, unknown> = {
    products: row.slug,
    variants: row.variant_slug,
    packages: row.package_slug,
    options: row.option_slug,
    services: row.service_slug,
    "service-payment-options": row.payment_option_slug,
    "product-services": row.id,
    schedules: row.id,
  };

  let targetLabel: string | null = null;

  if (kind === "schedules") {
    for (const [column, map] of [
      ["product_id", maps.products],
      ["variant_id", maps.variants],
      ["option_id", maps.options],
      ["package_id", maps.packages],
      ["service_id", maps.services],
      ["product_service_id", maps.productServices],
    ] as const) {
      if (row[column]) {
        targetLabel = map.get(String(row[column])) ?? String(row[column]);
      }
    }
  }

  const values = Object.fromEntries(
    Object.entries(row).filter(
      ([key, item]) =>
        !["id", "created_at", "updated_at"].includes(key) &&
        (item === null ||
          ["string", "number", "boolean"].includes(typeof item)),
    ),
  ) as Record<string, string | number | boolean | null>;

  const slugValue = String(slugs[kind] ?? "");
  const availabilityField =
    kind === "service-payment-options" || kind === "product-services"
      ? "is_available"
      : "public_status";

  const availabilityStatus =
    availabilityField === "is_available"
      ? row.is_available === true
        ? "active"
        : "unavailable"
      : typeof row.public_status === "string"
        ? row.public_status
        : "unavailable";

  const effectiveDealerCostCents =
    promotionalCost?.dealerCostCents ?? normalDealerCostCents;

  const rawPriceRow = basePriceRow(kind, row, maps);
  const appliedPriceRow = applyActivePriceSchedule(rawPriceRow, activeSchedule);
  const service = kind === "product-services"
    ? maps.serviceRows.get(String(row.service_id ?? ""))
    : null;
  const displayMsrpPriceCents = (kind === "product-services"
    ? row.override_display_msrp_price_cents ?? service?.display_msrp_price_cents
    : row.display_msrp_price_cents) as number | null | undefined;
  const decision = sellingPriceDecision({
    ...appliedPriceRow,
    display_msrp_price_cents: displayMsrpPriceCents ?? null,
  }, everydayLowPriceEnabled, now);
  const quoteOnly = productSlug ? salesModeForProductSlug(productSlug) === "quote_only" : false;
  const showPublicPrice = appliedPriceRow.show_public_price !== false;
  const contactForPricing = appliedPriceRow.contact_for_pricing === true;
  const isLymowParent = kind === "products" && productSlug === "lymow-one-plus";
  const isY40Variant = kind === "variants" && String(row.variant_slug ?? "") === "yarbo-y40";
  const scheduleIsActive = kind !== "schedules" || row.public_status === "active" && isWithinPriceWindow({ startsAt: row.starts_at as string | null, endsAt: row.ends_at as string | null }, now);
  const customerPriceCents = quoteOnly || contactForPricing || !showPublicPrice || availabilityStatus === "hidden" || isLymowParent || isY40Variant || !scheduleIsActive
    ? null
    : decision.priceCents;
  const scheduleTargetsCheckout = kind === "schedules" && ["product_id", "variant_id", "option_id", "package_id"].some((key) => Boolean(row[key]));
  const checkoutApplicable = (["products", "variants", "packages", "options"].includes(kind) || scheduleTargetsCheckout) &&
    !quoteOnly && !contactForPricing && showPublicPrice && !isLymowParent && !isY40Variant && availabilityStatus === "active";
  const checkoutPriceCents = checkoutApplicable ? decision.priceCents : null;

  const storedAtLabel = kind === "products" && productSlug === "yarbo"
    ? "Y40 Core base product pricing"
    : kind === "variants" && productSlug === "lymow-one-plus"
      ? "Lymow configuration variant pricing"
      : kind === "variants" && String(row.variant_slug ?? "") === "yarbo-y40p"
        ? "Y40P Core variant pricing"
        : kind === "variants" && String(row.variant_slug ?? "") === "yarbo-y40"
          ? "Y40 catalog variant (Y40 checkout uses the base product)"
          : kind === "packages" && productSlug === "yarbo"
            ? "Y40 package pricing"
            : kind === "packages"
              ? "Package pricing"
              : kind === "options"
                ? "Module / accessory pricing"
                : kind === "services"
                  ? "Base service pricing"
                  : kind === "service-payment-options"
                    ? "Service payment option pricing"
                    : kind === "product-services"
                      ? "Product-service override pricing"
                      : kind === "schedules"
                        ? "Price schedule"
                        : "Base product pricing";

  let effectiveSource: PricingItem["effectiveSource"] = decision.source;
  let effectiveSourceLabel = decision.source === "temporary_sale"
    ? "Temporary Sale"
    : decision.source === "ids_everyday"
      ? "IDS Everyday Low Price"
      : decision.source === "manufacturer_msrp"
        ? "Manufacturer MSRP"
        : "No priced source";
  let effectiveExplanation = `${storedAtLabel} currently controls this amount.`;

  if (activeSchedule) {
    effectiveSource = "active_schedule";
    effectiveSourceLabel = `Active schedule: ${activeSchedule.schedule_name ?? "Unnamed schedule"}`;
    effectiveExplanation = `The active price schedule “${activeSchedule.schedule_name ?? "Unnamed schedule"}” overrides this record until its window ends or the schedule is disabled.`;
  }
  if (kind === "schedules") {
    effectiveSource = scheduleIsActive ? "active_schedule" : "unpriced";
    effectiveSourceLabel = scheduleIsActive ? "Active Price Schedule" : "Inactive schedule";
    effectiveExplanation = scheduleIsActive
      ? `This schedule currently overrides ${targetLabel ?? "its catalog target"}.`
      : `This schedule is not currently active and does not override ${targetLabel ?? "its catalog target"}.`;
  }
  if (isLymowParent) {
    effectiveSource = "unpriced";
    effectiveSourceLabel = "Lymow variants control customer price";
    effectiveExplanation = "Lymow customer and checkout pricing comes from the selected 5A or 10A variant. Editing this parent product does not change those configuration prices.";
  } else if (isY40Variant) {
    effectiveSource = "unpriced";
    effectiveSourceLabel = "Y40 base product controls checkout";
    effectiveExplanation = "The Y40 Core customer and checkout amount comes from the Yarbo base product row, not this catalog variant row.";
  } else if (quoteOnly) {
    effectiveSource = "quote_only";
    effectiveSourceLabel = "Quote Only";
    effectiveExplanation = "This product is quote-only, so stored catalog amounts are not presented as live customer checkout prices.";
  } else if (contactForPricing) {
    effectiveSource = "contact_for_pricing";
    effectiveSourceLabel = "Contact for Pricing";
    effectiveExplanation = "Contact for Pricing suppresses the amount from customer display and self-service checkout.";
  } else if (!showPublicPrice) {
    effectiveSource = "hidden_price";
    effectiveSourceLabel = "Public price hidden";
    effectiveExplanation = "Show Public Price is off, so the stored amount is not shown to customers.";
  } else if (availabilityStatus === "hidden") {
    effectiveSource = "hidden_price";
    effectiveSourceLabel = "Catalog record hidden";
    effectiveExplanation = "This catalog record is hidden, so its stored amount is not shown to customers.";
  }

  return {
    id: String(row.id),
    kind,
    category: category[kind],
    name: String(names[kind] ?? "Unnamed"),
    slug: slugValue,
    brand,
    productName: product,
    productId: ownProductId || null,
    productSlug,
    sku: typeof row.sku === "string" ? row.sku : null,
    publicStatus:
      typeof row.public_status === "string" ? row.public_status : null,
    availabilityField,
    availabilityStatus,
    isAvailable: availabilityStatus === "active",
    quoteOnly,
    targetLabel,
    values,
    effectivePriceCents: customerPriceCents,
    checkoutPriceCents,
    effectiveSource,
    effectiveSourceLabel,
    effectiveExplanation,
    storedAtLabel,
    saleState: decision.saleState,
    pricingProgramEnabled: everydayLowPriceEnabled,
    activeScheduleName: activeSchedule?.schedule_name ?? null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : "",

    dealerCostCents: effectiveDealerCostCents,
    normalDealerCostCents,
    promotionalDealerCostCents:
      promotionalCost?.dealerCostCents ?? null,
    promotionalDealerCostStartsAt: promotionalCost?.startsAt ?? null,
    promotionalDealerCostEndsAt: promotionalCost?.endsAt ?? null,

    idsPriceMessage,
    salePriceMessage,
  };
}

export async function readPricingCatalog(): Promise<PricingCatalog> {
  const client = getSupabaseServiceClient();

  const entries = await Promise.all(
    (Object.entries(tables) as [PricingKind, string][]).map(
      async ([kind, table]) => {
        const { data, error } = await client.from(table).select("*");
        if (error) throw error;

        return [
          kind,
          (data ?? []) as Record<string, unknown>[],
        ] as const;
      },
    ),
  );

  const byKind = new Map(entries);
  const privateClient = client.schema("catalog_private");

  const [
    privatePricingResult,
    promotionalCostsResult,
    messagesResult,
    pricingProgram,
  ] = await Promise.all([
    privateClient
      .from("catalog_internal_pricing")
      .select(
        "product_id,variant_id,option_id,package_id,service_id,product_service_id,dealer_cost_cents,updated_at",
      ),

    privateClient
      .from("catalog_promotional_dealer_costs")
      .select(
        "product_id,variant_id,option_id,package_id,service_id,product_service_id,dealer_cost_cents,starts_at,ends_at,created_at",
      ),

    privateClient
      .from("catalog_price_messages")
      .select(
        "product_id,variant_id,option_id,package_id,service_id,service_payment_option_id,product_service_id,price_schedule_id,price_context,message,image_path,is_public",
      ),
    readPricingProgramSettingsFailSafe(),
  ]);

  if (privatePricingResult.error) throw privatePricingResult.error;
  if (promotionalCostsResult.error) throw promotionalCostsResult.error;
  if (messagesResult.error) throw messagesResult.error;

  const normalCostByTarget = new Map<string, number | null>();

  for (const row of (privatePricingResult.data ?? []) as Record<
    string,
    unknown
  >[]) {
    const mappings = [
      ["product_id", "products"],
      ["variant_id", "variants"],
      ["option_id", "options"],
      ["package_id", "packages"],
      ["service_id", "services"],
      ["product_service_id", "product-services"],
    ] as const;

    for (const [column, kind] of mappings) {
      if (row[column]) {
        normalCostByTarget.set(
          targetKey(kind, String(row[column])),
          typeof row.dealer_cost_cents === "number"
            ? row.dealer_cost_cents
            : null,
        );
      }
    }
  }

  const promotionalRowsByTarget = new Map<
    string,
    Record<string, unknown>[]
  >();

  for (const row of (promotionalCostsResult.data ?? []) as Record<
    string,
    unknown
  >[]) {
    const key = targetKeyFromPrivateRow(row);
    if (!key) continue;

    const rows = promotionalRowsByTarget.get(key) ?? [];
    rows.push(row);
    promotionalRowsByTarget.set(key, rows);
  }

  const activePromotionalCostByTarget = new Map<
    string,
    ActivePromotionalCost
  >();

  for (const [key, rows] of promotionalRowsByTarget.entries()) {
    const cost = activePromotionalCost(rows);
    if (cost) activePromotionalCostByTarget.set(key, cost);
  }

  const messagesByTarget = new Map<
    string,
    Partial<Record<"ids" | "sale", PricingPromotionMessage>>
  >();

  for (const row of (messagesResult.data ?? []) as Record<
    string,
    unknown
  >[]) {
    const key = targetKeyFromPrivateRow(row);
    const context = row.price_context;

    if (
      !key ||
      (context !== "ids" && context !== "sale")
    ) {
      continue;
    }

    const current = messagesByTarget.get(key) ?? {};

    current[context] = {
      message:
        typeof row.message === "string" ? row.message : null,
      imagePath:
        typeof row.image_path === "string" ? row.image_path : null,
      isPublic: row.is_public === true,
    };

    messagesByTarget.set(key, current);
  }

  const makeMap = (
    kind: PricingKind,
    label: (row: Record<string, unknown>) => string,
  ) =>
    new Map(
      (byKind.get(kind) ?? []).map((row) => [
        String(row.id),
        label(row),
      ]),
    );

  const products = makeMap(
    "products",
    (row) => `${row.brand} ${row.name}`,
  );

  const services = makeMap(
    "services",
    (row) => String(row.name),
  );

  const maps: Maps = {
    products,
    productBrands: new Map(
      (byKind.get("products") ?? []).map((row) => [String(row.id), String(row.brand ?? "")]),
    ),
    productSlugs: new Map(
      (byKind.get("products") ?? []).map((row) => [String(row.id), String(row.slug ?? "")]),
    ),
    variants: makeMap("variants", (row) => String(row.name)),
    options: makeMap("options", (row) => String(row.name)),
    packages: makeMap(
      "packages",
      (row) => String(row.package_name),
    ),
    services,
    productServices: makeMap(
      "product-services",
      (row) =>
        `${products.get(String(row.product_id)) ?? "Product"} ? ${services.get(String(row.service_id)) ?? "Service"}`,
    ),
    serviceRows: new Map(
      (byKind.get("services") ?? []).map((row) => [String(row.id), row]),
    ),
    targetProductIds: new Map(
      (["variants", "options", "packages", "product-services"] as const).flatMap((targetKind) =>
        (byKind.get(targetKind) ?? []).map((row) => [
          `${targetKind === "product-services" ? "product_service" : targetKind.slice(0, -1)}:${String(row.id)}`,
          String(row.product_id ?? ""),
        ] as const),
      ),
    ),
  };

  const schedules = (byKind.get("schedules") ??
    []) as unknown as ActivePriceSchedule[];

  const targets: Partial<Record<PricingKind, PriceScheduleTarget>> = {
    products: "product",
    variants: "variant",
    packages: "package",
    options: "option",
    services: "service",
    "product-services": "product_service",
  };

  const now = Date.now();

  return {
    items: entries.flatMap(([kind, rows]) =>
      rows.map((row) => {
        const id = String(row.id);
        const key = targetKey(kind, id);
        const target = targets[kind];

        const activeSchedule = target
          ? selectActivePriceSchedule(
              schedules,
              target,
              id,
              now,
            )
          : null;

        const messages = messagesByTarget.get(key);

        return rowToItem(
          kind,
          row,
          maps,
          activeSchedule,
          normalCostByTarget.get(key) ?? null,
          activePromotionalCostByTarget.get(key) ?? null,
          messages?.ids ?? { ...EMPTY_MESSAGE },
          messages?.sale ?? { ...EMPTY_MESSAGE },
          pricingProgram.everydayLowPriceEnabled,
          now,
        );
      }),
    ),
  };
}

export async function updatePricingRecord(
  kind: PricingKind,
  id: string,
  values: Record<string, unknown>,
  expectedUpdatedAt: string,
): Promise<PricingItem> {
  const client = getSupabaseServiceClient();

  const { data, error } = await client
    .from(tables[kind])
    .update({
      ...values,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("updated_at", expectedUpdatedAt)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Pricing record changed after you opened it. Reload the item and review the newer values before saving.");

  const catalog = await readPricingCatalog();
  const item = catalog.items.find(
    (candidate) =>
      candidate.kind === kind && candidate.id === id,
  );

  if (!item) throw new Error("Pricing record not found.");

  return item;
}

export async function readPricingRecordValues(
  kind: PricingKind,
  id: string,
) {
  const client = getSupabaseServiceClient();

  const { data, error } = await client
    .from(tables[kind])
    .select([...editablePricingFields[kind], "updated_at"].join(","))
    .eq("id", id)
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  return data as Record<string, unknown> | null;
}


const priceMessageTargetColumns: Record<PricingKind, string> = {
  products: "product_id",
  variants: "variant_id",
  packages: "package_id",
  options: "option_id",
  services: "service_id",
  "service-payment-options": "service_payment_option_id",
  "product-services": "product_service_id",
  schedules: "price_schedule_id",
};

export async function updatePricingPromotionMessage(
  kind: PricingKind,
  id: string,
  context: PricingMessageContext,
  values: {
    message: string | null;
    isPublic: boolean;
  },
): Promise<PricingItem> {
  const client = getSupabaseServiceClient();
  const privateClient = client.schema("catalog_private");
  const targetColumn = priceMessageTargetColumns[kind];
  const now = new Date().toISOString();

  const { data: existing, error: existingError } = await privateClient
    .from("catalog_price_messages")
    .select("id")
    .eq(targetColumn, id)
    .eq("price_context", context)
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing?.id) {
    const { error } = await privateClient
      .from("catalog_price_messages")
      .update({
        message: values.message,
        is_public: values.isPublic,
        updated_at: now,
      })
      .eq("id", existing.id);

    if (error) throw error;
  } else {
    const { error } = await privateClient
      .from("catalog_price_messages")
      .insert({
        [targetColumn]: id,
        price_context: context,
        message: values.message,
        is_public: values.isPublic,
        created_at: now,
        updated_at: now,
      });

    if (error) throw error;
  }

  const catalog = await readPricingCatalog();

  const item = catalog.items.find(
    (candidate) =>
      candidate.kind === kind &&
      candidate.id === id,
  );

  if (!item) {
    throw new Error("Pricing record not found.");
  }

  return item;
}


export async function updatePricingPromotionImagePath(
  kind: PricingKind,
  id: string,
  context: PricingMessageContext,
  imagePath: string | null,
): Promise<PricingItem> {
  const client = getSupabaseServiceClient();
  const privateClient = client.schema("catalog_private");
  const targetColumn = priceMessageTargetColumns[kind];
  const now = new Date().toISOString();

  const { data: existing, error: existingError } = await privateClient
    .from("catalog_price_messages")
    .select("id")
    .eq(targetColumn, id)
    .eq("price_context", context)
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing?.id) {
    const { error } = await privateClient
      .from("catalog_price_messages")
      .update({
        image_path: imagePath,
        updated_at: now,
      })
      .eq("id", existing.id);

    if (error) throw error;
  } else {
    const { error } = await privateClient
      .from("catalog_price_messages")
      .insert({
        [targetColumn]: id,
        price_context: context,
        message: null,
        image_path: imagePath,
        is_public: false,
        created_at: now,
        updated_at: now,
      });

    if (error) throw error;
  }

  const catalog = await readPricingCatalog();

  const item = catalog.items.find(
    (candidate) =>
      candidate.kind === kind &&
      candidate.id === id,
  );

  if (!item) {
    throw new Error("Pricing record not found.");
  }

  return item;
}
