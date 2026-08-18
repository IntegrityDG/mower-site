import type {
  CatalogPrice,
  CatalogPricePromotion,
} from "./types";

export type PublicPromotionContext = "ids" | "sale";

export type PublicPromotionTargetKind =
  | "product"
  | "variant"
  | "option"
  | "package";

export type PublicPromotionRecord = {
  product_id: string | null;
  variant_id: string | null;
  option_id: string | null;
  package_id: string | null;
  price_schedule_id: string | null;
  price_context: string;
  message: string | null;
  image_path: string | null;
  is_public: boolean;
};

function recordKey(
  kind: PublicPromotionTargetKind | "schedule",
  id: string,
  context: PublicPromotionContext,
) {
  return `${kind}:${id}:${context}`;
}

export function buildPublicPromotionMap(
  rows: readonly PublicPromotionRecord[],
) {
  const map = new Map<string, PublicPromotionRecord>();

  for (const row of rows) {
    if (!row.is_public) continue;

    if (
      row.price_context !== "ids" &&
      row.price_context !== "sale"
    ) {
      continue;
    }

    const context = row.price_context;

    if (row.price_schedule_id) {
      map.set(
        recordKey(
          "schedule",
          row.price_schedule_id,
          context,
        ),
        row,
      );
      continue;
    }

    const targets = [
      ["product", row.product_id],
      ["variant", row.variant_id],
      ["option", row.option_id],
      ["package", row.package_id],
    ] as const;

    for (const [kind, id] of targets) {
      if (id) {
        map.set(recordKey(kind, id, context), row);
        break;
      }
    }
  }

  return map;
}

export function activePublicPromotionContext(
  price: CatalogPrice,
): PublicPromotionContext | null {
  if (
    price.contactForPricing ||
    !price.showPublicPrice ||
    price.currentPriceCents === null
  ) {
    return null;
  }

  if (price.saleIsActive) {
    return "sale";
  }

  if (price.everydayLowPriceEnabled !== false) {
    return "ids";
  }

  // IDS Everyday Low Price program is OFF and there is no active sale.
  // Manufacturer/MSRP mode must never display the IDS message.
  return null;
}

function promotionImageUrl(
  kind: PublicPromotionTargetKind,
  id: string,
  context: PublicPromotionContext,
  scheduleId: string | null,
) {
  const params = new URLSearchParams({
    kind,
    id,
    context,
  });

  if (scheduleId) {
    params.set("schedule", scheduleId);
  }

  return `/api/catalog/pricing-promotion-image?${params.toString()}`;
}

export function publicPromotionForPrice(args: {
  price: CatalogPrice;
  kind: PublicPromotionTargetKind;
  id: string;
  scheduleId: string | null;
  promotionMap: Map<string, PublicPromotionRecord>;
}): CatalogPricePromotion | null {
  const {
    price,
    kind,
    id,
    scheduleId,
    promotionMap,
  } = args;

  const context = activePublicPromotionContext(price);

  if (!context) {
    return null;
  }

  const key = scheduleId
    ? recordKey("schedule", scheduleId, context)
    : recordKey(kind, id, context);

  const row = promotionMap.get(key);

  if (!row || !row.is_public) {
    return null;
  }

  const message =
    typeof row.message === "string" &&
    row.message.trim().length > 0
      ? row.message.trim()
      : null;

  const imageUrl = row.image_path
    ? promotionImageUrl(
        kind,
        id,
        context,
        scheduleId,
      )
    : null;

  if (!message && !imageUrl) {
    return null;
  }

  return {
    context,
    message,
    imageUrl,
  };
}
