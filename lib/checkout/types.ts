export type CheckoutPaymentMethod = "card" | "ach_debit" | "wire_transfer";
export type CheckoutPurchaseMode = "standard" | "complete-system" | "individual-equipment";
export type OrderStatus = "draft" | "checkout_pending" | "payment_processing" | "confirmed" | "canceled";
export type PaymentStatus = "unpaid" | "awaiting_customer_action" | "processing" | "awaiting_customer_funds" | "partially_funded" | "paid" | "failed" | "partially_refunded" | "refunded" | "disputed";
export type FulfillmentStatus = "not_ready" | "pending" | "fulfilled" | "canceled";
export type PaymentAttemptStatus = "creating" | "open" | "awaiting_customer_action" | "completed" | "processing" | "awaiting_customer_funds" | "partially_funded" | "succeeded" | "failed" | "expired";
export type PaymentSecurityPolicyIdentifier = "ids-stripe-payment-security-v1";
export type IdentityVerificationState =
  | { status: "unverified"; verifiedAt: null; method: null }
  | { status: "verified"; verifiedAt: string; method: "authenticated_login" | "email_otp" | "signed_magic_link" };

export type InternalCustomerProfile = {
  id: string;
  email: string | null;
  normalizedEmail: string | null;
  name: string | null;
  phone: string | null;
  billingAddress: Record<string, unknown> | null;
  shippingAddress: Record<string, unknown> | null;
  identityVerification: IdentityVerificationState;
  createdAt: string;
  updatedAt: string;
};

export type StripeCustomerLinkage = {
  internalCustomerId: string;
  stripeCustomerId: string;
  stripeCustomerCreatedAt: string;
};

export type CustomerProfileReuseDecision =
  | { action: "create_new"; reason: "new_buyer" | "unverified_identity" | "possible_duplicate" }
  | { action: "reuse_verified"; customer: InternalCustomerProfile; linkage: StripeCustomerLinkage; verification: Extract<IdentityVerificationState, { status: "verified" }> };

export type CheckoutRejectionCode =
  | "INVALID_REQUEST" | "UNKNOWN_CATALOG_RECORD" | "QUOTE_ONLY_PRODUCT"
  | "INACTIVE_CATALOG_RECORD" | "CROSS_PRODUCT_SELECTION" | "INVALID_QUANTITY"
  | "DUPLICATE_SELECTION" | "INCOMPATIBLE_SELECTION" | "MISSING_CONFIGURATION"
  | "LYMOW_CHARGER_SUBMITTED" | "LYMOW_CHARGER_RELATIONSHIP_INVALID"
  | "YARBO_PACKAGE_DOUBLE_COUNT" | "YARBO_HIDDEN_OPTION" | "UNPRICED_ITEM";

export type StructuredShippingAddress = {
  line1: string; line2: string | null; city: string; state: string;
  postalCode: string; country: "US";
};

export type CheckoutRequest = {
  requestId: string;
  paymentMethod: CheckoutPaymentMethod;
  selection: {
    productId: string; variantId: string | null; purchaseMode: CheckoutPurchaseMode;
    packageId: string | null; options: Array<{ optionId: string; quantity: number }>;
    includeBaseProduct: boolean;
  };
  customer: { name: string; email: string | null; phone: string | null };
  shippingAddress: StructuredShippingAddress;
};

export type NormalizedSelection = CheckoutRequest["selection"];
export type CatalogSourceReference = { table: "catalog_products" | "catalog_product_variants" | "catalog_options" | "catalog_packages" | "catalog_package_items" | "catalog_variant_options" | "catalog_price_schedules"; id: string };

export type OrderPriceItem = {
  itemType: "product" | "variant" | "option" | "package" | "package_component";
  sourceId: string; sku: string | null; name: string; description: string | null;
  quantity: number; unitAmountCents: number; extendedAmountCents: number;
  includedInPackagePrice: boolean; parentSourceId: string | null;
};

export type OrderPriceSnapshot = {
  currency: "usd";
  product: { id: string; slug: string; name: string };
  variant: { id: string; slug: string; name: string; sku: string | null } | null;
  purchaseMode: CheckoutPurchaseMode;
  chargeableItems: readonly OrderPriceItem[];
  includedPackageComponents: readonly OrderPriceItem[];
  subtotalCents: number; discountCents: number; feeCents: 0; shippingCents: 0; taxCents: 0;
  totalCents: number; paymentMethod: CheckoutPaymentMethod; pricedAt: string;
  catalogSources: readonly CatalogSourceReference[];
  warnings: readonly string[];
  safeMetadata: { phase: "4B1"; adjustments: "not_implemented" } | { phase: "4B2B"; discountPolicy: "none" | "bank-payment-275bps-v1" };
};

export type EligibilityResult = { ok: true; snapshot: OrderPriceSnapshot } | { ok: false; code: CheckoutRejectionCode; message: string };

export class CheckoutRejectionError extends Error {
  constructor(public readonly code: CheckoutRejectionCode, message: string) {
    super(message); this.name = "CheckoutRejectionError";
  }
}
