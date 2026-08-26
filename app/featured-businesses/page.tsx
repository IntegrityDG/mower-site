import BusinessCard, { INDEPENDENT_BUSINESS_DISCLAIMER } from "@/components/featured-businesses/BusinessCard";
import { readPublicBusinesses } from "@/lib/featured-businesses/server";
import type { FeaturedBusiness } from "@/lib/featured-businesses/types";
import { filterBusinesses } from "@/lib/featured-businesses/search";
import { US_STATES } from "@/lib/featured-businesses/location";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function FeaturedBusinessesPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  let businesses: FeaturedBusiness[] = [];
  try { businesses = await readPublicBusinesses(); } catch { /* Render a safe empty state if data is unavailable. */ }
  const params=await searchParams,q=typeof params.q==="string"?params.q:"",state=typeof params.state==="string"?params.state:"",county=typeof params.county==="string"?params.county:"",areaCode=typeof params.areaCode==="string"?params.areaCode:"";
  const filtered=filterBusinesses(businesses,{q,state,county,areaCode:/^\d{3}$/.test(areaCode)?areaCode:undefined});
  const states=[...new Set(businesses.flatMap(item=>[item.businessState,...item.serviceAreas.map(area=>area.stateCode)]).filter((value):value is string=>!!value))].sort();
  const counties=[...new Set(businesses.flatMap(item=>[...(item.businessState===state&&item.businessCounty?[item.businessCounty]:[]),...item.serviceAreas.filter(area=>area.stateCode===state&&!area.statewide).map(area=>area.countyName).filter((value):value is string=>!!value)]))].sort();
  return <main className="min-h-screen bg-slate-100 px-5 py-12 text-slate-950 md:px-10 md:py-16">
    <div className="mx-auto max-w-7xl">
      <p className="text-sm font-black uppercase tracking-[.2em] text-emerald-700">Community Support</p>
      <h1 className="mt-2 text-4xl font-black tracking-tight md:text-6xl">Supporting Small Business Spotlight</h1>
      <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-600">Discover independent small businesses IDS has chosen to highlight in support of the communities they serve.</p>
      <p className="mt-5 max-w-4xl rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">{INDEPENDENT_BUSINESS_DISCLAIMER}</p>
      <form className="mt-8 grid gap-4 rounded-2xl bg-white p-5 shadow-sm md:grid-cols-[2fr_1fr_1.3fr_0.8fr_auto]" action="/featured-businesses"><label className="font-bold">Search businesses or services<input name="q" defaultValue={q} className="mt-2 w-full rounded-xl border p-3" placeholder="land clearing, tree service…"/></label><label className="font-bold">State<select name="state" defaultValue={state} className="mt-2 w-full rounded-xl border p-3"><option value="">All states</option>{states.map(code=><option key={code} value={code}>{US_STATES.find(item=>item.code===code)?.name??code}</option>)}</select></label><label className="font-bold">County<select name="county" defaultValue={county} className="mt-2 w-full rounded-xl border p-3" disabled={!state}><option value="">All counties</option>{counties.map(item=><option key={item}>{item}</option>)}</select></label><label className="font-bold">Area Code<input name="areaCode" defaultValue={areaCode} inputMode="numeric" pattern="[0-9]{3}" maxLength={3} className="mt-2 w-full rounded-xl border p-3" placeholder="573"/></label><div className="flex items-end gap-2"><button className="min-h-12 rounded-xl bg-emerald-700 px-4 py-3 font-black text-white">Search</button><Link href="/featured-businesses" className="min-h-12 rounded-xl border px-4 py-3 font-bold">Clear Filters</Link></div></form>
      <p className="mt-6 font-bold text-slate-600">{filtered.length} {filtered.length===1?"business":"businesses"} found</p>{filtered.length ? <div className="mt-5 grid items-start gap-7 lg:grid-cols-2">{filtered.slice(0,24).map(business => <BusinessCard key={business.id} business={business} source="directory" />)}</div> : <p className="mt-5 rounded-2xl bg-white p-8 text-slate-600">No businesses match these filters. Clear the filters or try a broader search.</p>}
    </div>
  </main>;
}
