"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import CatalogHeader from "@/components/equipment/CatalogHeader";
import { priceLabel } from "@/lib/catalog/pricing";
import type { CatalogProduct, CatalogResponse } from "@/lib/catalog/types";

export default function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [product, setProduct] = useState<CatalogProduct | null>(null);
  const [status, setStatus] = useState("Loading product…");
  useEffect(() => { const controller = new AbortController(); fetch("/api/catalog", { signal: controller.signal }).then(async (response) => {
    const payload = (await response.json()) as CatalogResponse & { error?: string }; if (!response.ok) throw new Error(payload.error ?? "Unable to load product.");
    const match = payload.products.find((item) => item.slug === slug); if (!match) throw new Error("Product not found."); setProduct(match);
  }).catch((reason: unknown) => { if (!(reason instanceof DOMException && reason.name === "AbortError")) setStatus(reason instanceof Error ? reason.message : "Unable to load product."); }); return () => controller.abort(); }, [slug]);
  if (!product) return <div className="min-h-screen bg-slate-50"><CatalogHeader /><p className="mx-auto max-w-7xl px-6 py-20 font-bold text-slate-600">{status}</p></div>;
  const options = [...product.optionGroups.flatMap((group) => group.options), ...product.ungroupedOptions];
  const included = options.filter((item) => item.isIncluded);
  const optional = options.filter((item) => !item.isIncluded);
  return <div className="min-h-screen bg-slate-50 text-slate-950"><CatalogHeader /><main>
    <section className="bg-gradient-to-br from-slate-950 to-emerald-950 px-5 py-14 text-white sm:px-8"><div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-2">
      <div><Link href="/equipment" className="text-sm font-bold text-emerald-300">← Equipment catalog</Link><p className="mt-8 text-sm font-black uppercase tracking-[0.22em] text-emerald-400">{product.brand}</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl">{product.page?.heroHeading ?? product.name}</h1><p className="mt-6 text-lg leading-8 text-slate-200">{product.page?.heroSubheading ?? product.fullDescription ?? product.homepageSummary}</p>
        <p className="mt-7 text-3xl font-black">{priceLabel(product)}</p><div className="mt-7 flex flex-col gap-3 sm:flex-row"><Link href="/#location-and-customer-path" className="rounded-2xl bg-emerald-500 px-7 py-4 text-center font-black text-slate-950 hover:bg-emerald-400">Build Your System</Link><Link href="/#location-and-customer-path" className="rounded-2xl border border-white/30 px-7 py-4 text-center font-bold hover:bg-white/10">Ask a Question</Link></div>
      </div><div className="flex min-h-80 items-center justify-center rounded-[2rem] bg-white/95 p-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={product.imageUrl} alt={product.imageAlt} className="max-h-[28rem] w-full object-contain" />
      </div>
    </div></section>
    <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8"><div className="grid gap-5 md:grid-cols-3">
      {product.propertyScale && <Info label="Best fit" value={product.propertyScale} />}{product.capabilityLevel && <Info label="Capability" value={product.capabilityLevel} />}{product.customerGuidance && <Info label="IDS guidance" value={product.customerGuidance} />}
    </div>
    {product.page?.sections.length ? <div className="mt-14"><p className="text-sm font-black uppercase tracking-[0.2em] text-emerald-700">Product information</p><div className="mt-5 grid gap-5 md:grid-cols-2">{product.page.sections.map((section) => <article key={section.id} className="rounded-3xl border border-slate-200 bg-white p-7"><h2 className="text-2xl font-black">{section.heading}</h2><p className="mt-4 whitespace-pre-line leading-7 text-slate-600">{section.bodyContent}</p></article>)}</div></div> : null}
    <div id="compatible-equipment" className="mt-14 scroll-mt-8"><p className="text-sm font-black uppercase tracking-[0.2em] text-emerald-700">Compatible equipment</p><h2 className="mt-3 text-3xl font-black">Included and optional equipment</h2>
      {included.length > 0 && <EquipmentList title="Included with the system" items={included} />}
      {optional.length > 0 && <EquipmentList title="Optional attachments and accessories" items={optional} />}
      {!options.length && <p className="mt-5 rounded-2xl bg-white p-6 text-slate-600">No compatible equipment is currently published for this product.</p>}
    </div>
    <div className="mt-14 rounded-[2rem] bg-slate-950 p-8 text-white sm:p-10"><h2 className="text-3xl font-black">{product.slug === "lymow-one-plus" ? "Ready to Build Your System?" : "Ready to plan the complete system?"}</h2><p className="mt-3 max-w-2xl leading-7 text-slate-300">{product.slug === "lymow-one-plus" ? "Choose your Lymow One Plus configuration, compatible accessories, delivery options, and eligible IDS support services in the guided system builder." : "Choose the machine, compatible equipment, and eligible IDS support services in the guided builder. No payment is collected online."}</p><Link href="/#location-and-customer-path" className="mt-6 inline-flex rounded-2xl bg-emerald-500 px-7 py-4 font-black text-slate-950">Build Your System</Link></div>
    </section></main></div>;
}

function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-3xl border border-slate-200 bg-white p-6"><p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">{label}</p><p className="mt-3 leading-7 text-slate-700">{value}</p></div>; }
function EquipmentList({ title, items }: { title: string; items: CatalogProduct["ungroupedOptions"] }) { return <div className="mt-7"><h3 className="text-xl font-black">{title}</h3><div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map((item) => <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex justify-between gap-4"><h4 className="font-black">{item.name}</h4><span className="shrink-0 text-sm font-bold text-emerald-700">{item.isIncluded ? "Included" : priceLabel(item)}</span></div><p className="mt-3 text-sm leading-6 text-slate-600">{item.description ?? "Compatible with this product configuration."}</p>{!item.isIncluded && <Link href="/#location-and-customer-path" className="mt-4 inline-flex text-sm font-black text-emerald-700">Add when building your system →</Link>}</article>)}</div></div>; }
