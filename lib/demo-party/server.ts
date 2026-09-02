import "server-only";

import { getSupabaseServiceClient } from "@/lib/supabase";
import { generatePortalToken, hashPortalToken, portalTokenIsWellFormed } from "./security";
import { demoPartyGuestFromRpc, readDemoPartyPortalWithRpc } from "./portal-reader";
import { readAdminDemoPartyWithRpc } from "./admin-reader";
import { demoReferralOrderFromRpc } from "./referral-reader";
import type { DemoPartyPortal } from "./types";
import { DEMO_PARTY_REFERRAL_SCHEDULE_VERSION, demoPartyReferralRewardForProduct } from "@/lib/checkout/referral-rewards";
import type { OrderPriceSnapshot } from "@/lib/checkout/types";

type JsonObject = Record<string, unknown>;

function one<T>(data: unknown, error: { message?: string } | null): T {
  if (error) throw error;
  if (!data) throw new Error("Scheduling record was not found.");
  return data as T;
}

export async function issuePortalToken(requestId: string) {
  const token = generatePortalToken();
  const { error } = await getSupabaseServiceClient().rpc("scheduling_set_portal_token", {
    p_request_id: requestId,
    p_token_hash: hashPortalToken(token),
  });
  if (error) throw error;
  return token;
}

export async function readDemoPartyPortal(rawToken: string): Promise<DemoPartyPortal | null> {
  const client = getSupabaseServiceClient();
  return readDemoPartyPortalWithRpc(rawToken, async (tokenHash) => client.rpc("scheduling_read_demo_portal", {
    p_token_hash: tokenHash,
  }));
}

export async function prepareDemoCheckout(rawToken: string) {
  if (!portalTokenIsWellFormed(rawToken)) throw new Error("Invalid portal token.");
  const result = await getSupabaseServiceClient().rpc("scheduling_prepare_demo_checkout", { p_token_hash: hashPortalToken(rawToken) });
  return one<JsonObject>(result.data, result.error);
}

export async function linkDemoCheckout(input: { requestId: string; generationKey: string; sessionId: string; url: string; expiresAt: string }) {
  const { error } = await getSupabaseServiceClient().rpc("scheduling_link_demo_checkout", {
    p_request_id: input.requestId,
    p_generation_key: input.generationKey,
    p_session_id: input.sessionId,
    p_checkout_url: input.url,
    p_expires_at: input.expiresAt,
  });
  if (error) throw error;
}

export async function readDemoPaymentBySession(sessionId: string) {
  return readDemoPayment("checkout_session", sessionId);
}

async function readDemoPayment(lookupKind: "checkout_session" | "payment_intent", stripeId: string) {
  const result = await getSupabaseServiceClient().rpc("scheduling_read_demo_payment", {
    p_lookup_kind: lookupKind,
    p_stripe_id: stripeId,
  });
  if (result.error) throw result.error;
  if (!result.data) return null;
  const payment = result.data as JsonObject;
  return {
    appointmentId: String(payment.appointmentId),
    stripeCheckoutSessionId: payment.stripeCheckoutSessionId as string | null,
    stripePaymentIntentId: payment.stripePaymentIntentId as string | null,
    amountCents: Number(payment.amountCents),
    currency: payment.currency as "usd",
  };
}

export async function readDemoPaymentByIntent(paymentIntentId: string) {
  return readDemoPayment("payment_intent", paymentIntentId);
}

export async function applyDemoPayment(sessionId: string, paymentIntentId: string, chargeId: string | null) {
  const result = await getSupabaseServiceClient().rpc("scheduling_apply_demo_payment", {
    p_session_id: sessionId,
    p_payment_intent_id: paymentIntentId,
    p_charge_id: chargeId,
  });
  return one<{ changed: boolean; requestId: string; demoFormat?: "private" | "party" }>(result.data, result.error);
}

export async function expireDemoCheckout(sessionId: string) {
  const { error } = await getSupabaseServiceClient().rpc("scheduling_expire_demo_checkout", { p_session_id: sessionId });
  if (error) throw error;
}

