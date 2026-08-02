import type { CatalogProduct } from "@/lib/catalog/types";
import type { PurchaseMethodKey } from "@/lib/products/types";

import { checkoutProductIsSupported } from "./eligibility";
export type CustomerCheckoutPaymentMethod = "card" | "ach_debit";
export type CheckoutSubmissionKind = CustomerCheckoutPaymentMethod | "quote";

const checkoutEndpoints: Record<CustomerCheckoutPaymentMethod, string> = {
  card: "/api/checkout/session",
  ach_debit: "/api/checkout/ach/session",
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
  return "card";
}

export function checkoutEndpoint(paymentMethod: CustomerCheckoutPaymentMethod) {
  return checkoutEndpoints[paymentMethod];
}
