import "server-only";

import type { CustomerProfileReuseDecision, FulfillmentStatus, IdentityVerificationState, InternalCustomerProfile, OrderPriceSnapshot, OrderStatus, PaymentAttemptStatus, PaymentStatus, StripeCustomerLinkage } from "./types";

export type OrderRow = { id: string; customer_id: string; public_reference: string; order_status: OrderStatus; payment_status: PaymentStatus; fulfillment_status: FulfillmentStatus; currency: "usd"; total_cents: number; refunded_cents: number; pricing_snapshot: OrderPriceSnapshot };
export type PaymentAttemptRow = { id: string; order_id: string; attempt_number: number; payment_method: "card" | "ach"; attempt_status: PaymentAttemptStatus; stripe_checkout_session_id: string | null; stripe_payment_intent_id: string | null; expected_amount_cents: number; expected_currency: "usd" };
export type SafeOrderStatus = Pick<OrderRow, "public_reference" | "order_status" | "payment_status" | "fulfillment_status" | "currency" | "total_cents" | "refunded_cents">;

export interface CheckoutOrderRepository {
  createInternalCustomer(input: Omit<InternalCustomerProfile, "id" | "createdAt" | "updatedAt" | "identityVerification">): Promise<InternalCustomerProfile>;
  recordCustomerContactAndAddressSnapshots(customerId: string, snapshots: Pick<InternalCustomerProfile, "email" | "normalizedEmail" | "name" | "phone" | "billingAddress" | "shippingAddress">): Promise<InternalCustomerProfile>;
  findPossibleProfilesByNormalizedEmail(normalizedEmail: string): Promise<readonly InternalCustomerProfile[]>;
  linkStripeCustomer(customerId: string, linkage: Omit<StripeCustomerLinkage, "internalCustomerId">): Promise<StripeCustomerLinkage>;
  retrieveAuthorizedReusableStripeCustomer(customerId: string, verification: Extract<IdentityVerificationState, { status: "verified" }>): Promise<CustomerProfileReuseDecision>;
  createOrder(customerId: string, snapshot: OrderPriceSnapshot): Promise<OrderRow>;
  attachOrderToInternalCustomer(orderId: string, customerId: string): Promise<void>;
  createOrderItems(orderId: string, snapshot: OrderPriceSnapshot): Promise<void>;
  createPaymentAttempt(orderId: string, paymentMethod: "card" | "ach", idempotencyKey: string, requestFingerprint: string): Promise<PaymentAttemptRow>;
  findAttemptByCheckoutSessionId(sessionId: string): Promise<PaymentAttemptRow | null>;
  findAttemptByPaymentIntentId(paymentIntentId: string): Promise<PaymentAttemptRow | null>;
  recordCheckoutSessionLinkage(attemptId: string, sessionId: string, paymentIntentId: string | null): Promise<void>;
  retrieveSafeOrderStatus(publicReference: string): Promise<SafeOrderStatus | null>;
  recordWebhookReceipt(event: { id: string; type: string; objectId: string | null; livemode: boolean; apiVersion: string | null }): Promise<"created" | "duplicate">;
  advancePaymentState(orderId: string, next: { orderStatus: OrderStatus; paymentStatus: PaymentStatus; fulfillmentStatus: FulfillmentStatus }): Promise<void>;
}

export function mapSafeOrderStatus(row: OrderRow): SafeOrderStatus {
  return { public_reference: row.public_reference, order_status: row.order_status, payment_status: row.payment_status, fulfillment_status: row.fulfillment_status, currency: row.currency, total_cents: row.total_cents, refunded_cents: row.refunded_cents };
}
