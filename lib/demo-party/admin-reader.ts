import type { AdminDemoPartyDetail } from "./types";

type AdminRpcResult = { data: unknown; error: unknown };
type AdminRpc = (requestId: string) => PromiseLike<AdminRpcResult>;

const appointmentStatuses = ["pending", "approved", "denied", "cancelled"] as const;
const paymentStatuses = ["not_started", "creating", "checkout_open", "paid", "partially_refunded", "refunded"] as const;

function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid ${name} payload.`);
  return value as Record<string, unknown>;
}

function nullableObject(value: unknown, name: string): Record<string, unknown> | null {
  return value === null ? null : object(value, name);
}

function rows(value: unknown, name: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) throw new Error(`Invalid ${name} payload.`);
  return value.map((row) => object(row, name));
}

function nullableString(value: unknown, name: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new Error(`Invalid ${name} payload.`);
  return value;
}

function enumValue<const T extends readonly string[]>(value: unknown, allowed: T, name: string): T[number] {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) throw new Error(`Invalid ${name} payload.`);
  return value as T[number];
}

export function adminDemoPartyFromRpc(value: unknown): AdminDemoPartyDetail {
  const detail = object(value, "admin Demo Party");
  const appointment = object(detail.appointment, "admin appointment");
  const party = nullableObject(detail.party, "admin party");
  const payment = nullableObject(detail.payment, "admin payment");

  return {
    appointment: {
      requested_start_at: String(appointment.requested_start_at),
      status: enumValue(appointment.status, appointmentStatuses, "appointment status"),
      payment_status: enumValue(appointment.payment_status, paymentStatuses, "appointment payment status"),
    },
    party: party ? {
      property_relationship: String(party.property_relationship),
      property_type: String(party.property_type),
      mowable_acreage: Number(party.mowable_acreage),
      actively_considering_purchase: Boolean(party.actively_considering_purchase),
      purchase_timeframe: String(party.purchase_timeframe),
      equipment_budget: String(party.equipment_budget),
      property_authorization_certified: Boolean(party.property_authorization_certified),
      guest_arrival_offset_minutes: Number(party.guest_arrival_offset_minutes),
      guest_list_locked: Boolean(party.guest_list_locked),
      food_support_status: String(party.food_support_status),
      food_notes: nullableString(party.food_notes, "food notes"),
      food_budget_cents: party.food_budget_cents === null ? null : Number(party.food_budget_cents),
    } : null,
    payment: payment ? {
      status: enumValue(payment.status, paymentStatuses, "payment status"),
      stripe_checkout_session_id: nullableString(payment.stripe_checkout_session_id, "Stripe Checkout Session ID"),
      stripe_payment_intent_id: nullableString(payment.stripe_payment_intent_id, "Stripe PaymentIntent ID"),
      paid_cents: Number(payment.paid_cents),
      refunded_cents: Number(payment.refunded_cents),
    } : null,
    guests: rows(detail.guests, "admin guests").map((guest) => ({
      id: String(guest.id),
      full_name: String(guest.full_name),
      email: String(guest.email),
      phone: String(guest.phone),
      referral_identifier: String(guest.referral_identifier),
      registered_at: String(guest.registered_at),
      checked_in_at: nullableString(guest.checked_in_at, "guest check-in"),
      checked_out_at: nullableString(guest.checked_out_at, "guest check-out"),
      qualification_status: enumValue(guest.qualification_status, ["pending", "qualifying", "not_qualifying"] as const, "guest qualification status"),
      follow_up_consent: guest.follow_up_consent === null ? null : Boolean(guest.follow_up_consent),
    })),
    benefits: rows(detail.benefits, "admin benefits").map((benefit) => ({
      benefit_type: String(benefit.benefit_type),
      earned_cents: Number(benefit.earned_cents),
      consumed_cents: Number(benefit.consumed_cents),
    })),
    redemptions: rows(detail.redemptions, "admin redemptions").map((redemption) => ({
      id: String(redemption.id),
      benefit_type: String(redemption.benefit_type),
      amount_cents: Number(redemption.amount_cents),
      order_id: String(redemption.order_id),
      checkout_attempt_id: nullableString(redemption.checkout_attempt_id, "redemption checkout attempt ID"),
      stripe_checkout_session_id: nullableString(redemption.stripe_checkout_session_id, "redemption Stripe Checkout Session ID"),
      state: String(redemption.state),
    })),
    referrals: rows(detail.referrals, "admin referrals").map((referral) => ({
      id: String(referral.id),
      demo_party_guest_id: String(referral.demo_party_guest_id),
      status: String(referral.status),
      purchase_date: String(referral.purchase_date),
      return_period_ends_at: String(referral.return_period_ends_at),
      base_reward_cents: Number(referral.base_reward_cents),
      product_name_snapshot: String(referral.product_name_snapshot),
    })),
    auditEvents: rows(detail.auditEvents, "admin audit events").map((event) => ({
      event_type: String(event.event_type),
      actor_type: String(event.actor_type),
      created_at: String(event.created_at),
    })),
  };
}

export async function readAdminDemoPartyWithRpc(requestId: string, rpc: AdminRpc): Promise<AdminDemoPartyDetail | null> {
  const result = await rpc(requestId);
  if (result.error) throw result.error;
  return result.data ? adminDemoPartyFromRpc(result.data) : null;
}

const noStore = { "Cache-Control": "private, no-store" };

export function adminDemoPartyResponse(detail: AdminDemoPartyDetail | null): Response {
  return detail
    ? Response.json(detail, { headers: noStore })
    : Response.json({ error: "Appointment not found." }, { status: 404, headers: noStore });
}
