import Link from "next/link";
import { formatCents, priceLabel } from "@/lib/catalog/pricing";
import { catalogPackageIsAvailable } from "@/lib/catalog/availability";
import { lymowEnhancedPackageVariant } from "@/lib/catalog/lymow-enhanced-packages";
import type { CatalogPrice, CatalogProduct } from "@/lib/catalog/types";
import { yarboCoreCanBeSelected, yarboCorePrice, yarboCoreVariants } from "@/lib/catalog/yarbo-core";

export function featuredPackageOffers(product: CatalogProduct) {
  return product.packages.flatMap((pkg) => yarboCoreVariants(product).flatMap((core) => {
    const price = yarboCorePrice(product, core, pkg);
    return yarboCoreCanBeSelected(product, core, pkg) && price?.saleIsActive
      ? [{ id: `${pkg.id}:${core.id}`, name: pkg.name, coreName: core.name, price }]
      : [];
  }));
}

function OfferPrice({ price }: { price: CatalogPrice }) {
  return <>
    {price.saleIsActive && price.regularPriceCents !== null && price.regularPriceCents !== price.currentPriceCents && <span className="mr-2 text-sm text-slate-500 line-through">{formatCents(price.regularPriceCents)}</span>}
    <span className="text-xl font-black text-emerald-700">{priceLabel(price)}</span>
    {price.saleIsActive && <span className="ml-2 text-xs font-black uppercase text-emerald-800">{price.promotionLabel || price.scheduledSaleLabel || "Sale"}</span>}
  </>;
}

export default function MachineOfferSummary({ product }: { product: CatalogProduct }) {
  if (product.slug === "lymow-one-plus") {
    const enhanced = product.packages.flatMap(pkg => {
      const variant = lymowEnhancedPackageVariant(product, pkg);
      return variant?.isAvailable && pkg.adminManaged && catalogPackageIsAvailable(pkg) && pkg.showPublicPrice && !pkg.contactForPricing && pkg.currentPriceCents !== null
        ? [{ pkg, variant }] : [];
    });
    return <div className="mt-5 space-y-3" aria-label="Lymow configuration prices">
      {product.variants.filter((variant) => variant.isAvailable).map((variant) => <div key={variant.id} className="space-y-3">
        <div>
          <p className="text-sm font-bold text-slate-700">{variant.name}{enhanced.some(item => item.variant.id === variant.id) ? " · Mower only" : ""}</p>
          <OfferPrice price={variant} />
        </div>
        {enhanced.filter(item => item.variant.id === variant.id).map(({ pkg }) => <div key={pkg.id}>
          <p className="text-sm font-bold text-slate-700">{pkg.name}</p>
          <OfferPrice price={pkg} />
        </div>)}
      </div>)}
      {(product.variants.some((variant) => variant.isAvailable && variant.saleIsActive) || enhanced.some(({ pkg }) => pkg.saleIsActive)) && <p className="text-sm text-slate-600">See configuration details for current sale gifts, eligibility and end dates.</p>}
    </div>;
  }
  const offers = featuredPackageOffers(product);
  return <div className="mt-5">
    <p className="text-xs font-bold uppercase tracking-[.16em] text-slate-500">Core only, starting at</p>
    <span className="text-2xl font-black text-emerald-700">{priceLabel(product)}</span>
    {offers.length > 0 && <div className="mt-4 rounded-xl bg-emerald-50 p-3">
      <h3 className="font-black text-emerald-950">Current package sales</h3>
      <ul className="mt-3 space-y-3">{offers.map((offer) => <li key={offer.id}>
        <p className="text-sm font-bold text-slate-800">{offer.name} · {offer.coreName}</p>
        <OfferPrice price={offer.price} />
      </li>)}</ul>
      <Link href="/?product=yarbo#location-and-customer-path" className="mt-3 inline-block text-sm font-black text-emerald-800 underline">View sale packages, included extras and end dates</Link>
    </div>}
  </div>;
}
