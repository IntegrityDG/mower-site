import EverydayPriceDisplay from "./EverydayPriceDisplay";
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
  return (
    <EverydayPriceDisplay
      item={item}
      comparisonLabel="Yarbo Everyday Price"
      className={className}
      priceClassName={priceClassName}
      labelClassName={labelClassName}
      regularClassName={regularClassName}
    />
  );
}
