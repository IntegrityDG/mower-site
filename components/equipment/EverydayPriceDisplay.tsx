import { formatCents, priceLabel } from "@/lib/catalog/pricing";
import type { CatalogPrice, CatalogPricePromotion } from "@/lib/catalog/types";

function PublicPricePromotion({ promotion }: { promotion: CatalogPricePromotion | null | undefined }) {
  if (!promotion) return null;

  return (
    <div className="mt-3 max-w-xl" data-testid="public-price-promotion">
      {promotion.message && (
        <p className="text-sm font-medium leading-relaxed text-slate-700">{promotion.message}</p>
      )}
      {promotion.imageUrl && (
        <div className={`${promotion.message ? "mt-3 " : ""}overflow-hidden rounded-lg`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- promotion dimensions are not available in catalog data */}
          <img
            src={promotion.imageUrl}
            alt="Current pricing promotion"
            className="h-auto max-w-full rounded-lg object-contain"
          />
        </div>
      )}
    </div>
  );
}

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
  const currentPriceCents = item.currentPriceCents;
  const msrpPriceCents = item.displayMsrpPriceCents ?? null;
  const everydayLowPriceEnabled = item.everydayLowPriceEnabled !== false;

  if (
    item.contactForPricing ||
    !item.showPublicPrice ||
    currentPriceCents === null
  ) {
    return (
      <div className={className}>
        <p className={priceClassName}>{priceLabel(item)}</p>
        <PublicPricePromotion promotion={item.publicPromotion} />
      </div>
    );
  }

  if (!everydayLowPriceEnabled) {
    return (
      <div className={className}>
        {msrpPriceCents !== null ? (
          <>
            <p className={labelClassName}>Manufacturer MSRP</p>
            <p className={item.saleIsActive ? regularClassName : priceClassName}>
              {formatCents(msrpPriceCents)}
            </p>
          </>
        ) : item.saleIsActive && item.regularPriceCents !== null ? (
          <>
            <p className={labelClassName}>Regular Price</p>
            <p className={regularClassName}>
              {formatCents(item.regularPriceCents)}
            </p>
          </>
        ) : (
          <>
            <p className={labelClassName}>Price</p>
            <p className={priceClassName}>{formatCents(currentPriceCents)}</p>
          </>
        )}

        {item.saleIsActive && (
          <>
            <p className={`${labelClassName} mt-2`}>Sale Price</p>
            <p className={priceClassName}>{formatCents(currentPriceCents)}</p>
            {item.saleEndsAt && (
              <p className="mt-1 text-sm font-semibold text-slate-600">
                Sale ends{" "}
                {new Intl.DateTimeFormat("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                  timeZone: "UTC",
                }).format(new Date(item.saleEndsAt))}
              </p>
            )}
          </>
        )}
        <PublicPricePromotion promotion={item.publicPromotion} />
      </div>
    );
  }

  return (
    <div className={className}>
      {msrpPriceCents !== null && (
        <>
          <p className={labelClassName}>Manufacturer MSRP</p>
          <p className={regularClassName}>{formatCents(msrpPriceCents)}</p>
        </>
      )}

      <p className={`${labelClassName}${msrpPriceCents !== null ? " mt-2" : ""}`}>
        IDS Everyday Low Price
      </p>

      {item.regularPriceCents !== null && (
        <p className={item.saleIsActive ? regularClassName : priceClassName}>
          {formatCents(item.regularPriceCents)}
        </p>
      )}

      {item.saleIsActive && (
        <>
          <p className={`${labelClassName} mt-2`}>Sale Price</p>
          <p className={priceClassName}>{formatCents(currentPriceCents)}</p>
          {item.saleEndsAt && (
            <p className="mt-1 text-sm font-semibold text-slate-600">
              Sale ends{" "}
              {new Intl.DateTimeFormat("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
                timeZone: "UTC",
              }).format(new Date(item.saleEndsAt))}
            </p>
          )}
        </>
      )}
      <PublicPricePromotion promotion={item.publicPromotion} />
    </div>
  );
}
