import type { CheckoutPaymentMethod, OrderPriceItem } from "./types";

export const BANK_PAYMENT_DISCOUNT_BPS = 275;
export const BASIS_POINTS_DENOMINATOR = 10_000;
export const BANK_PAYMENT_DISCOUNT_POLICY = "bank-payment-275bps-v1" as const;

export function resolvePaymentAdjustments(subtotalCents: number, paymentMethod: CheckoutPaymentMethod) {
  if (!Number.isSafeInteger(subtotalCents) || subtotalCents < 0) throw new Error("Invalid merchandise subtotal.");
  if (!["card", "ach_debit", "wire_transfer"].includes(paymentMethod)) throw new Error("Unsupported payment method.");
  const discountCents = paymentMethod === "card" ? 0 : Math.round(subtotalCents * BANK_PAYMENT_DISCOUNT_BPS / BASIS_POINTS_DENOMINATOR);
  const totalCents = subtotalCents - discountCents;
  if (!Number.isSafeInteger(discountCents) || discountCents < 0 || !Number.isSafeInteger(totalCents) || totalCents < 0) throw new Error("Invalid payment adjustment.");
  return Object.freeze({ subtotalCents, discountCents, feeCents: 0 as const, shippingCents: 0 as const, taxCents: 0 as const, totalCents, discountPolicy: paymentMethod === "card" ? "none" as const : BANK_PAYMENT_DISCOUNT_POLICY });
}

export function allocateDiscountedBankItems(items: readonly OrderPriceItem[], discountCents: number) {
  const chargeable = items.filter((item) => !item.includedInPackagePrice && item.extendedAmountCents > 0);
  const subtotal = chargeable.reduce((sum, item) => sum + item.extendedAmountCents, 0);
  if (!Number.isSafeInteger(subtotal) || subtotal < 1 || !Number.isSafeInteger(discountCents) || discountCents < 0 || discountCents > subtotal) throw new Error("Invalid bank-payment line allocation.");
  const target = subtotal - discountCents;
  const raw = chargeable.map((item, index) => {
    const numerator = item.extendedAmountCents * target;
    const floor = Math.floor(numerator / subtotal);
    return { item, index, amount: floor, remainder: numerator - floor * subtotal };
  });
  let remaining = target - raw.reduce((sum, row) => sum + row.amount, 0);
  for (const row of [...raw].sort((a, b) => b.remainder - a.remainder || a.index - b.index)) {
    if (remaining < 1) break;
    row.amount += 1;
    remaining -= 1;
  }
  if (remaining !== 0 || raw.some((row) => row.amount < 0) || raw.reduce((sum, row) => sum + row.amount, 0) !== target) throw new Error("Bank-payment line allocation failed.");
  return raw.filter((row) => row.amount > 0).map(({ item, amount }) => Object.freeze({ name: item.quantity > 1 ? `${item.name} × ${item.quantity}` : item.name, description: item.description, amountCents: amount }));
}
