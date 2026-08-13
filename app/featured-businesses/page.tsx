import BusinessCard, { INDEPENDENT_BUSINESS_DISCLAIMER } from "@/components/featured-businesses/BusinessCard";
import { readPublicBusinesses } from "@/lib/featured-businesses/server";
import type { FeaturedBusiness } from "@/lib/featured-businesses/types";

export const dynamic = "force-dynamic";

export default async function FeaturedBusinessesPage() {
  let businesses: FeaturedBusiness[] = [];
  try { businesses = await readPublicBusinesses(); } catch { /* Render a safe empty state if data is unavailable. */ }
  return <main className="min-h-screen bg-slate-100 px-5 py-12 text-slate-950 md:px-10 md:py-16">
    <div className="mx-auto max-w-7xl">
      <p className="text-sm font-black uppercase tracking-[.2em] text-emerald-700">Community Support</p>
      <h1 className="mt-2 text-4xl font-black tracking-tight md:text-6xl">Supporting Small Business Spotlight</h1>
      <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-600">Discover independent small businesses IDS has chosen to highlight in support of the communities they serve.</p>
      <p className="mt-5 max-w-4xl rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">{INDEPENDENT_BUSINESS_DISCLAIMER}</p>
      {businesses.length ? <div className="mt-10 grid items-start gap-7 lg:grid-cols-2">{businesses.map(business => <BusinessCard key={business.id} business={business} source="directory" />)}</div> : <p className="mt-10 rounded-2xl bg-white p-8 text-slate-600">No businesses are currently featured. Please check back soon.</p>}
    </div>
  </main>;
}