export async function reconcileDemoRefund(paymentIntentId: string, refundedCents: number, eventId: string) {
  const result = await getSupabaseServiceClient().rpc("scheduling_reconcile_demo_refund", { p_payment_intent_id: paymentIntentId, p_refunded_cents: refundedCents, p_event_id: eventId });
  return one<{ changed: boolean; requestId: string; refundedCents?: number }>(result.data, result.error);
}

export async function addGuest(rawToken: string, guest: { fullName: string; email: string; phone: string }) {
  if (!portalTokenIsWellFormed(rawToken)) throw new Error("Invalid portal token.");
  const result = await getSupabaseServiceClient().rpc("scheduling_add_demo_party_guest", { p_token_hash: hashPortalToken(rawToken), p_full_name: guest.fullName, p_email: guest.email, p_phone: guest.phone });
  return demoPartyGuestFromRpc(one<unknown>(result.data, result.error));
}

export async function updateGuest(rawToken: string, guestId: string, guest: { fullName: string; email: string; phone: string }) {
  if (!portalTokenIsWellFormed(rawToken)) throw new Error("Invalid portal token.");
  const result = await getSupabaseServiceClient().rpc("scheduling_update_demo_party_guest", { p_token_hash: hashPortalToken(rawToken), p_guest_id: guestId, p_full_name: guest.fullName, p_email: guest.email, p_phone: guest.phone });
  return demoPartyGuestFromRpc(one<unknown>(result.data, result.error));
}

export async function deleteGuest(rawToken: string, guestId: string) {
  if (!portalTokenIsWellFormed(rawToken)) throw new Error("Invalid portal token.");
  const { error } = await getSupabaseServiceClient().rpc("scheduling_delete_demo_party_guest", { p_token_hash: hashPortalToken(rawToken), p_guest_id: guestId });
  if (error) throw error;
}

export async function reserveDemoPartyBenefit(rawToken: string, orderReference: string) {
  if (!portalTokenIsWellFormed(rawToken)) throw new Error("Invalid portal token.");
  const result = await getSupabaseServiceClient().rpc("scheduling_reserve_demo_party_benefit", { p_token_hash: hashPortalToken(rawToken), p_order_reference: orderReference, p_benefit_type: "base_machine_discount", p_application: "machine" });
  return one<JsonObject>(result.data, result.error);
}

export async function prepareDemoPartyBenefitCheckout(rawToken: string, orderReference: string) {
  if (!portalTokenIsWellFormed(rawToken)) throw new Error("Invalid portal token.");
  const result = await getSupabaseServiceClient().rpc("scheduling_prepare_demo_party_benefit_checkout", { p_token_hash: hashPortalToken(rawToken), p_order_reference: orderReference });
  return one<JsonObject>(result.data, result.error);
}

export async function releaseDemoPartyOrderReservations(rawToken: string, orderReference: string) {
  if (!portalTokenIsWellFormed(rawToken)) throw new Error("Invalid portal token.");
  const { error } = await getSupabaseServiceClient().rpc("scheduling_release_demo_party_order_reservations", { p_token_hash: hashPortalToken(rawToken), p_order_reference: orderReference });
  if (error) throw error;
}

export async function applyDemoPartyBenefitCheckout(rawToken: string, input: { orderReference: string; expectedUpdatedAt: string; snapshot: OrderPriceSnapshot; machineOrderItemId: string | null; machineUnitCents: number | null; oldAttemptId: string | null }) {
  if (!portalTokenIsWellFormed(rawToken)) throw new Error("Invalid portal token.");
  const result = await getSupabaseServiceClient().rpc("scheduling_apply_demo_party_benefit_checkout", {
    p_token_hash: hashPortalToken(rawToken), p_order_reference: input.orderReference,
    p_expected_updated_at: input.expectedUpdatedAt, p_snapshot: input.snapshot,
    p_subtotal_cents: input.snapshot.subtotalCents, p_discount_cents: input.snapshot.discountCents,
    p_total_cents: input.snapshot.totalCents, p_machine_order_item_id: input.machineOrderItemId,
    p_machine_unit_cents: input.machineUnitCents, p_old_attempt_id: input.oldAttemptId,
  });
  return one<JsonObject>(result.data, result.error);
}

