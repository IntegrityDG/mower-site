/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { AccessoryCatalogResponse, AccessoryItem, AccessoryTab } from "@/lib/accessories/types";
import { formatCents } from "@/lib/catalog/pricing";

const PAGE_SIZE = 6;

function price(item: AccessoryItem) {
  if (item.contactForPricing) return "Contact for pricing";
  if (item.priceText) return item.priceText;
  if (!item.showPublicPrice || item.currentPriceCents === null) return "Contact IDS";
  return formatCents(item.currentPriceCents);
}

function Disclaimer({ text }: { text: string }) {
  return <p className="mt-6 rounded-2xl border border-slate-300 bg-slate-50 p-4 text-sm leading-6 text-slate-600">{text}</p>;
}

function Card({ item }: { item: AccessoryItem }) {
  const external = item.actionType === "external";
  const showAction = external ? item.showInBuilder !== true && Boolean(item.actionUrl) : item.actionType === "contact";
  return <article className="flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
    <div className="flex aspect-[4/3] items-center justify-center bg-slate-50 p-5"><img src={item.imageUrl || "/logo.png"} alt={item.imageAlt || `${item.name} product image`} loading="lazy" className="h-full w-full object-contain" /></div>
    <div className="flex flex-1 flex-col p-5">
      <div className="flex flex-wrap gap-2"><span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black uppercase text-emerald-800">{item.tab}</span>{item.badge && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{item.badge}</span>}{item.idsExclusive && <span className="rounded-full bg-amber-300 px-3 py-1 text-xs font-black text-slate-950">IDS Exclusive</span>}</div>
      <h2 className="mt-3 text-xl font-black">{item.name}</h2><p className="mt-2 flex-1 leading-6 text-slate-600">{item.description}</p><p className="mt-4 text-lg font-black text-emerald-700">{price(item)}</p>
      {showAction && <a href={item.actionUrl || "/contact"} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined} className="mt-4 rounded-xl bg-emerald-600 px-4 py-3 text-center font-black text-white hover:bg-emerald-700">{item.actionLabel || (external ? "Go to Manufacturer's Site" : "Contact IDS")}</a>}
    </div>
  </article>;
}

export default function AccessoryCatalog() {
  const [data, setData] = useState<AccessoryCatalogResponse | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<AccessoryTab | null>(null);
  const [page, setPage] = useState(1);
  useEffect(() => { fetch("/api/accessories", { cache: "no-store" }).then(async (response) => { if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "Unable to load accessories."); return response.json(); }).then((value: AccessoryCatalogResponse) => { setData(value); const settings = value.settings; setTab(settings.lymowEnabled ? "lymow" : settings.yarboEnabled ? "yarbo" : settings.pandagEnabled ? "pandag" : settings.aftermarketEnabled ? "aftermarket" : null); }).catch((reason) => setError(reason.message)); }, []);
  const items = useMemo(() => data?.items.filter((item) => item.tab === tab).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)) ?? [], [data, tab]);
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  useEffect(() => setPage((current) => Math.min(current, pages)), [pages]);
  if (error) return <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">{error}</p>;
  if (!data) return <p className="py-16 text-center font-bold text-slate-500">Loading accessories...</p>;
  const settings = data.settings;
  const tabs = [settings.lymowEnabled && { key: "lymow" as const, label: settings.lymowLabel }, settings.yarboEnabled && { key: "yarbo" as const, label: settings.yarboLabel }, settings.pandagEnabled && { key: "pandag" as const, label: settings.pandagLabel }, settings.aftermarketEnabled && { key: "aftermarket" as const, label: settings.aftermarketLabel }].filter(Boolean) as { key: AccessoryTab; label: string }[];
  const slice = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return <div>
    <div role="tablist" aria-label="Accessory brands" className="flex gap-2 overflow-x-auto pb-3">{tabs.map((item) => <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} onClick={() => { setTab(item.key); setPage(1); }} className={`shrink-0 rounded-full px-5 py-3 font-black focus:outline-none focus:ring-2 focus:ring-emerald-600 ${tab === item.key ? "bg-emerald-600 text-white" : "border border-slate-300 bg-white text-slate-700"}`}>{item.label}</button>)}</div>
    {tab === "pandag" ? <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-8 text-center"><h2 className="text-2xl font-black">Pandag Accessories</h2><p className="mt-3 text-slate-700">{settings.pandagMessage}</p></section> : tab && <>
      {tab === "aftermarket" && settings.featuredAftermarketEnabled && settings.featuredAftermarketImageUrl && settings.featuredAftermarketHeading && settings.featuredAftermarketDescription && <><section className="mt-8 grid overflow-hidden rounded-3xl border border-slate-200 bg-white md:grid-cols-2"><div className="flex min-h-64 items-center justify-center bg-slate-50 p-6"><img src={settings.featuredAftermarketImageUrl} alt={settings.featuredAftermarketImageAlt || settings.featuredAftermarketHeading} className="max-h-80 w-full object-contain" /></div><div className="p-7">{settings.featuredAftermarketIdsExclusive && <span className="rounded-full bg-amber-300 px-3 py-1 text-xs font-black">IDS Exclusive</span>}<h2 className="mt-4 text-3xl font-black">{settings.featuredAftermarketHeading}</h2><p className="mt-4 leading-7 text-slate-600">{settings.featuredAftermarketDescription}</p></div></section><Disclaimer text={settings.aftermarketDisclaimer} /></>}
      <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">{slice.map((item) => <Card key={item.id} item={item} />)}</div>
      {!slice.length && <p className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">No accessories are currently listed in this section.</p>}
      {items.length > PAGE_SIZE && <nav aria-label="Accessory pagination" className="mt-8 flex items-center justify-center gap-4"><button type="button" disabled={page === 1} onClick={() => setPage((current) => current - 1)} className="rounded-xl border px-4 py-2 font-bold disabled:opacity-40">Previous</button><span aria-live="polite" className="font-bold">Page {page} of {pages}</span><button type="button" disabled={page === pages} onClick={() => setPage((current) => current + 1)} className="rounded-xl border px-4 py-2 font-bold disabled:opacity-40">Next</button></nav>}
      {tab === "aftermarket" && <Disclaimer text={settings.aftermarketDisclaimer} />}
    </>}
    <p className="mt-10 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center font-semibold text-slate-700">Ready to purchase eligible accessories and parts? <Link href="/#location-and-customer-path" className="font-black text-emerald-800 underline underline-offset-4">Make your selections in the IDS purchase flow.</Link></p>
  </div>;
}

export { PAGE_SIZE };
