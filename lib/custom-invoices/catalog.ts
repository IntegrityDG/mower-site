import "server-only";
import { loadPublicCatalog } from "@/lib/catalog/load-public-catalog";
import { scheduledPublicPrice } from "@/lib/catalog/public-price";
import type { ActivePriceSchedule } from "@/lib/catalog/active-price-schedule";
import { readPricingProgramSettingsFailSafe } from "@/lib/pricing-program/server";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { applyCatalogSnapshots } from "./catalog-snapshot";
import type { CatalogInvoiceReference, InvoiceDraftInput } from "./types";

const warning = (status: string | null, purchaseState: string | null) => status === "coming_soon" || status === "unavailable" || purchaseState === "preorder";

export async function readInvoiceCatalogReferences(): Promise<CatalogInvoiceReference[]> {
  const { products } = await loadPublicCatalog();
  const rows: CatalogInvoiceReference[] = [];
  for (const product of products) {
    rows.push({ id: product.id, sourceType: "product", name: `${product.brand} ${product.name}`, description: product.fullDescription, sku: null, priceCents: product.currentPriceCents, status: product.publicStatus, purchaseState: null, parentId: null, parentName: null, availabilityWarning: warning(product.publicStatus, null) });
    for (const variant of product.variants) rows.push({ id: variant.id, sourceType: "variant", name: `${product.name} / ${variant.name}`, description: variant.description, sku: variant.sku, priceCents: variant.currentPriceCents, status: variant.publicStatus, purchaseState: variant.purchaseState ?? null, parentId: product.id, parentName: product.name, availabilityWarning: warning(variant.publicStatus, variant.purchaseState ?? null) });
    for (const group of product.optionGroups) for (const option of group.options) rows.push({ id: option.id, sourceType: "option", name: `${product.name} / ${option.name}`, description: option.description, sku: null, priceCents: option.currentPriceCents, status: option.publicStatus, purchaseState: null, parentId: product.id, parentName: product.name, availabilityWarning: warning(option.publicStatus, null) });
    for (const option of product.ungroupedOptions) rows.push({ id: option.id, sourceType: "option", name: `${product.name} / ${option.name}`, description: option.description, sku: null, priceCents: option.currentPriceCents, status: option.publicStatus, purchaseState: null, parentId: product.id, parentName: product.name, availabilityWarning: warning(option.publicStatus, null) });
    for (const item of product.packages) {
      if (item.corePrices?.length) for (const corePrice of item.corePrices) {
        const variant = product.variants.find((candidate) => candidate.id === corePrice.coreVariantId);
        rows.push({ id: item.id, sourceType: "package", name: `${product.name} / ${variant?.name ?? "Core"} / ${item.name}`, description: item.description, sku: variant?.sku ?? null, priceCents: corePrice.currentPriceCents, status: corePrice.publicStatus, purchaseState: variant?.purchaseState ?? null, parentId: corePrice.coreVariantId, parentName: variant?.name ?? product.name, availabilityWarning: warning(corePrice.publicStatus, variant?.purchaseState ?? null) });
      } else rows.push({ id: item.id, sourceType: "package", name: `${product.name} / ${item.name}`, description: item.description, sku: null, priceCents: item.currentPriceCents, status: item.publicStatus, purchaseState: null, parentId: product.id, parentName: product.name, availabilityWarning: warning(item.publicStatus, null) });
    }
  }
  const client = getSupabaseServiceClient();
  const [{ data: services, error }, { data: schedules, error: schedulesError }, pricingProgram] = await Promise.all([
    client.from("catalog_services").select("*").neq("public_status", "hidden"),
    client.from("catalog_price_schedules").select("*").eq("public_status", "active").not("service_id", "is", null),
    readPricingProgramSettingsFailSafe(),
  ]);
  if (error || schedulesError) throw new Error("Catalog services are unavailable.");
  const now = Date.now();
  for (const service of services ?? []) {
    const { price } = scheduledPublicPrice(service, (schedules ?? []) as ActivePriceSchedule[], "service", service.id, now, pricingProgram.everydayLowPriceEnabled);
    rows.push({ id: service.id, sourceType: "service", name: service.name, description: service.description, sku: null, priceCents: price.contactForPricing || !price.showPublicPrice ? null : price.currentPriceCents, status: service.public_status, purchaseState: null, parentId: null, parentName: null, availabilityWarning: warning(service.public_status, null) });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export async function snapshotInvoiceCatalog(draft: InvoiceDraftInput) {
  if (draft.items.every((item) => item.sourceType === "custom")) return applyCatalogSnapshots(draft, []);
  return applyCatalogSnapshots(draft, await readInvoiceCatalogReferences());
}
