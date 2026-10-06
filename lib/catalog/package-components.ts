import type { CatalogPackageItem } from "./types";
import { catalogProductRequiresQuote } from "./sales-mode";

export function publicPackageComponentIsAvailable(ownAvailable: boolean,
  parent: { slug: string; brand?: string; public_status: string; retired_at?: string | null } | null | undefined,
  requiredEquipmentAvailable = true) {
  return Boolean(ownAvailable && requiredEquipmentAvailable && parent?.public_status === "active" &&
    !parent.retired_at && !catalogProductRequiresQuote(parent));
}

export function packageComponentName(item: CatalogPackageItem) {
  return item.component?.name ?? item.option?.name ?? "Unavailable catalog item";
}

export function packageComponentKey(item: CatalogPackageItem) {
  return item.id ?? (item.component ? `${item.component.kind}:${item.component.id}` : item.optionId);
}
