import "server-only";

import { getSupabaseServiceClient } from "@/lib/supabase";
import { MAX_QUALIFYING_GUESTS } from "./benefits";
import { generatePortalToken, hashPortalToken, portalTokenIsWellFormed } from "./security";
import type { DemoPartyGuest, DemoPartyPortal } from "./types";
import { DEMO_PARTY_REFERRAL_SCHEDULE_VERSION, demoPartyReferralRewardForProduct } from "@/lib/checkout/referral-rewards";
import type { OrderPriceSnapshot } from "@/lib/checkout/types";

type JsonObject = Record<string, unknown>;

function privateTable(name: string) {
  return getSupabaseServiceClient().schema("scheduling_private").from(name);
}

function one<T>(data: unknown, error: { message?: string } | null): T {
  if (error) throw error;
  if (!data) throw new Error("Scheduling record was not found.");
  return data as T;
}

const guestFromRow = (row: JsonObject): DemoPartyGuest => ({
  id: String(row.id),
  fullName: String(row.full_name),
  email: String(row.email),
  phone: String(row.phone),
  checkedInAt: row.checked_in_at as string | null,
  checkedOutAt: row.checked_out_at as string | null,
  qualificationStatus: row.qualification_status as DemoPartyGuest["qualificationStatus"],
  qualificationVerifiedAt: row.qualification_verified_at as string | null,
  followUpConsent: row.follow_up_consent as boolean | null,
  referralIdentifier: String(row.referral_identifier),
});

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
  if (!portalTokenIsWellFormed(rawToken)) return null;
  const tokenHash = hashPortalToken(rawToken);
  const tokenResult = await privateTable("appointment_portal_tokens")
    .select("request_id")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .maybeSingle();
  if (tokenResult.error || !tokenResult.data) return null;
  const requestId = String(tokenResult.data.request_id);
  const client = getSupabaseServiceClient();
  const [requestResult, paymentResult, partyResult, guestResult, ledgerResult, redemptionResult] = await Promise.all([
    client.from("demo_requests").select("id,customer_name,customer_email,customer_phone,property_address,requested_start_at,requested_end_at,equipment_interest,status,payment_status,demo_format").eq("id", requestId).single(),
    privateTable("demo_payments").select("paid_cents,refunded_cents").eq("request_id", requestId).maybeSingle(),
    privateTable("demo_parties").select("guest_arrival_offset_minutes,guest_list_locked").eq("request_id", requestId).maybeSingle(),
    privateTable("demo_party_guests").select("id,full_name,email,phone,checked_in_at,checked_out_at,qualification_status,qualification_verified_at,follow_up_consent,referral_identifier").eq("request_id", requestId).order("registered_at"),
    privateTable("demo_party_benefit_ledger").select("benefit_type,earned_cents,consumed_cents,election").eq("request_id", requestId),
    privateTable("demo_party_benefit_redemptions").select("checkout_url,checkout_expires_at").eq("request_id", requestId).eq("state", "reserved").not("checkout_url", "is", null).gt("checkout_expires_at", new Date().toISOString()).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (requestResult.error || !requestResult.data) return null;
  if (paymentResult.error || partyResult.error || guestResult.error || ledgerResult.error || redemptionResult.error) throw paymentResult.error ?? partyResult.error ?? guestResult.error ?? ledgerResult.error ?? redemptionResult.error;
  const request = requestResult.data as JsonObject;
  const payment = paymentResult.data as JsonObject | null;
  const party = partyResult.data as JsonObject | null;
  const guests = ((guestResult.data ?? []) as JsonObject[]).map(guestFromRow);
  const ledgers = (ledgerResult.data ?? []) as JsonObject[];
  const earned = (kind: string) => Number(ledgers.find((row) => row.benefit_type === kind)?.earned_cents ?? 0);
  const isParty = request.demo_format === "party";
  return {
    appointmentId: requestId,
    customerName: String(request.customer_name),
    customerEmail: String(request.customer_email),
    customerPhone: String(request.customer_phone),
    propertyAddress: String(request.property_address),
    requestedStartAt: String(request.requested_start_at),
    requestedEndAt: String(request.requested_end_at),
    equipmentInterest: request.equipment_interest as string | null,
    status: request.status as DemoPartyPortal["status"],
    paymentStatus: request.payment_status as DemoPartyPortal["paymentStatus"],
    amountPaidCents: Number(payment?.paid_cents ?? 0),
    amountRefundedCents: Number(payment?.refunded_cents ?? 0),
    demoFormat: request.demo_format as DemoPartyPortal["demoFormat"],
    guestArrivalAt: isParty && party ? new Date(Date.parse(String(request.requested_start_at)) + Number(party.guest_arrival_offset_minutes) * 60_000).toISOString() : null,
    guestListLocked: Boolean(party?.guest_list_locked),
    guests: isParty ? guests : [],
    benefits: {
      qualifyingGuests: Math.min(MAX_QUALIFYING_GUESTS, guests.filter((guest) => guest.qualificationStatus === "qualifying").length),
      feeRefundCents: earned("demo_fee_refund"),
      baseMachineDiscountCents: earned("base_machine_discount"),
      maximumMachineDiscountCents: earned("base_machine_discount"),
    },
    benefitCheckoutUrl: (redemptionResult.data?.checkout_url as string | null | undefined) ?? null,
    benefitCheckoutExpiresAt: (redemptionResult.data?.checkout_expires_at as string | null | undefined) ?? null,
  };
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
  const result = await privateTable("demo_payments")
    .select("request_id,stripe_checkout_session_id,stripe_payment_intent_id,amount_cents,currency,status")
    .eq("stripe_checkout_session_id", sessionId)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) return null;
  return {
    appointmentId: String(result.data.request_id),
    stripeCheckoutSessionId: result.data.stripe_checkout_session_id as string | null,
    stripePaymentIntentId: result.data.stripe_payment_intent_id as string | null,
    amountCents: Number(result.data.amount_cents),
    currency: result.data.currency as "usd",
    status: result.data.status as "not_started" | "checkout_open" | "paid" | "partially_refunded" | "refunded",
  };
}

