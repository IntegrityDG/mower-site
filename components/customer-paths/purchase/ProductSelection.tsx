"use client";

import { useState } from "react";

import { priceLabel } from "@/lib/catalog/pricing";
import type { CatalogProduct } from "@/lib/catalog/types";
import { isYarboProduct } from "@/lib/catalog/yarbo";
import LymowPriceDisplay from "@/components/equipment/LymowPriceDisplay";
import YarboStartingPriceDisplay from "@/components/equipment/YarboStartingPriceDisplay";

import ProductDetailsModal from "./ProductDetailsModal";

type ProductSelectionProps = {
  products: CatalogProduct[];
  selectedProductId: string;
  onSelectProduct: (productId: string) => void;
};

export default function ProductSelection({
  products,
  selectedProductId,
  onSelectProduct,
}: ProductSelectionProps) {
  const [detailsProduct, setDetailsProduct] = useState<CatalogProduct | null>(
    null
  );

  return (
    <div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] gap-5">
        {products.map((product) => {
          const isSelected = selectedProductId === product.id;

          return (
            <article
              key={product.id}
              className={`flex h-full flex-col rounded-[2rem] border p-5 transition ${
                isSelected
                  ? "border-emerald-700 bg-emerald-50 shadow-xl"
                  : "border-slate-300 bg-white shadow-sm hover:-translate-y-1 hover:border-emerald-500 hover:shadow-xl"
              }`}
            >
              <div className="flex h-44 items-center justify-center overflow-hidden rounded-2xl bg-slate-100 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={product.imageUrl}
                  alt={product.imageAlt}
                  className="max-h-40 w-full object-contain"
                />
              </div>

              <div className="mt-5 flex items-center justify-between gap-3">
                <span
                  className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] ${
                    isSelected
                      ? "bg-emerald-700 text-white"
                      : "bg-slate-950 text-white"
                  }`}
                >
                  {isSelected ? "Selected" : product.capabilityLevel ?? "Machine"}
                </span>
                {product.slug === "lymow-one-plus" ? (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                      Starting at
                    </p>
                    <LymowPriceDisplay
                      product={product}
                      className="mt-1"
                      priceClassName="text-sm font-black text-emerald-700"
                    />
                  </div>
                ) : isYarboProduct(product) ? (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                      Starting at
                    </p>
                    <YarboStartingPriceDisplay
                      product={product}
                      className="mt-1"
                      priceClassName="text-sm font-black text-emerald-700"
                    />
                  </div>
                ) : (
                  <span className="text-sm font-black text-emerald-700">
                    {priceLabel(product)}
                  </span>
                )}
              </div>

              <h4 className="mt-4 text-2xl font-black text-slate-950">
                {product.name}
              </h4>

              <p className="mt-3 flex-1 leading-7 text-slate-600">
                {product.homepageSummary ?? product.fullDescription}
              </p>

              <div className="mt-5 text-center text-xs font-bold text-slate-600">
                <div className="rounded-xl bg-slate-100 px-3 py-2">
                  {product.packages.length} packages
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setDetailsProduct(product)}
                  className="rounded-2xl border border-slate-300 bg-white px-4 py-3 font-bold text-slate-950 transition hover:border-slate-950"
                >
                  View Full Details
                </button>
                <button
                  type="button"
                  onClick={() => onSelectProduct(product.id)}
                  className={`rounded-2xl px-4 py-3 font-black transition ${
                    isSelected
                      ? "bg-emerald-700 text-white"
                      : "bg-slate-950 text-white hover:bg-emerald-700"
                  }`}
                >
                  {isSelected ? "Selected" : "Select Machine"}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {detailsProduct && (
        <ProductDetailsModal
          product={detailsProduct}
          isSelected={selectedProductId === detailsProduct.id}
          onClose={() => setDetailsProduct(null)}
          onSelect={() => onSelectProduct(detailsProduct.id)}
        />
      )}
    </div>
  );
}
