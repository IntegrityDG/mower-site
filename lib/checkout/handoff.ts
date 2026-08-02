import type { CatalogProduct } from "@/lib/catalog/types";
import type { PurchaseMethodKey } from "@/lib/products/types";

import { checkoutProductIsSupported } from "./eligibility";
import type { CheckoutPaymentMethod } from "./types";

export type CheckoutSubmissionKind = CheckoutPaymentMethod | "quote";

const checkoutEndpoints: Record<CheckoutPaymentMethod, string> = {
  card: "/api/checkout/session",
  ach_debit: "/api/checkout/ach/session",
  wire_transfer: "/api/checkout/wire/session",
};

export function checkoutSubmissionKind(
  product: Pick<CatalogProduct, "slug" | "brand" | "salesMode">,
  purchaseMethod: PurchaseMethodKey,
  configurationRequiresQuote = false
): CheckoutSubmissionKind {
  if (
    configurationRequiresQuote ||
    product.salesMode !== "self_service" ||
    !checkoutProductIsSupported(product) ||
    purchaseMethod === "hearth-financing"
  ) {
    return "quote";
  }

  if (purchaseMethod === "ach") return "ach_debit";
  if (purchaseMethod === "wire") return "wire_transfer";
  return "card";
}

export function checkoutEndpoint(paymentMethod: CheckoutPaymentMethod) {
  return checkoutEndpoints[paymentMethod];
}
