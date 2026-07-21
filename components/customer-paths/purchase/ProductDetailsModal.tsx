"use client";

import { useEffect } from "react";

import YarboPriceDisplay from "@/components/equipment/YarboPriceDisplay";
import { priceLabel } from "@/lib/catalog/pricing";
import type { CatalogProduct } from "@/lib/catalog/types";
import { isYarboProduct } from "@/lib/catalog/yarbo";

type ProductDetailsModalProps = {
  product: CatalogProduct;
  onClose: () => void;
  onSelect: () => void;
  isSelected: boolean;
};

export default function ProductDetailsModal({
  product,
  onClose,
  onSelect,
  isSelected,
}: ProductDetailsModalProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`${product.name} details`}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-[2rem] bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur md:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">
              {product.brand}
            </p>
            <h3 className="mt-1 text-2xl font-black text-slate-950">
              {product.page?.heroHeading ?? product.name}
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-300 text-2xl font-bold text-slate-700 transition hover:border-slate-950 hover:text-slate-950"
            aria-label="Close product details"
          >
            ×
          </button>
        </div>

        <div className="grid gap-8 p-6 md:p-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <div className="flex min-h-72 items-center justify-center overflow-hidden rounded-[2rem] bg-slate-100 p-5">
              {/* Dynamic catalog images may come from manufacturer/CDN URLs. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={product.imageUrl}
                alt={product.imageAlt}
                className="max-h-80 w-full object-contain"
              />
            </div>

            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
                Starting Price
              </p>
              {isYarboProduct(product) ? (
                <YarboPriceDisplay
                  item={product}
                  className="mt-2"
                  priceClassName="text-3xl font-black text-slate-950"
                />
              ) : (
                <p className="mt-2 text-3xl font-black text-slate-950">
                  {priceLabel(product)}
                </p>
              )}
              {product.packages.length > 0 && (
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Package pricing includes the base platform and listed package
                  equipment. Select a package in the next step.
                </p>
              )}
            </div>
          </div>

          <div>
            <p className="text-lg leading-8 text-slate-700">
              {product.page?.heroSubheading ??
                product.fullDescription ??
                product.homepageSummary}
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {product.capabilityLevel && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                    Capability
                  </p>
                  <p className="mt-2 font-black text-slate-950">
                    {product.capabilityLevel}
                  </p>
                </div>
              )}

              {product.propertyScale && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                    Best Fit
                  </p>
                  <p className="mt-2 font-black text-slate-950">
                    {product.propertyScale}
                  </p>
                </div>
              )}
            </div>

            {product.customerGuidance && (
              <div className="mt-5 rounded-2xl border border-slate-300 p-5">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
                  IDS Guidance
                </p>
                <p className="mt-2 leading-7 text-slate-700">
                  {product.customerGuidance}
                </p>
              </div>
            )}

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-slate-950 p-4 text-white">
                <p className="text-2xl font-black">{product.variants.length}</p>
                <p className="mt-1 text-sm text-slate-300">Configurations</p>
              </div>
              <div className="rounded-2xl bg-slate-950 p-4 text-white">
                <p className="text-2xl font-black">{product.packages.length}</p>
                <p className="mt-1 text-sm text-slate-300">Packages</p>
              </div>
              <div className="rounded-2xl bg-slate-950 p-4 text-white">
                <p className="text-2xl font-black">
                  {product.optionGroups.reduce(
                    (count, group) => count + group.options.length,
                    product.ungroupedOptions.length
                  )}
                </p>
                <p className="mt-1 text-sm text-slate-300">Options</p>
              </div>
            </div>
          </div>
        </div>

        {product.page?.sections.length ? (
          <div className="border-t border-slate-200 bg-slate-50 px-6 py-8 md:px-10">
            <div className="grid gap-5 md:grid-cols-3">
              {product.page.sections.map((section) => (
                <article
                  key={section.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5"
                >
                  <h4 className="text-lg font-black text-slate-950">
                    {section.heading}
                  </h4>
                  <p className="mt-3 leading-7 text-slate-600">
                    {section.bodyContent}
                  </p>
                </article>
              ))}
            </div>
          </div>
        ) : null}

        <div className="sticky bottom-0 flex flex-col gap-3 border-t border-slate-200 bg-white/95 px-6 py-5 backdrop-blur sm:flex-row sm:justify-end md:px-10">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-300 bg-white px-6 py-4 font-bold text-slate-950"
          >
            Keep Comparing
          </button>
          <button
            type="button"
            onClick={() => {
              onSelect();
              onClose();
            }}
            className="rounded-2xl bg-emerald-600 px-6 py-4 font-black text-white shadow-lg transition hover:bg-emerald-700"
          >
            {isSelected ? "Continue With This Machine" : `Select ${product.name}`}
          </button>
        </div>
      </div>
    </div>
  );
}
