"use client";

import { useState } from "react";
import type { CatalogProduct } from "@/lib/catalog/types";
import { purchaseGroups, purchaseGroupForSelection, purchaseGroupHasLineup } from "@/lib/catalog/purchase-groups";

type Props = { products: CatalogProduct[]; selectedProductId: string; onSelectProduct: (productId: string) => void };
type Choice = { id: string; title: string; copy: string; product?: CatalogProduct; available: boolean; groupId?: string };

export default function ProductSelection({ products, selectedProductId, onSelectProduct }: Props) {
  const groups = purchaseGroups(products);
  const [openedGroupId, setOpenedGroupId] = useState<string | null>(null);
  // Derive the brand from selection too: direct links arrive asynchronously, and
  // returning from configuration remounts this step with the original product ID.
  const group = groups.find((item) => item.id === openedGroupId)
    ?? purchaseGroupForSelection(groups, selectedProductId);
  const paths: Choice[] = group
    ? group.products.map((product) => ({
      id: product.id,
      title: product.slug === "yarbo" ? "Build a Yarbo System" : product.name,
      copy: product.slug === "yarbo"
        ? "Choose current complete-system packages, individual equipment, and accessories."
        : product.homepageSummary ?? product.fullDescription ?? "Choose this product from the catalog.",
      product,
      available: product.isAvailable !== false,
    }))
    : [
      ...groups.map((item) => ({
        id: item.products[0].id,
        title: item.name,
        copy: item.id === "yarbo"
          ? "Choose complete Yarbo systems, special editions, refurbished equipment, and accessories."
          : item.id === "lymow"
            ? "Configure and purchase a Lymow One Plus machine with eligible accessories."
            : `Choose available ${item.name} products and packages.`,
        product: item.products[0],
        available: item.products.some((product) => product.isAvailable !== false),
        groupId: purchaseGroupHasLineup(item) ? item.id : undefined,
      })),
      { id: "accessories", title: "Accessories & Parts", copy: "Purchase Lymow, Yarbo, or Aftermarket accessories, replacement parts, batteries, blades, tracks, cables, and more.", available: true },
    ];

  return <div>
    <p className="text-sm font-bold uppercase tracking-[0.25em] text-emerald-700">Make Your Selections</p>
    {group && <button type="button" onClick={() => { setOpenedGroupId(null); onSelectProduct(""); }} className="mt-4 font-bold text-emerald-700 underline">Back to brands</button>}
    <h3 className="mt-3 text-3xl font-black">{group ? `Choose your ${group.name} equipment` : "What would you like to purchase?"}</h3>
    <div className="mt-7 grid gap-5 lg:grid-cols-3">{paths.map((path) => {
      const selected = selectedProductId === path.id;
      const product = path.product;
      return <article key={path.id} className={`flex flex-col rounded-[2rem] border p-5 ${selected ? "border-emerald-700 bg-emerald-50 shadow-xl" : "border-slate-300 bg-white"}`}>
        <div className="flex h-44 items-center justify-center rounded-2xl bg-slate-100 p-4"><img src={product?.imageUrl || "/logo.png"} alt={product?.imageAlt || "IDS accessories and parts"} className="max-h-36 w-full object-contain" /></div>
        <h4 className="mt-5 text-2xl font-black">{path.title}</h4>
        {!path.available && <span className="mt-3 w-fit rounded-full bg-amber-100 px-3 py-1 text-sm font-black text-amber-950">Unavailable</span>}
        <p className="mt-3 flex-1 leading-7 text-slate-600">{path.copy}</p>
        <button type="button" disabled={!path.available} onClick={() => {
          if (path.groupId) { setOpenedGroupId(path.groupId); onSelectProduct(""); }
          else onSelectProduct(path.id);
        }} className={`mt-5 rounded-2xl px-4 py-3 font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 ${selected ? "bg-emerald-700" : "bg-slate-950 hover:bg-emerald-700"}`}>{!path.available ? "Unavailable" : selected ? "Selected" : `Select ${path.title}`}</button>
      </article>;
    })}</div>
  </div>;
}
