import { addressHref, phoneHref } from "@/lib/featured-businesses/validation";
import type { FeaturedBusiness } from "@/lib/featured-businesses/types";
import Image from "next/image";
import { serviceAreaLabel } from "@/lib/featured-businesses/location";

export const INDEPENDENT_BUSINESS_DISCLAIMER = "Businesses featured here are independently owned and operated. IDS provides this spotlight for informational and community-support purposes and is not responsible for their products, services, pricing, workmanship, warranties, promotions, or business practices.";
export const OFFER_DISCLAIMER = "Offers are provided and honored by the featured business. IDS is not responsible for offer terms, availability, or fulfillment.";

export default function BusinessCard({ business, source, compact=false }: { business:FeaturedBusiness; source:"homepage"|"directory"; compact?:boolean }) {
  const redirect=(destination:"website"|"facebook")=>`/api/featured-businesses/${business.id}/redirect?destination=${destination}&source=${source}`;
  return <article className={`overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm ${compact?"md:grid md:grid-cols-[minmax(220px,0.7fr)_1.3fr]":""}`}>
    {business.imageUrl ? <div className="flex min-h-52 items-center justify-center bg-slate-100 p-5"><Image src={business.imageUrl} alt={business.imageAlt || `${business.businessName} logo`} width={800} height={500} unoptimized className="max-h-64 w-full object-contain" /></div> : <div aria-hidden="true" className="flex min-h-32 items-center justify-center bg-gradient-to-br from-emerald-950 to-slate-900 text-5xl font-black text-emerald-300">{business.businessName.charAt(0)}</div>}
    <div className="min-w-0 p-6 sm:p-8"><h3 className="break-words text-2xl font-black text-slate-950">{business.businessName}</h3><p className="mt-3 whitespace-pre-wrap break-words leading-7 text-slate-600">{business.description}</p>
      <dl className="mt-5 space-y-3 text-sm">
        {!compact&&business.businessState&&<div><dt className="font-black text-slate-950">Based in</dt><dd className="mt-1 text-slate-600">{[business.businessCity,business.businessCounty,business.businessState,business.postalCode].filter(Boolean).join(", ")}</dd></div>}
        {!compact&&business.serviceAreas.length>0&&<div><dt className="font-black text-slate-950">Structured Service Areas</dt><dd className="mt-1 text-slate-600">{business.serviceAreas.map(serviceAreaLabel).join(" • ")}</dd></div>}
        {business.operatingRegion&&<div><dt className="font-black text-slate-950">Serving</dt><dd className="mt-1 break-words text-slate-600">{business.operatingRegion}</dd></div>}
        {business.phone&&<div><dt className="font-black text-slate-950">Phone</dt><dd className="mt-1"><a className="break-all font-bold text-emerald-700 underline-offset-4 hover:underline" href={phoneHref(business.phone)}>{business.phone}</a></dd></div>}
        {business.address&&<div><dt className="font-black text-slate-950">Address</dt><dd className="mt-1"><a className="break-words font-bold text-emerald-700 underline-offset-4 hover:underline" href={addressHref(business.address)} target="_blank" rel="noopener noreferrer">{business.address}</a></dd></div>}
        {business.referralCode&&<div><dt className="font-black text-slate-950">IDS Referral Code</dt><dd className="mt-1"><code className="inline-block max-w-full break-all rounded-lg bg-emerald-50 px-3 py-2 font-black text-emerald-900">{business.referralCode}</code></dd></div>}
        {business.specialOffer&&<div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><dt className="font-black text-slate-950">Special Offer</dt><dd className="mt-1 whitespace-pre-wrap break-words text-slate-700">{business.specialOffer}</dd><dd className="mt-2 text-xs leading-5 text-slate-500">{OFFER_DISCLAIMER}</dd></div>}
      </dl>
      {(business.websiteUrl||business.facebookUrl)&&<div className="mt-6 flex flex-wrap gap-3">{business.websiteUrl&&<a href={redirect("website")} target="_blank" rel="noopener noreferrer" className="min-h-11 rounded-xl bg-emerald-600 px-5 py-3 text-center font-black text-white hover:bg-emerald-700">Visit Website</a>}{business.facebookUrl&&<a href={redirect("facebook")} target="_blank" rel="noopener noreferrer" className="min-h-11 rounded-xl border border-slate-300 px-5 py-3 text-center font-black text-slate-900 hover:border-emerald-600">Facebook</a>}</div>}
    </div>
  </article>;
}