export async function readDemoPaymentByIntent(paymentIntentId: string) {
  const result = await privateTable("demo_payments")
    .select("request_id,stripe_checkout_session_id,stripe_payment_intent_id,amount_cents,currency,status")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) return null;
  return {
    appointmentId: String(result.data.request_id),
    stripeCheckoutSessionId: result.data.stripe_checkout_session_id as string | null,
    stripePaymentIntentId: result.data.stripe_payment_intent_id as string | null,
    amountCents: Number(result.data.amount_cents),
    currency: result.data.currency as "usd",
    status: result.data.status as "not_started" | "checkout_open" | "paid" | "partially_refunded" | "refunded",
  };
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
  return one<DemoPartyGuest>(result.data, result.error);
}

export async function updateGuest(rawToken: string, guestId: string, guest: { fullName: string; email: string; phone: string }) {
  if (!portalTokenIsWellFormed(rawToken)) throw new Error("Invalid portal token.");
  const result = await getSupabaseServiceClient().rpc("scheduling_update_demo_party_guest", { p_token_hash: hashPortalToken(rawToken), p_guest_id: guestId, p_full_name: guest.fullName, p_email: guest.email, p_phone: guest.phone });
  return one<DemoPartyGuest>(result.data, result.error);
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
  const [appointment, party, payment, guests, benefits, redemptions, referrals, events] = await Promise.all([
    client.from("demo_requests").select("id,requested_start_at,requested_end_at,demo_format,status,payment_status").eq("id", requestId).maybeSingle(),
    privateTable("demo_parties").select("*").eq("request_id", requestId).maybeSingle(),
    privateTable("demo_payments").select("*").eq("request_id", requestId).maybeSingle(),
    privateTable("demo_party_guests").select("*").eq("request_id", requestId).order("registered_at"),
    privateTable("demo_party_benefit_ledger").select("*").eq("request_id", requestId),
    privateTable("demo_party_benefit_redemptions").select("id,benefit_type,application,amount_cents,order_id,checkout_attempt_id,stripe_checkout_session_id,checkout_url,checkout_expires_at,state,created_at,applied_at,released_at,updated_at").eq("request_id", requestId).order("created_at", { ascending: false }),
    client.schema("checkout_private").from("referrals").select("id,demo_party_guest_id,order_id,status,purchase_date,return_period_ends_at,base_reward_cents,product_name_snapshot").eq("demo_party_request_id", requestId).order("purchase_date", { ascending: false }),
    privateTable("appointment_audit_events").select("event_type,actor_type,metadata,created_at").eq("request_id", requestId).order("created_at", { ascending: false }).limit(100),
  ]);
  const error = appointment.error ?? party.error ?? payment.error ?? guests.error ?? benefits.error ?? redemptions.error ?? referrals.error ?? events.error;
  if (error) throw error;
  return { appointment: appointment.data, party: party.data, payment: payment.data, guests: guests.data ?? [], benefits: benefits.data ?? [], redemptions: redemptions.data ?? [], referrals: referrals.data ?? [], auditEvents: events.data ?? [] };
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
  const order = await client.schema("checkout_private").from("orders").select("pricing_snapshot").eq("public_reference", orderReference).maybeSingle();
  if (order.error) throw order.error;
  if (!order.data) throw new Error("Paid order not found.");
  const snapshot = order.data.pricing_snapshot as OrderPriceSnapshot;
  const schedule = demoPartyReferralRewardForProduct(snapshot.product);
  const result = await client.rpc("scheduling_link_demo_party_referral", {
    p_guest_id: guestId,
    p_order_reference: orderReference,
    p_reward: { qualifying_brand: schedule.brand, product_id: snapshot.product.id, product_slug_snapshot: snapshot.product.slug, product_name_snapshot: snapshot.product.name, tier_one_reward_cents: schedule.tierOneRewardCents, schedule_version: DEMO_PARTY_REFERRAL_SCHEDULE_VERSION },
  });
  if (result.error) throw result.error;
  return String(result.data);
}
