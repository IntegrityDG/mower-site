import "server-only";
import { loadPublicCatalog } from "@/lib/catalog/load-public-catalog";
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
  const { data: services, error } = await getSupabaseServiceClient().from("catalog_services").select("id,name,description,regular_price_cents,sale_price_cents,sale_starts_at,sale_ends_at,public_status").neq("public_status", "hidden");
  if (error) throw new Error("Catalog services are unavailable.");
  const now = Date.now();
  for (const service of services ?? []) { const saleActive = service.sale_price_cents != null && (!service.sale_starts_at || Date.parse(service.sale_starts_at) <= now) && (!service.sale_ends_at || Date.parse(service.sale_ends_at) >= now); const price = saleActive ? service.sale_price_cents : service.regular_price_cents; rows.push({ id: service.id, sourceType: "service", name: service.name, description: service.description, sku: null, priceCents: price, status: service.public_status, purchaseState: null, parentId: null, parentName: null, availabilityWarning: warning(service.public_status, null) }); }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export async function snapshotInvoiceCatalog(draft: InvoiceDraftInput) {
  if (draft.items.every((item) => item.sourceType === "custom")) return applyCatalogSnapshots(draft, []);
  return applyCatalogSnapshots(draft, await readInvoiceCatalogReferences());
}
