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
  comparisonLabel,
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

  if (
    comparisonPriceCents !== null &&
    comparisonPriceCents > idsPriceCents
  ) {
    return (
      <div className={className}>
        <p className={labelClassName}>{comparisonLabel}</p>
        <p className={regularClassName}>{formatCents(comparisonPriceCents)}</p>
        <p className={`${labelClassName} mt-2`}>IDS Everyday Price</p>
        {item.regularPriceCents !== null && <p className={item.saleIsActive ? regularClassName : priceClassName}>{formatCents(item.regularPriceCents)}</p>}
        {item.saleIsActive && <><p className={`${labelClassName} mt-2`}>{item.promotionLabel && item.promotionLabel !== "IDS Everyday Low Price" ? item.promotionLabel : "SALE PRICE"}</p><p className={priceClassName}>{formatCents(idsPriceCents)}</p></>}
      </div>
    );
  }

  return (
    <p className={`${className} ${priceClassName}`.trim()}>
      {formatCents(idsPriceCents)}
    </p>
  );
}
