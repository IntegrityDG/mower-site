export const CUSTOMER_PAYMENT_METHODS = ["card", "ach_debit", "hearth_financing"] as const;
export type CustomerPaymentMethod = typeof CUSTOMER_PAYMENT_METHODS[number];

export type PaymentMethodSettings = Record<CustomerPaymentMethod, boolean>;

export type PublicPaymentMethodAvailability = {
  card: boolean;
  achDebit: boolean;
  hearthFinancing: boolean;
};

export type PaymentMethodAvailabilityLoadState =
  | { status: "loading"; availability: null }
  | { status: "ready"; availability: PublicPaymentMethodAvailability }
  | { status: "error"; availability: null };

export const FAIL_SAFE_PAYMENT_METHOD_SETTINGS: PaymentMethodSettings = {
  card: false,
  ach_debit: false,
  hearth_financing: false,
};

export const SEEDED_PAYMENT_METHOD_SETTINGS: PaymentMethodSettings = {
  card: true,
  ach_debit: false,
  hearth_financing: true,
};

export function toPublicPaymentMethodAvailability(settings: PaymentMethodSettings, achEnvironmentEnabled: boolean): PublicPaymentMethodAvailability {
  return { card: settings.card, achDebit: settings.ach_debit && achEnvironmentEnabled, hearthFinancing: settings.hearth_financing };
}

export function isPublicPaymentMethodAvailability(
  value: unknown,
): value is PublicPaymentMethodAvailability {
  if (!value || typeof value !== "object") return false;

  const availability = value as Record<string, unknown>;
  return (
    typeof availability.card === "boolean" &&
    typeof availability.achDebit === "boolean" &&
    typeof availability.hearthFinancing === "boolean"
  );
}

export function customerPurchaseMethodIsAvailable(method: "pay-in-full" | "ach" | "hearth-financing", availability: PublicPaymentMethodAvailability, checkoutAvailable: boolean) {
  if (method === "pay-in-full") return availability.card;
  if (method === "ach") return checkoutAvailable && availability.achDebit;
  return availability.hearthFinancing;
}
