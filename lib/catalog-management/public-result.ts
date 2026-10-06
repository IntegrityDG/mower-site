import type { CatalogPrice, CatalogResponse } from "@/lib/catalog/types";
import { yarboCorePrice } from "@/lib/catalog/yarbo-core";
import type { ManagedKind } from "./types";

/** Reuse the public projection after an Admin catalog write, including explicit NULL. */
export function managedCustomerPrice(kind: ManagedKind, id: string, catalog: CatalogResponse) {
  let price: CatalogPrice | null = null;
  for (const product of catalog.products) {
    if (kind === "products" && product.id === id) {
      const y40 = product.variants.find((core) => core.slug === "yarbo-y40");
      price = product.slug === "yarbo" ? y40 ? yarboCorePrice(product, y40) : null : product;
    } else if (kind === "variants") {
      const variant = product.variants.find((item) => item.id === id);
      if (variant) price = product.slug === "yarbo" ? yarboCorePrice(product, variant) : variant;
    } else if (kind === "packages") {
      const pkg = product.packages.find((item) => item.id === id);
      if (pkg) {
        const y40 = product.variants.find((core) => core.slug === "yarbo-y40");
        price = product.slug === "yarbo" ? y40 ? yarboCorePrice(product, y40, pkg) : null : pkg;
      }
    } else if (kind === "options") {
      price = [...product.ungroupedOptions, ...product.optionGroups.flatMap((group) => group.options)].find((item) => item.id === id) ?? price;
    }
  }
  return price && price.showPublicPrice && !price.contactForPricing ? price.currentPriceCents : null;
}
