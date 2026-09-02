import type { DemoPartyGuest, DemoPartyPortal } from "./types";

const portalStatuses = ["pending", "approved", "denied", "cancelled"] as const;
const paymentStatuses = ["not_started", "creating", "checkout_open", "paid", "partially_refunded", "refunded"] as const;
const demoFormats = ["private", "party"] as const;
const qualificationStatuses = ["pending", "qualifying", "not_qualifying"] as const;

function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid ${name} payload.`);
  return value as Record<string, unknown>;
}

function enumValue<const T extends readonly string[]>(value: unknown, allowed: T, name: string): T[number] {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) throw new Error(`Invalid ${name} payload.`);
  return value as T[number];
}

function nullableString(value: unknown, name: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new Error(`Invalid ${name} payload.`);
  return value;
}

export function demoPartyGuestFromRpc(value: unknown): DemoPartyGuest {
  const guest = object(value, "Demo Party guest");
  return {
    id: String(guest.id),
    fullName: String(guest.fullName),
    email: String(guest.email),
    phone: String(guest.phone),
    qualificationStatus: enumValue(guest.qualificationStatus, qualificationStatuses, "guest qualification status"),
  };
}

export function demoPartyPortalFromRpc(value: unknown): DemoPartyPortal {
  const portal = object(value, "Demo Party portal");
  const benefits = object(portal.benefits, "Demo Party benefits");
  if (!Array.isArray(portal.guests)) throw new Error("Invalid Demo Party guests payload.");
  return {
    customerName: String(portal.customerName),
    propertyAddress: String(portal.propertyAddress),
    requestedStartAt: String(portal.requestedStartAt),
    equipmentInterest: nullableString(portal.equipmentInterest, "equipment interest"),
    status: enumValue(portal.status, portalStatuses, "portal status"),
    paymentStatus: enumValue(portal.paymentStatus, paymentStatuses, "payment status"),
    amountPaidCents: Number(portal.amountPaidCents),
    amountRefundedCents: Number(portal.amountRefundedCents),
    demoFormat: enumValue(portal.demoFormat, demoFormats, "demo format"),
    guestArrivalAt: nullableString(portal.guestArrivalAt, "guest arrival"),
    guestListLocked: Boolean(portal.guestListLocked),
    guests: portal.guests.map(demoPartyGuestFromRpc),
    benefits: {
      qualifyingGuests: Number(benefits.qualifyingGuests),
      feeRefundCents: Number(benefits.feeRefundCents),
      baseMachineDiscountCents: Number(benefits.baseMachineDiscountCents),
    },
    benefitCheckoutUrl: nullableString(portal.benefitCheckoutUrl, "benefit checkout URL"),
  };
}
