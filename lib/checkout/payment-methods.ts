export const ACH_DISCOUNT_RATE = 0.0275;
export const ACH_DISCOUNT_RATE_LABEL = "2.75%";

export const CHECKOUT_PAYMENT_METHODS = {
  card: "card",
  ach: "ach_debit",
} as const;

export type CheckoutPaymentMethod = keyof typeof CHECKOUT_PAYMENT_METHODS;

export const paymentMethodLabels: Record<CheckoutPaymentMethod, string> = {
  card: "Card Payment",
  ach: "ACH Bank Payment",
};

export type AchPaymentDisplay = {
  discountRate: typeof ACH_DISCOUNT_RATE;
  discountRateLabel: typeof ACH_DISCOUNT_RATE_LABEL;
  regularCardTotalCents: number;
  savingsCents: number;
  discountedAchTotalCents: number;
  formattedRegularCardTotal: string;
  formattedSavings: string;
  formattedDiscountedAchTotal: string;
};

function normalizeCents(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

export function formatPaymentCents(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(normalizeCents(value) / 100);
}

export function calculateAchDiscount(
  configuredTotalCents: number
): AchPaymentDisplay {
  const regularCardTotalCents = normalizeCents(configuredTotalCents);
  const savingsCents = Math.round(
    regularCardTotalCents * ACH_DISCOUNT_RATE
  );
  const discountedAchTotalCents = regularCardTotalCents - savingsCents;

  return {
    discountRate: ACH_DISCOUNT_RATE,
    discountRateLabel: ACH_DISCOUNT_RATE_LABEL,
    regularCardTotalCents,
    savingsCents,
    discountedAchTotalCents,
    formattedRegularCardTotal: formatPaymentCents(regularCardTotalCents),
    formattedSavings: formatPaymentCents(savingsCents),
    formattedDiscountedAchTotal: formatPaymentCents(
      discountedAchTotalCents
    ),
  };
}

export function checkoutPaymentMethodValue(method: CheckoutPaymentMethod) {
  return CHECKOUT_PAYMENT_METHODS[method];
}

export function paymentMethodCheckoutPayload(method: CheckoutPaymentMethod) {
  return {
    paymentMethod: checkoutPaymentMethodValue(method),
  };
}
