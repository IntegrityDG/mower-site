"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { fetchCatalog } from "@/lib/catalog/fetch-catalog";
import { customerFacingProductOptions } from "@/lib/catalog/customer-facing-options";
import { formatCents, priceLabel } from "@/lib/catalog/pricing";
import { isQuoteOnlyProduct } from "@/lib/catalog/sales-mode";
import type { CatalogProduct, CatalogResponse } from "@/lib/catalog/types";
import {
  YARBO_MODULE_ONLY_NOTICE,
  isYarboModuleOption,
  isYarboProduct,
  yarboOptionDisplayName,
} from "@/lib/catalog/yarbo";

import YarboPriceDisplay from "./YarboPriceDisplay";
import LymowPriceDisplay from "./LymowPriceDisplay";
import YarboStartingPriceDisplay from "./YarboStartingPriceDisplay";

type Filter =
  | "all"
  | "mowers"
  | "attachments"
  | "accessories"
  | "charging"
  | "parts";

const filters: { key: Filter; label: string }[] = [
  { key: "all", label: "Robotic Mowers" },
  { key: "attachments", label: "Attachments" },
  { key: "accessories", label: "Accessories" },
  { key: "charging", label: "Charging Equipment" },
  { key: "parts", label: "Replacement Parts" },
];

export function catalogBrowseOptions(products: CatalogProduct[]) {
  return products.flatMap((product) =>
    customerFacingProductOptions(product).map((option) => ({ product, option }))
  );
}

function optionKind(name: string): Exclude<Filter, "all" | "mowers"> {
  const value = name.toLowerCase();
  if (/charger|charging|power supply|dock/.test(value)) return "charging";
  if (/blade|replacement|wear|filter|brush|tire/.test(value)) return "parts";
  if (/module|plow|blower|trimmer|hitch|mower deck/.test(value)) {
    return "attachments";
  }
  return "accessories";
}