export async function linkDemoPartyBenefitCheckout(rawToken: string, input: { attemptId: string; sessionId: string; checkoutUrl: string; expiresAt: string }) {
  if (!portalTokenIsWellFormed(rawToken)) throw new Error("Invalid portal token.");
  const { error } = await getSupabaseServiceClient().rpc("scheduling_link_demo_party_benefit_checkout", {
    p_token_hash: hashPortalToken(rawToken), p_attempt_id: input.attemptId, p_session_id: input.sessionId,
    p_checkout_url: input.checkoutUrl, p_expires_at: input.expiresAt,
  });
  if (error) throw error;
}

export async function finalizeDemoPartyOrderBenefits(orderId: string, attemptId: string, event: "paid" | "expired") {
  const { error } = await getSupabaseServiceClient().rpc("scheduling_finalize_demo_party_order_benefits", { p_order_id: orderId, p_attempt_id: attemptId, p_event: event });
  if (error) throw error;
}

export async function readAdminDemoParty(requestId: string) {
  const client = getSupabaseServiceClient();
  return readAdminDemoPartyWithRpc(requestId, async (id) => client.rpc("scheduling_read_admin_demo_party", {
    p_request_id: id,
  }));
}

export async function adminSetGuestListLock(requestId: string, locked: boolean, reason: string | null) {
  const { error } = await getSupabaseServiceClient().rpc("scheduling_admin_set_demo_party_lock", { p_request_id: requestId, p_locked: locked, p_reason: reason });
  if (error) throw error;
}

export async function adminUpdateGuestAttendance(guestId: string, action: string, note: string | null, consent: boolean | null) {
  const result = await getSupabaseServiceClient().rpc("scheduling_admin_update_demo_party_guest", { p_guest_id: guestId, p_action: action, p_note: note, p_follow_up_consent: consent });
  return one<JsonObject>(result.data, result.error);
}

export async function adminSetDemoPartyFood(requestId: string, status: string, notes: string | null, budgetCents: number | null) {
  const { error } = await getSupabaseServiceClient().rpc("scheduling_admin_set_demo_party_food", { p_request_id: requestId, p_status: status, p_notes: notes, p_budget_cents: budgetCents });
  if (error) throw error;
}

export async function prepareDemoRefund(requestId: string) {
  const result = await getSupabaseServiceClient().rpc("scheduling_prepare_demo_refund", { p_request_id: requestId });
  return one<JsonObject>(result.data, result.error);
}

export async function finishDemoRefund(attemptId: string, success: boolean, stripeRefundId: string | null, errorCode: string | null) {
  const result = await getSupabaseServiceClient().rpc("scheduling_finish_demo_refund", { p_attempt_id: attemptId, p_success: success, p_stripe_refund_id: stripeRefundId, p_error_code: errorCode });
  return one<JsonObject>(result.data, result.error);
}

export async function linkDemoPartyReferral(guestId: string, orderReference: string) {
  const client = getSupabaseServiceClient();
  const order = await client.rpc("scheduling_read_demo_referral_order", {
    p_order_reference: orderReference,
  });
  if (order.error) throw order.error;
  if (!order.data) throw new Error("Paid order not found.");
  const orderDetails = demoReferralOrderFromRpc(order.data);
  const schedule = demoPartyReferralRewardForProduct(orderDetails.product);
  const result = await client.rpc("scheduling_link_demo_party_referral", {
    p_guest_id: guestId,
    p_order_reference: orderReference,
    p_reward: { qualifying_brand: schedule.brand, product_id: orderDetails.product.id, product_slug_snapshot: orderDetails.product.slug, product_name_snapshot: orderDetails.product.name, tier_one_reward_cents: schedule.tierOneRewardCents, schedule_version: DEMO_PARTY_REFERRAL_SCHEDULE_VERSION },
  });
  if (result.error) throw result.error;
  return String(result.data);
}
