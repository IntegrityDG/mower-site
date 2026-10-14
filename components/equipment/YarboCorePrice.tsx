import type { CatalogPrice, CatalogVariant } from "@/lib/catalog/types";
import { PREORDER_BADGE } from "@/lib/catalog/preorder";
import { formatCents } from "@/lib/catalog/pricing";
import { YARBO_Y40P_SLUG } from "@/lib/catalog/yarbo-core";
import YarboPriceDisplay from "./YarboPriceDisplay";

function saleWindow(price: CatalogPrice) {
  if (!price.saleStartsAt || !price.saleEndsAt) return null;
  const date = new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago",
  });
  return `${date.format(new Date(price.saleStartsAt))}–${date.format(new Date(new Date(price.saleEndsAt).getTime() - 1))}`;
}

export function yarboCoreStatus(core: CatalogVariant) {
  return core.purchaseState === "preorder" ? PREORDER_BADGE : core.publicStatus === "coming_soon" ? "Coming Soon"
    : core.isAvailable ? "Available" : "Currently Unavailable";
}

export default function YarboCorePrice({ core, price }: {
  core: CatalogVariant;
  price: CatalogPrice | null;
}) {
  if (!price) return <p className="text-sm font-semibold text-slate-600">Contact for pricing</p>;
  if (core.slug !== YARBO_Y40P_SLUG) {
    return <YarboPriceDisplay item={price} priceClassName="text-xl font-black text-emerald-700" />;
  }
  if (!price.showPublicPrice || price.contactForPricing) {
    return <p className="text-sm font-bold text-slate-700">Contact for pricing</p>;
  }
  const activeSale = price.saleIsActive;
  const upcomingSale = price.salePriceCents !== null && price.salePhase === "upcoming";
  const currentIsMsrp = !activeSale && price.currentPriceCents !== null &&
    price.currentPriceCents === price.displayMsrpPriceCents &&
    (price.everydayLowPriceEnabled === false || price.regularPriceCents === null);
  const currentLabel = activeSale ? `${price.promotionLabel ?? "Temporary sale"} price`
    : price.everydayLowPriceEnabled !== false && price.regularPriceCents !== null && price.currentPriceCents === price.regularPriceCents
      ? "IDS Everyday Low Price" : "Current price";
  return <div className="space-y-1" data-testid="y40p-price">
    {price.displayMsrpPriceCents != null ? <>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Y40P MSRP</p>
      <p data-testid={currentIsMsrp ? "y40p-current-price" : undefined} className={`text-xl font-black ${activeSale ? "text-slate-600 line-through" : "text-slate-950"}`}>
        {formatCents(price.displayMsrpPriceCents)}
      </p>
    </> : null}
    {!currentIsMsrp && <div data-testid="y40p-current-price">
      <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">
        {currentLabel}
      </p>
      <p className="text-xl font-black text-emerald-700">{formatCents(price.currentPriceCents)}</p>
    </div>}
    {activeSale && saleWindow(price) && <p className="text-xs font-semibold text-slate-600">{saleWindow(price)}</p>}
    {upcomingSale && <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-slate-600" data-testid="y40p-upcoming-sale">
      <p className="text-xs font-bold uppercase tracking-wide">Upcoming sale</p>
      <p className="text-base font-semibold">{formatCents(price.salePriceCents)}</p>
      {price.scheduledSaleLabel && <p className="text-xs font-semibold">{price.scheduledSaleLabel} — scheduled</p>}
      {saleWindow(price) && <p className="text-xs font-semibold text-slate-600">{saleWindow(price)}</p>}
    </div>}
  </div>;
}
