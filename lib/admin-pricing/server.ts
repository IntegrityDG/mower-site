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

function effective(values: Record<string, unknown>) {
  const regular = (values.regular_price_cents ??
    values.override_regular_price_cents) as number | null | undefined;
  const sale = (values.sale_price_cents ??
    values.override_sale_price_cents) as number | null | undefined;
  const starts = (values.sale_starts_at ??
    values.override_sale_starts_at) as string | null | undefined;
  const ends = (values.sale_ends_at ??
    values.override_sale_ends_at) as string | null | undefined;

  const now = Date.now();
  const active =
    sale !== null &&
    sale !== undefined &&
    (!starts || new Date(starts).getTime() <= now) &&
    (!ends || new Date(ends).getTime() >= now);

  return active ? sale : regular ?? null;
}

function basePriceRow(
  kind: PricingKind,
  row: Record<string, unknown>,
): SchedulePriceRow {
  if (kind === "product-services") {
    return {
      regular_price_cents: row.override_regular_price_cents as number | null,
      sale_price_cents: row.override_sale_price_cents as number | null,
      sale_starts_at: row.override_sale_starts_at as string | null,
      sale_ends_at: row.override_sale_ends_at as string | null,
      promotion_label: row.override_promotion_label as string | null,
      show_public_price: row.override_show_public_price as boolean | undefined,
      contact_for_pricing:
        row.override_contact_for_pricing as boolean | undefined,
    };
  }

  return row as unknown as SchedulePriceRow;
}

type Maps = {
  products: Map<string, string>;
  variants: Map<string, string>;
  options: Map<string, string>;
  packages: Map<string, string>;
  services: Map<string, string>;
  productServices: Map<string, string>;
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

      return (
        typeof row.dealer_cost_cents === "number" &&
        (start === null || start <= now) &&
        (end === null || end >= now)
      );
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
): PricingItem {
  const productId = String(row.product_id ?? "");
  const product = maps.products.get(productId) ?? null;

  const names: Record<PricingKind, unknown> = {
    products: row.name,
    variants: row.name,
    packages: row.package_name,
    options: row.name,
    services: row.name,
    "service-payment-options": row.payment_option_name,
    "product-services": `${maps.products.get(productId) ?? "Product"} ? ${maps.services.get(String(row.service_id ?? "")) ?? "Service"}`,
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

  return {
    id: String(row.id),
    kind,
    category: category[kind],
    name: String(names[kind] ?? "Unnamed"),
    slug: slugValue,
    brand: kind === "products" ? String(row.brand ?? "") || null : null,
    productName: product,
    publicStatus:
      typeof row.public_status === "string" ? row.public_status : null,
    availabilityField,
    availabilityStatus,
    isAvailable: availabilityStatus === "active",
    quoteOnly:
      (kind === "products" && slugValue === "pandag-g1") ||
      product?.toLowerCase().includes("pandag") === true,
    targetLabel,
    values,
    effectivePriceCents: effective(
      applyActivePriceSchedule(basePriceRow(kind, row), activeSchedule),
    ),
    activeScheduleName: activeSchedule?.schedule_name ?? null,

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
        );
      }),
    ),
  };
}

export async function updatePricingRecord(
  kind: PricingKind,
  id: string,
  values: Record<string, unknown>,
): Promise<PricingItem> {
  const client = getSupabaseServiceClient();

  const { error } = await client
    .from(tables[kind])
    .update({
      ...values,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw error;

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
    .select(editablePricingFields[kind].join(","))
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
