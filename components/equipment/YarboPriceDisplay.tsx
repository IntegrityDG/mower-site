import { formatCents, priceLabel } from "@/lib/catalog/pricing";
import type { CatalogPrice } from "@/lib/catalog/types";

type YarboPriceDisplayProps = {
  item: CatalogPrice;
  className?: string;
  priceClassName?: string;
  labelClassName?: string;
  regularClassName?: string;
};

export default function YarboPriceDisplay({
  item,
  className = "",
  priceClassName = "text-xl font-black text-emerald-700",
  labelClassName = "text-xs font-bold uppercase tracking-[0.14em] text-slate-500",
  regularClassName = "text-sm font-bold text-slate-500 line-through",
}: YarboPriceDisplayProps) {
  const idsPriceCents = item.currentPriceCents;
  const yarboPriceCents = item.regularPriceCents;

  if (item.contactForPricing || !item.showPublicPrice || idsPriceCents === null) {
    return (
      <p className={`${className} ${priceClassName}`.trim()}>
        {priceLabel(item)}
      </p>
    );
  }

  if (yarboPriceCents !== null && yarboPriceCents > idsPriceCents) {
    return (
      <div className={className}>
        <p className={labelClassName}>Yarbo Everyday Price</p>
        <p className={regularClassName}>{formatCents(yarboPriceCents)}</p>
        <p className={`${labelClassName} mt-2`}>IDS Everyday Price</p>
        <p className={priceClassName}>{formatCents(idsPriceCents)}</p>
      </div>
    );
  }

  return (
    <p className={`${className} ${priceClassName}`.trim()}>
      {formatCents(idsPriceCents)}
    </p>
  );
}
