import "server-only";
import type { CheckoutRequest, OrderPriceSnapshot } from "@/lib/checkout/types";
import type { DraftResult } from "@/lib/checkout/order-repository";
import { getStripeConfiguration, getStripeMode } from "@/lib/stripe/config";
import { serviceRpc } from "./repository";
import { serviceToken, tokenHash } from "./security";

export async function createMachineServiceDraft(request: CheckoutRequest, snapshot: OrderPriceSnapshot, idempotencyKey: string, fingerprint: string, referral: unknown): Promise<DraftResult> {
  const config = getStripeConfiguration();
  return serviceRpc<DraftResult>("ids_service_machine_checkout_draft", {
    p_idempotency: idempotencyKey, p_fingerprint: fingerprint, p_key: request.requestId,
    p_customer: { ...request.customer, shippingAddress: request.shippingAddress }, p_snapshot: snapshot, p_referral: referral,
    p_live: getStripeMode() === "live", p_token_hash: tokenHash(serviceToken("support", request.requestId)), p_origin: config.appBaseUrl,
  });
}
