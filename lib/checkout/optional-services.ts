import type { CheckoutRequest, MachineOptionalServices, OrderPriceSnapshot } from "./types";
import { CheckoutRejectionError } from "./types";
import { SUPPORT_MONTHLY_CENTS } from "@/lib/service/policy";

export const EMPTY_OPTIONAL_SERVICES: MachineOptionalServices = { install: false, setup: false, remoteSupport: false, acceptedSupportTerms: false };
export type MachineServiceAvailability = Record<"install" | "setup" | "remoteSupport", { available: boolean; message: string }>;
export const SUPPORT_CHECKOUT_NOTICE = "$100 for your first Remote Support month is included today. Activates 10 days after payment confirmation, then renews at $100/month after the first paid month. Four issue-based sessions per cycle; no rollover or partial-month refunds. Cancel through your private subscription link.";
export const optionalServicesSelected = (value?: MachineOptionalServices) => Boolean(value && (value.install || value.setup || value.remoteSupport));
export function parseOptionalServices(value: unknown): MachineOptionalServices {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Optional Services.");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).length !== 4 || Object.keys(input).some(key => !Object.hasOwn(EMPTY_OPTIONAL_SERVICES, key)) || Object.values(input).some(item => typeof item !== "boolean") || (input.remoteSupport && input.acceptedSupportTerms !== true)) throw new Error("Choose valid Optional Services and accept recurring terms when subscribing.");
  return { install: input.install as boolean, setup: input.setup as boolean, remoteSupport: input.remoteSupport as boolean, acceptedSupportTerms: input.remoteSupport === true && input.acceptedSupportTerms === true };
}
export function addOptionalServices(snapshot: OrderPriceSnapshot, request: CheckoutRequest, availability: MachineServiceAvailability | boolean): OrderPriceSnapshot {
  if (!optionalServicesSelected(request.optionalServices)) return snapshot;
  const services = parseOptionalServices(request.optionalServices);
  const current = typeof availability === "boolean" ? { install: { available: true, message: "" }, setup: { available: true, message: "" }, remoteSupport: { available: availability, message: "" } } : availability;
  if (snapshot.purchaseMode === "accessories") throw new CheckoutRejectionError("INCOMPATIBLE_SELECTION", "Optional Services are offered with a machine purchase.");
  for (const [selected, label] of [["install", "Professional Installation"], ["setup", "Professional Setup & Optimization"], ["remoteSupport", "Remote Support"]] as const) {
    if (services[selected] && !current[selected].available) throw new CheckoutRejectionError("INCOMPATIBLE_SELECTION", current[selected].message || `${label} is CURRENTLY UNAVAILABLE.`);
  }
  if (services.remoteSupport && !["card", "ach_debit"].includes(snapshot.paymentMethod)) throw new CheckoutRejectionError("INCOMPATIBLE_SELECTION", "Remote Support requires available card or ACH checkout with monthly payment authorization.");
  const amount = services.remoteSupport ? SUPPORT_MONTHLY_CENTS : 0;
  // The equipment's existing bank discount remains unchanged. Support is $100
  // in full, represented as its own service line in the combined order.
  return Object.freeze({ ...snapshot, optionalServices: services, subtotalCents: snapshot.subtotalCents + amount, totalCents: snapshot.totalCents + amount,
    chargeableItems: Object.freeze([...snapshot.chargeableItems, ...(amount ? [{ itemType: "fee" as const, sourceId: "ids-remote-support-v1", sku: "IDS-REMOTE-SUPPORT", name: "Remote Support — first month", description: SUPPORT_CHECKOUT_NOTICE, quantity: 1, unitAmountCents: amount, extendedAmountCents: amount, includedInPackagePrice: false, parentSourceId: null }] : [])]) });
}
