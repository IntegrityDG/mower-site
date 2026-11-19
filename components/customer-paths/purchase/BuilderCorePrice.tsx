import type { CatalogPrice, CatalogVariant } from "@/lib/catalog/types";
import { formatCents } from "@/lib/catalog/pricing";
import BuilderPriceDisplay from "./BuilderPriceDisplay";

export default function BuilderCorePrice({ core, price, fallbackMsrp, offerName }: {
  core: CatalogVariant; price: CatalogPrice | null; fallbackMsrp?: number | null; offerName?: string;
}) {
  if (!price) return <p className="text-sm font-semibold text-slate-600">Contact for pricing</p>;
  const upcoming = price.showPublicPrice && !price.contactForPricing && price.salePhase === "upcoming" && price.salePriceCents !== null;
  const date = new Intl.DateTimeFormat("en-US", { month:"short",day:"numeric",year:"numeric",timeZone:"America/Chicago" });
  const start = Date.parse(price.saleStartsAt ?? ""), end = Date.parse(price.saleEndsAt ?? "");
  return <>
    <BuilderPriceDisplay item={price} fallbackMsrp={fallbackMsrp} offerName={offerName ?? core.name} />
    {upcoming && <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-slate-600" data-testid="y40p-upcoming-sale">
      <p className="text-xs font-bold uppercase tracking-wide">Upcoming sale</p><p className="text-base font-semibold">{formatCents(price.salePriceCents)}</p>
      {price.scheduledSaleLabel && <p className="text-xs font-semibold">{price.scheduledSaleLabel} — scheduled</p>}
      {Number.isFinite(start) && Number.isFinite(end) && <p className="text-xs font-semibold">{date.format(start)}–{date.format(end - 1)}</p>}
    </div>}
  </>;
}
