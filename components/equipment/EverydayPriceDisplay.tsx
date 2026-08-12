import { formatCents, priceLabel } from "@/lib/catalog/pricing";
import type { CatalogPrice } from "@/lib/catalog/types";

type EverydayPriceDisplayProps = {
  item: CatalogPrice;
  comparisonLabel: string;
  className?: string;
  priceClassName?: string;
  labelClassName?: string;
  regularClassName?: string;
};

export default function EverydayPriceDisplay({
  item,
  className = "",
  priceClassName = "text-xl font-black text-emerald-700",
  labelClassName = "text-xs font-bold uppercase tracking-[0.14em] text-slate-500",
  regularClassName = "text-sm font-bold text-slate-500 line-through",
}: EverydayPriceDisplayProps) {
  const idsPriceCents = item.currentPriceCents;
  const comparisonPriceCents = item.displayMsrpPriceCents ?? null;

  if (item.contactForPricing || !item.showPublicPrice || idsPriceCents === null) {
    return (
      <p className={`${className} ${priceClassName}`.trim()}>
        {priceLabel(item)}
      </p>
    );
  }

  return (
    <div className={className}>
      {comparisonPriceCents !== null && <><p className={labelClassName}>Manufacturer MSRP</p><p className={regularClassName}>{formatCents(comparisonPriceCents)}</p></>}
      <p className={`${labelClassName}${comparisonPriceCents !== null ? " mt-2" : ""}`}>IDS Everyday Low Price</p>
      {item.regularPriceCents !== null && <p className={item.saleIsActive ? regularClassName : priceClassName}>{formatCents(item.regularPriceCents)}</p>}
      {item.saleIsActive && <><p className={`${labelClassName} mt-2`}>Sale Price</p><p className={priceClassName}>{formatCents(idsPriceCents)}</p>{item.saleEndsAt && <p className="mt-1 text-sm font-semibold text-slate-600">Sale ends {new Intl.DateTimeFormat("en-US", { month:"long", day:"numeric", year:"numeric", timeZone:"UTC" }).format(new Date(item.saleEndsAt))}</p>}</>}
    </div>
  );
}
