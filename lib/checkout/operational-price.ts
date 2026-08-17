import { sellingPriceCents, type PricingPolicyRow } from "@/lib/pricing-program/policy";

export type OperationalPriceRow = PricingPolicyRow;

/**
 * Checkout price precedence:
 * active temporary sale, then the currently enabled IDS pricing program.
 */
export function operationalPriceCents(
  row: OperationalPriceRow,
  now = Date.now(),
  everydayLowPriceEnabled = true
) {
  return sellingPriceCents(row, everydayLowPriceEnabled, now);
}
