import { InvoiceValidationError } from "./domain";
import type { CatalogInvoiceReference, InvoiceDraftInput } from "./types";

function referenceKey(value: Pick<CatalogInvoiceReference, "sourceType" | "id" | "parentId">) {
  return `${value.sourceType}:${value.id}:${value.parentId ?? ""}`;
}

export function applyCatalogSnapshots(draft: InvoiceDraftInput, references: CatalogInvoiceReference[]): InvoiceDraftInput {
  const byKey = new Map(references.map((reference) => [referenceKey(reference), reference]));
  return {
    ...draft,
    items: draft.items.map((item, index) => {
      if (item.sourceType === "custom") return {
        ...item,
        catalogId: null,
        catalogParentId: null,
        catalogReferencePriceCents: null,
        catalogStatus: null,
        catalogPurchaseState: null,
        availabilityWarning: false,
      };
      const reference = item.catalogId ? byKey.get(referenceKey({ sourceType: item.sourceType, id: item.catalogId, parentId: item.catalogParentId ?? null })) : undefined;
      if (!reference) throw new InvoiceValidationError(`Line ${index + 1} no longer matches an available catalog entry.`);
      return {
        ...item,
        lineType: "item",
        description: reference.name,
        secondaryDescription: reference.description,
        sku: reference.sku,
        catalogId: reference.id,
        catalogParentId: reference.parentId,
        catalogReferencePriceCents: reference.priceCents,
        catalogStatus: reference.status,
        catalogPurchaseState: reference.purchaseState,
        availabilityWarning: reference.availabilityWarning,
      };
    }),
  };
}
