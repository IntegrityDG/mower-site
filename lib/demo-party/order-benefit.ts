import type { OrderPriceSnapshot } from "@/lib/checkout/types";

type BenefitCheckoutInput = {
  snapshot: OrderPriceSnapshot;
  appointmentId: string;
  baseMachineDiscountCents: number;
  regularMachineMsrpCents: number | null;
};

const cents = (value: number, name: string) => {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid ${name}.`);
  return value;
};

export type DemoPartyOrderBenefitResult =
  | { state: "existing_price_wins"; snapshot: OrderPriceSnapshot; benefitCents: 0 }
  | { state: "apply"; snapshot: OrderPriceSnapshot; benefitCents: number; machineOrderItemSourceId: string | null; machineUnitAmountCents: number | null };

export function applyDemoPartyBenefitToOrder(input: BenefitCheckoutInput): DemoPartyOrderBenefitResult {
  const { snapshot } = input;
  if (snapshot.currency !== "usd" || snapshot.paymentMethod !== "card" || snapshot.feeCents !== 0 || snapshot.shippingCents !== 0 || snapshot.taxCents !== 0) throw new Error("Demo Party benefit checkout requires a card USD merchandise order.");
  cents(input.baseMachineDiscountCents, "base discount");

  if (snapshot.purchaseMode === "accessories" || snapshot.discountCents !== 0) throw new Error("Machine Demo Party pricing cannot stack with another discount route.");
  const regularMsrpCents = input.regularMachineMsrpCents;
  if (regularMsrpCents === null) throw new Error("The selected machine does not have an authoritative regular MSRP.");
  cents(regularMsrpCents, "regular MSRP");
  const machineItem = snapshot.chargeableItems.find((item) => ["product", "variant", "package"].includes(item.itemType) && !item.includedInPackagePrice);
  if (!machineItem || machineItem.quantity !== 1) throw new Error("An eligible machine line could not be identified.");
  const requestedBenefit = cents(input.baseMachineDiscountCents, "machine benefit");
  const benefitCents = Math.min(requestedBenefit, regularMsrpCents);
  const demoMachinePrice = regularMsrpCents - benefitCents;
  if (machineItem.extendedAmountCents <= demoMachinePrice) return { state: "existing_price_wins", snapshot, benefitCents: 0 };
  const chargeableItems = snapshot.chargeableItems.map((item) => item === machineItem ? Object.freeze({ ...item, unitAmountCents: regularMsrpCents, extendedAmountCents: regularMsrpCents }) : item);
  const subtotalCents = snapshot.subtotalCents - machineItem.extendedAmountCents + regularMsrpCents;
  return {
    state: "apply",
    benefitCents,
    machineOrderItemSourceId: machineItem.sourceId,
    machineUnitAmountCents: regularMsrpCents,
    snapshot: Object.freeze({
      ...snapshot,
      chargeableItems: Object.freeze(chargeableItems),
      subtotalCents,
      discountCents: benefitCents,
      totalCents: subtotalCents - benefitCents,
      warnings: Object.freeze([...snapshot.warnings, `Demo Party MSRP machine pricing applied: ${benefitCents} cents.`]),
      safeMetadata: { phase: "demo-party-v1" as const, pricingRoute: "msrp_machine" as const, appointmentId: input.appointmentId, benefitCents, regularMsrpCents },
    }),
  };
}
