"use client";

import type { CatalogProduct } from "@/lib/catalog/types";

type Props = { products: CatalogProduct[]; selectedProductId: string; onSelectProduct: (productId: string) => void };

export default function ProductSelection({ products, selectedProductId, onSelectProduct }: Props) {
  const paths = [
    { id: products.find((product) => product.slug === "lymow-one-plus")?.id, slug: "lymow-one-plus", title: "Lymow", copy: "Configure and purchase a Lymow One Plus machine with eligible accessories." },
    { id: products.find((product) => product.slug === "yarbo")?.id, slug: "yarbo", title: "Yarbo", copy: "Choose a complete Yarbo system or individual Yarbo equipment and accessories." },
    { id: "accessories", slug: "accessories", title: "Accessories & Parts", copy: "Purchase Lymow, Yarbo, or Aftermarket accessories, replacement parts, batteries, blades, tracks, cables, and more." },
  ].filter((path): path is { id: string; slug: string; title: string; copy: string } => Boolean(path.id));
  return <div><p className="text-sm font-bold uppercase tracking-[0.25em] text-emerald-700">Make Your Selections</p><h3 className="mt-3 text-3xl font-black">What would you like to purchase?</h3><div className="mt-7 grid gap-5 lg:grid-cols-3">{paths.map((path) => { const selected = selectedProductId === path.id; const product = products.find((item) => item.id === path.id); const available = product?.isAvailable !== false; return <article key={path.id} className={`flex flex-col rounded-[2rem] border p-5 ${selected ? "border-emerald-700 bg-emerald-50 shadow-xl" : "border-slate-300 bg-white"}`}>
    <div className="flex h-44 items-center justify-center rounded-2xl bg-slate-100 p-4"><img src={product?.imageUrl || "/logo.png"} alt={product?.imageAlt || "IDS accessories and parts"} className="max-h-36 w-full object-contain" /></div><h4 className="mt-5 text-2xl font-black">{path.title}</h4>{!available && <span className="mt-3 w-fit rounded-full bg-amber-100 px-3 py-1 text-sm font-black text-amber-950">Unavailable</span>}<p className="mt-3 flex-1 leading-7 text-slate-600">{path.copy}</p><button type="button" disabled={!available} onClick={() => onSelectProduct(path.id)} className={`mt-5 rounded-2xl px-4 py-3 font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 ${selected ? "bg-emerald-700" : "bg-slate-950 hover:bg-emerald-700"}`}>{!available ? "Unavailable" : selected ? "Selected" : `Select ${path.title}`}</button>
  </article>; })}</div></div>;
}
