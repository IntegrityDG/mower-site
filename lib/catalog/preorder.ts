import type { CatalogResponse, CatalogVariant } from "./types";

export type PurchaseState = "available" | "preorder" | "coming_soon" | "unavailable";
export type PreorderAuthorizationRow = {
  public_status: string;
  preorder_enabled?: boolean;
  sale_starts_at: string | null;
  sale_ends_at: string | null;
};

/** Authorization uses the base variant's bounded window, independently of price schedules. */
export function catalogPurchaseState(row: PreorderAuthorizationRow, now = Date.now()): PurchaseState {
  if (row.public_status === "active") return "available";
  if (row.public_status !== "coming_soon") return "unavailable";
  const start = row.sale_starts_at ? Date.parse(row.sale_starts_at) : NaN;
  const end = row.sale_ends_at ? Date.parse(row.sale_ends_at) : NaN;
  return row.preorder_enabled === true && Number.isFinite(start) && Number.isFinite(end) &&
    start < end && now >= start && now < end ? "preorder" : "coming_soon";
}

export function catalogVariantAvailability(row: PreorderAuthorizationRow, now = Date.now()) {
  const purchaseState = catalogPurchaseState(row, now);
  return {
    publicStatus: row.public_status === "active" ? "active" as const :
      row.public_status === "coming_soon" ? "coming_soon" as const : "unavailable" as const,
    isAvailable: purchaseState === "available" || purchaseState === "preorder",
    purchaseState,
    preorderEnabled: row.preorder_enabled === true,
    preorderStartsAt: row.sale_starts_at,
    preorderEndsAt: row.sale_ends_at,
  };
}

export const PREORDER_BADGE = "Early Access / Pre-Order";
export const PREORDER_ITEM_SUFFIX = "Early Access Pre-Order";
export const PREORDER_FULFILLMENT_NOTICE = "IDS will coordinate fulfillment when manufacturer inventory becomes available. Fulfillment timing is subject to manufacturer availability.";

export function preorderItemName(name: string, isPreorder: boolean) {
  return isPreorder ? `${name} — ${PREORDER_ITEM_SUFFIX}` : name;
}

export function preorderCustomerNotice(core: Pick<CatalogVariant, "name" | "purchaseState" | "preorderEndsAt">) {
  if (core.purchaseState !== "preorder") return null;
  const end = core.preorderEndsAt ? Date.parse(core.preorderEndsAt) : NaN;
  const through = Number.isFinite(end) ? ` Early Access pricing is available through ${new Intl.DateTimeFormat("en-US", {
    month: "long", day: "numeric", year: "numeric", timeZone: "America/Chicago",
  }).format(new Date(end - 1))}.` : "";
  return `${core.name} is currently available through Early Access as a pre-order.${through} Fulfillment timing is subject to manufacturer availability.`;
}

/** Delay relative to a fresh server projection; refresh open builders at authorization boundaries. */
export function nextPreorderBoundaryDelay(catalog: CatalogResponse, now = Date.parse(catalog.generatedAt)) {
  const boundaries = catalog.products.flatMap((product) => product.variants
    .filter((variant) => variant.preorderEnabled && variant.publicStatus === "coming_soon")
    .flatMap((variant) => [variant.preorderStartsAt, variant.preorderEndsAt])
    .map((at) => at ? Date.parse(at) : NaN))
    .filter((at) => Number.isFinite(at) && at > now);
  return boundaries.length ? Math.min(Math.min(...boundaries) - now, 2_147_483_647) : null;
}
