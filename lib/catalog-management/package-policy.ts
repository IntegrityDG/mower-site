import { catalogProductRequiresQuote } from "@/lib/catalog/sales-mode";
import type { ComponentKind } from "./types";
import { CatalogManagementError } from "./validation";

const nonPhysicalProductFamilies = new Set(["lymow-one-plus", "ids-aftermarket"]);

/** Match the existing checkout sales-channel policy, without inferring prices. */
export function packageProductIsQuoteOnly(product: { slug: string; brand: string }) {
  return catalogProductRequiresQuote(product);
}

export function packageComponentIsSelectable(item: {
  kind: ComponentKind; slug: string; productSlug: string; brand: string;
  category?: string; retiredAt?: string | null; parentRetiredAt?: string | null;
}, logicalYarboCoreExists: boolean) {
  if (item.retiredAt || item.parentRetiredAt || item.category === "catalog_family") return false;
  if (item.kind === "products" && nonPhysicalProductFamilies.has(item.slug)) return false;
  if (packageProductIsQuoteOnly({ slug: item.productSlug, brand: item.brand })) return false;
  return !(logicalYarboCoreExists && item.kind === "variants" && item.productSlug === "yarbo" && ["yarbo-y40", "yarbo-y40p"].includes(item.slug));
}

type PolicyRow = Record<string, unknown>;
export function assertSelfServicePackageComponents(
  records: { component: { kind: ComponentKind }; row: PolicyRow }[],
  parents: Map<string, PolicyRow>,
) {
  for (const { component, row } of records) {
    if (component.kind === "products" && nonPhysicalProductFamilies.has(String(row.slug))) {
      throw new CatalogManagementError(row.slug === "lymow-one-plus"
        ? "Lymow One Plus is a configuration family. Select its actual 5A or 10A variant as the package component."
        : "The aftermarket catalog is a listing container. Select its actual sellable accessories as package components.");
    }
    const parent = component.kind === "products" ? row : parents.get(String(row.product_id));
    if (!parent || parent.retired_at) throw new CatalogManagementError("A package component parent is missing or retired.");
    if (packageProductIsQuoteOnly({ slug: String(parent.slug), brand: String(parent.brand) })) {
      throw new CatalogManagementError(`${String(row.name ?? parent.name ?? "This item")} is quote-only and cannot be included in a self-service package. Use the existing quote or Custom Invoice workflow.`);
    }
  }
}