export default function EquipmentCatalog() {
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    const controller = new AbortController();

    fetchCatalog({ signal: controller.signal })
      .then((payload) => setCatalog(payload))
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") {
          return;
        }
        setError(
          reason instanceof Error ? reason.message : "Unable to load equipment."
        );
      });

    return () => controller.abort();
  }, []);

  const options = useMemo(
    () => catalogBrowseOptions(catalog?.products ?? []),
    [catalog]
  );

  if (error) {
    return (
      <p className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800">
        {error}
      </p>
    );
  }

  if (!catalog) {
    return (
      <p className="py-16 text-center font-bold text-slate-500">
        Loading equipment catalog...
      </p>
    );
  }

  const visibleOptions = options.filter(
    ({ option }) => optionKind(option.name) === filter
  );

  return (
    <>
      <div
        className="flex gap-2 overflow-x-auto pb-3"
        aria-label="Catalog categories"
      >
        {filters.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setFilter(item.key)}
            className={`shrink-0 rounded-full px-5 py-3 text-sm font-black transition ${
              filter === item.key
                ? "bg-emerald-600 text-white"
                : "border border-slate-300 bg-white text-slate-700 hover:border-emerald-600"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {filter === "all" ? (
        <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {catalog.products.map((product) => {
            const yarboProduct = isYarboProduct(product);
            const quoteOnlyProduct = isQuoteOnlyProduct(product);
            const bestFitGuidance =
              product.slug === "lymow-one-plus"
                ? product.customerGuidance
                : product.propertyScale ?? product.customerGuidance;

            return (
              <article
                key={product.id}
                className="flex flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
              >
                <div className="flex h-64 items-center justify-center bg-slate-100 p-7">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={product.imageUrl}
                    alt={product.imageAlt}
                    className="max-h-full w-full object-contain"
                  />
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <div className="flex items-center justify-between gap-3 text-xs font-black uppercase tracking-[0.16em]">
                    <span className="text-emerald-700">{product.brand}</span>
                    <span className="text-slate-500">
                      {quoteOnlyProduct ? "Commercial platform" : "Robotic mower"}
                    </span>
                  </div>
                  <h2 className="mt-3 text-2xl font-black text-slate-950">
                    {product.name}
                  </h2>
                  <p className="mt-3 flex-1 leading-7 text-slate-600">
                    {product.homepageSummary ?? product.fullDescription}
                  </p>
                  {bestFitGuidance && (
                    <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900">
                      Best fit: {bestFitGuidance}
                    </p>
                  )}
                  {!quoteOnlyProduct && <div className="mt-5">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Starting at</p>
                    {product.slug === "lymow-one-plus" ? (
                      <LymowPriceDisplay
                        product={product}
                        className="mt-1"
                        priceClassName="text-2xl font-black text-emerald-700"
                      />
                    ) : yarboProduct ? (
                      <YarboStartingPriceDisplay
                        product={product}
                        className="mt-1"
                        priceClassName="text-2xl font-black text-emerald-700"
                      />
                    ) : (
                      <p className="mt-1 text-2xl font-black text-slate-950">
                        {priceLabel(product)}
                      </p>
                    )}
                  </div>}
                  {quoteOnlyProduct && product.displayMsrpPriceCents != null && (
                    <div className="mt-5">
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                        Starting MSRP Everyday Price
                      </p>
                      <p className="mt-1 text-2xl font-black text-emerald-700">
                        {formatCents(product.displayMsrpPriceCents)}
                      </p>
                      <p className="mt-3 text-sm font-bold leading-6 text-slate-700">
                        Contact us to find out the IDS LOW Everyday Price.
                      </p>
                    </div>
                  )}
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <Link
                      href={`/equipment/${product.slug}`}
                      className="rounded-xl border border-slate-300 px-4 py-3 text-center font-bold hover:border-slate-950"
                    >
                      {quoteOnlyProduct ? "View Pandag G1" : "View Details"}
                    </Link>
                    <Link
                      href={
                        quoteOnlyProduct
                          ? "/pandag/project-quote"
                          : yarboProduct
                            ? "/?product=yarbo#location-and-customer-path"
                          : "/#location-and-customer-path"
                      }
                      className="rounded-xl bg-emerald-600 px-4 py-3 text-center font-black text-white hover:bg-emerald-700"
                    >
                      {quoteOnlyProduct
                        ? "Request Pricing & Information"
                        : "Build Your System"}
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : visibleOptions.length ? (
        <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {visibleOptions.map(({ product, option }) => {
            const yarboModule =
              isYarboProduct(product) && isYarboModuleOption(option);
            const displayName = yarboModule
              ? yarboOptionDisplayName(option)
              : option.name;

            return (
              <article
                key={option.id}
                className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
                  {product.brand} / {filter}
                </p>
                <h2 className="mt-3 text-xl font-black">{displayName}</h2>
                <p className="mt-3 leading-7 text-slate-600">
                  {option.description?.replaceAll("Leaf Blower", "Blower") ??
                    `Compatible equipment for the ${product.name} platform.`}
                </p>
                {yarboModule && (
                  <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold leading-6 text-amber-950">
                    {YARBO_MODULE_ONLY_NOTICE}
                  </p>
                )}
                <div className="mt-5 flex items-center justify-between gap-4">
                  {yarboModule ? (
                    <YarboPriceDisplay
                      item={option}
                      priceClassName="font-black text-slate-950"
                    />
                  ) : (
                    <span className="font-black text-slate-950">
                      {priceLabel(option)}
                    </span>
                  )}
                  <Link
                    href={`/equipment/${product.slug}#compatible-equipment`}
                    className="font-bold text-emerald-700 hover:text-emerald-600"
                  >
                    Compatibility -&gt;
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="mt-8 rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-600">
          No published items are currently classified in this section. Contact
          IDS for availability.
        </div>
      )}
    </>
  );
}
