"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchCatalog } from "@/lib/catalog/fetch-catalog";
import type { CatalogProduct, CatalogResponse } from "@/lib/catalog/types";
import type { AccessoryCatalogResponse } from "@/lib/accessories/types";
import LymowPriceDisplay from "./LymowPriceDisplay";
import YarboStartingPriceDisplay from "./YarboStartingPriceDisplay";

export function catalogBrowseOptions(products: CatalogProduct[]) {
  return products.flatMap((product) => [...product.optionGroups.flatMap((group) => group.options), ...product.ungroupedOptions].filter((option) => !new Set(product.variants.flatMap((variant) => variant.definingOptionIds)).has(option.id) && !["lymow-5a-charger", "lymow-10a-charger"].includes(option.slug)).map((option) => ({ product, option })));
}

export function EquipmentCards({ products, aftermarketEnabled }: { products: CatalogProduct[]; aftermarketEnabled: boolean }) {
  const machines = ["lymow-one-plus", "yarbo", "pandag-g1"].map((slug) => products.find((product) => product.slug === slug)).filter((product): product is CatalogProduct => Boolean(product));
  return <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
    {machines.map((product) => { const quote = product.slug === "pandag-g1"; return <article key={product.id} className="flex flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
      <div className="flex h-56 items-center justify-center bg-slate-100 p-7"><img src={product.imageUrl} alt={product.imageAlt} className="max-h-full w-full object-contain" /></div>
      <div className="flex flex-1 flex-col p-6"><p className="text-xs font-black uppercase tracking-[.16em] text-emerald-700">{product.brand}</p><h2 className="mt-3 text-2xl font-black">{product.name}</h2><p className="mt-3 flex-1 leading-7 text-slate-600">{product.homepageSummary ?? product.fullDescription}</p>
        {!quote && <div className="mt-5"><p className="text-xs font-bold uppercase tracking-[.16em] text-slate-500">Starting at</p>{product.slug === "lymow-one-plus" ? <LymowPriceDisplay product={product} className="mt-1" priceClassName="text-2xl font-black text-emerald-700" /> : <YarboStartingPriceDisplay product={product} className="mt-1" priceClassName="text-2xl font-black text-emerald-700" />}</div>}
        {quote && <p className="mt-5 text-lg font-black text-emerald-700">Contact IDS for a Commercial Quote Today</p>}
        <div className="mt-5 grid gap-3"><Link href={`/equipment/${product.slug}`} className="rounded-xl bg-emerald-600 px-4 py-3 text-center font-black text-white hover:bg-emerald-700">{quote ? "View Pandag G1" : "View Details"}</Link>{quote && <Link href="/pandag/project-quote" className="rounded-xl border border-emerald-700 px-4 py-3 text-center font-black text-emerald-800">Request a Quote</Link>}</div>
      </div>
    </article>; })}
    <article className="flex flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl"><div className="flex h-56 items-center justify-center bg-gradient-to-br from-emerald-50 to-slate-100 p-7"><img src="/logo.png" alt="Integrity Distribution Systems accessories and parts" className="max-h-32 w-full object-contain" /></div><div className="flex flex-1 flex-col p-6"><p className="text-xs font-black uppercase tracking-[.16em] text-emerald-700">Accessories</p><h2 className="mt-3 text-2xl font-black">{aftermarketEnabled ? "Accessories & Aftermarket" : "Accessories & Parts"}</h2><p className="mt-3 flex-1 leading-7 text-slate-600">Browse Lymow and Yarbo accessories, replacement parts, charging equipment, wear items, and compatible add-ons{aftermarketEnabled ? ", plus available aftermarket products" : ""}.</p><Link href="/equipment/accessories" className="mt-5 rounded-xl bg-emerald-600 px-4 py-3 text-center font-black text-white hover:bg-emerald-700">Browse Accessories</Link></div></article>
  </div>;
}

export default function EquipmentCatalog() {
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null); const [accessories, setAccessories] = useState<AccessoryCatalogResponse | null>(null); const [error, setError] = useState("");
  useEffect(() => { const controller = new AbortController(); Promise.all([fetchCatalog({ signal: controller.signal }), fetch("/api/accessories", { cache: "no-store", signal: controller.signal }).then((response) => response.ok ? response.json() : Promise.reject(new Error("Unable to load accessories.")))]).then(([catalogValue, accessoryValue]) => { setCatalog(catalogValue); setAccessories(accessoryValue); }).catch((reason) => { if (reason?.name !== "AbortError") setError(reason instanceof Error ? reason.message : "Unable to load equipment."); }); return () => controller.abort(); }, []);
  if (error) return <p className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800">{error}</p>;
  if (!catalog || !accessories) return <p className="py-16 text-center font-bold text-slate-500">Loading equipment catalog...</p>;
  return <EquipmentCards products={catalog.products} aftermarketEnabled={accessories.settings.aftermarketEnabled} />;
}
