import { formatCents, priceLabel } from "@/lib/catalog/pricing";
import type { CatalogPrice } from "@/lib/catalog/types";

/** Inherit a campaign title only from a matching active window or matching sale message/end in this family. */
export function matchingBuilderSaleLabel(item: CatalogPrice, family: readonly CatalogPrice[]) {
  if (!item.saleIsActive || !item.saleEndsAt) return undefined;
  const labels = new Set(family.filter(peer => peer.saleIsActive && peer.saleEndsAt === item.saleEndsAt && (Boolean(item.saleStartsAt) && peer.saleStartsAt === item.saleStartsAt || Boolean(item.publicPromotion?.context === "sale" && item.publicPromotion.message?.trim()) && peer.publicPromotion?.context === "sale" && peer.publicPromotion.message?.trim() === item.publicPromotion?.message?.trim()))
    .map(peer => peer.promotionLabel?.trim() || peer.scheduledSaleLabel?.trim()).filter(Boolean));
  return labels.size === 1 ? [...labels][0] : undefined;
}

/** Presentation only: never derives a selling price or changes order identity. */
export default function BuilderPriceDisplay({ item, fallbackMsrp, offerName, saleLabel, className = "", priceClassName = "text-xl font-black text-emerald-700" }: {
  item: CatalogPrice; fallbackMsrp?: number | null; offerName?: string; saleLabel?: string;
  className?: string; priceClassName?: string;
}) {
  if (item.contactForPricing || !item.showPublicPrice || item.currentPriceCents === null) {
    return <p className={className}>{priceLabel(item)}</p>;
  }
  const msrp = item.displayMsrpPriceCents ?? fallbackMsrp;
  const sale = item.saleIsActive;
  const titleSale = offerName?.match(/Early Black Friday|Black Friday Encore|Encore Black Friday|Black Friday/i)?.[0];
  const saleName = item.promotionLabel?.trim() || item.scheduledSaleLabel?.trim() || saleLabel || titleSale;
  const phase = saleName?.match(/early.*black friday|black friday.*early/i) ? "Early Black Friday"
    : saleName?.match(/encore.*black friday|black friday.*encore/i) ? "Encore Black Friday"
    : saleName?.match(/main.*black friday|black friday.*main/i) ? "Main Black Friday" : null;
  const label = sale ? phase ? `${phase} Price!` : saleName ? /price!?$/i.test(saleName) ? saleName : `${saleName} Price!` : "Sale Price"
    : item.everydayLowPriceEnabled !== false && item.regularPriceCents !== null ? "IDS Everyday Low Price" : "Current Price";
  const end = item.saleEndsAt ? new Date(item.saleEndsAt) : null;
  const validEnd = end && Number.isFinite(end.getTime());
  const promotion = item.publicPromotion && (!sale || item.publicPromotion.context === "sale") ? item.publicPromotion : null;
  return <div className={className} data-testid="builder-price">
    {msrp != null && <><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Manufacturer MSRP</p><p className="text-sm font-bold text-slate-500 line-through">{formatCents(msrp)}</p></>}
    <p className="mt-2 text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
    <p className={priceClassName}>{formatCents(item.currentPriceCents)}</p>
    {sale && validEnd && end && <p className="mt-1 text-sm font-semibold text-slate-600">Sale ends {new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago", timeZoneName: "short" }).format(end)}</p>}
    {promotion && <div className="mt-3 max-w-xl" data-testid="public-price-promotion">
      {promotion.message && <p className="text-sm font-medium leading-relaxed text-slate-700">{promotion.message}</p>}
      {/* eslint-disable-next-line @next/next/no-img-element -- catalog promotion artwork */}
      {promotion.imageUrl && <img src={promotion.imageUrl} alt="Current pricing promotion" className="mt-3 h-auto max-w-full rounded-lg object-contain" />}
    </div>}
  </div>;
}
