import type { CheckoutCorePriceRow, CheckoutPackageRow } from "./eligibility";

/** Select the authoritative database row before operational promotion pricing. */
export function yarboPackagePriceSource(
  catalogPackage: CheckoutPackageRow,
  corePrice: CheckoutCorePriceRow | null | undefined,
) {
  return corePrice?.price_mode === "core_specific" ? corePrice : catalogPackage;
}
