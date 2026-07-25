"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";

import CatalogHeader from "@/components/equipment/CatalogHeader";
import LymowPriceDisplay from "@/components/equipment/LymowPriceDisplay";
import YarboPriceDisplay from "@/components/equipment/YarboPriceDisplay";
import YarboStartingPriceDisplay from "@/components/equipment/YarboStartingPriceDisplay";
import { fetchCatalog } from "@/lib/catalog/fetch-catalog";
import { priceLabel } from "@/lib/catalog/pricing";
import type { CatalogOption, CatalogProduct } from "@/lib/catalog/types";
import {
  YARBO_CORE_EQUIPMENT_DESCRIPTION,
  YARBO_INCLUDED_PLATFORM_EQUIPMENT,
  YARBO_MODULE_ONLY_NOTICE,
  groupYarboPackages,
  isYarboProduct,
  yarboIndividualModules,
  yarboOptionDisplayName,
  yarboPackageBestFit,
  yarboPackageDisplayName,
  yarboPackageModuleNames,
  yarboPackageMowerType,
} from "@/lib/catalog/yarbo";

export default function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const [product, setProduct] = useState<CatalogProduct | null>(null);
  const [status, setStatus] = useState("Loading product...");

  useEffect(() => {
    const controller = new AbortController();

    fetchCatalog({ signal: controller.signal })
      .then((payload) => {
        const match = payload.products.find((item) => item.slug === slug);
        if (!match) throw new Error("Product not found.");
        setProduct(match);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") {
          return;
        }
        setStatus(
          reason instanceof Error ? reason.message : "Unable to load product."
        );
      });

    return () => controller.abort();
  }, [slug]);

  if (!product) {
    return (
      <div className="min-h-screen bg-slate-50">
        <CatalogHeader />
        <p className="mx-auto max-w-7xl px-6 py-20 font-bold text-slate-600">
          {status}
        </p>
      </div>
    );
  }

  if (isYarboProduct(product)) {
    return <YarboProductPage product={product} />;
  }

  return <StandardProductPage product={product} />;
}

function YarboProductPage({ product }: { product: CatalogProduct }) {
  const groupedPackages = groupYarboPackages(product.packages);
  const modules = yarboIndividualModules(product);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <CatalogHeader />
      <main>
        <section className="bg-gradient-to-br from-slate-950 to-emerald-950 px-5 py-14 text-white sm:px-8">
          <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-2">
            <div>
              <Link
                href="/equipment"
                className="text-sm font-bold text-emerald-300"
              >
                Back to equipment catalog
              </Link>
              <p className="mt-8 text-sm font-black uppercase tracking-[0.22em] text-emerald-400">
                Yarbo
              </p>
              <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl">
                Yarbo modular outdoor platform
              </h1>
              <p className="mt-6 text-lg leading-8 text-slate-200">
                Choose a complete Yarbo system package with Core and modules
                included, or request individual Yarbo equipment for an existing
                Core or a manually assembled setup.
              </p>
              <div className="mt-7">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-300">
                  Starting at
                </p>
                <YarboStartingPriceDisplay
                  product={product}
                  className="mt-2"
                  priceClassName="text-3xl font-black text-emerald-300"
                  labelClassName="text-xs font-bold uppercase tracking-[0.14em] text-slate-300"
                  regularClassName="text-lg font-bold text-slate-300 line-through"
                />
              </div>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <a
                  href="#complete-yarbo-systems"
                  className="rounded-2xl bg-emerald-500 px-7 py-4 text-center font-black text-slate-950 hover:bg-emerald-400"
                >
                  View Complete Systems
                </a>
                <a
                  href="#individual-yarbo-equipment"
                  className="rounded-2xl border border-white/30 px-7 py-4 text-center font-bold hover:bg-white/10"
                >
                  View Individual Equipment
                </a>
              </div>
            </div>
            <div className="flex min-h-80 items-center justify-center rounded-[2rem] bg-white/95 p-8">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={product.imageUrl}
                alt={product.imageAlt}
                className="max-h-[28rem] w-full object-contain"
              />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
          <div className="grid gap-5 md:grid-cols-3">
            {product.propertyScale && (
              <Info label="Best fit" value={product.propertyScale} />
            )}
            {product.capabilityLevel && (
              <Info label="Capability" value={product.capabilityLevel} />
            )}
            <Info
              label="How Yarbo is sold"
              value="Complete systems and individual Yarbo equipment are shown separately. Individual modules require Yarbo Core to operate."
            />
          </div>

          <section id="complete-yarbo-systems" className="mt-14 scroll-mt-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.2em] text-emerald-700">
                  Complete Yarbo Systems
                </p>
                <h2 className="mt-3 text-3xl font-black">
                  Complete packages grouped by use case
                </h2>
                <p className="mt-3 max-w-4xl leading-7 text-slate-600">
                  {YARBO_CORE_EQUIPMENT_DESCRIPTION} Prices are current package
                  prices from the catalog, with no calculated savings shown.
                </p>
              </div>
              <Link
                href="/#location-and-customer-path"
                className="rounded-2xl bg-emerald-600 px-6 py-4 text-center font-black text-white hover:bg-emerald-700"
              >
                Request A Yarbo Package
              </Link>
            </div>

            <nav className="mt-6 flex gap-2 overflow-x-auto pb-2">
              {groupedPackages.map((group) => (
                <a
                  key={group.key}
                  href={`#yarbo-group-${group.key}`}
                  className="shrink-0 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:border-emerald-500"
                >
                  {group.label}
                </a>
              ))}
            </nav>

            <div className="mt-8 space-y-10">
              {groupedPackages.map((group) => (
                <section
                  key={group.key}
                  id={`yarbo-group-${group.key}`}
                  className="scroll-mt-8"
                >
                  <h3 className="text-2xl font-black text-slate-950">
                    {group.label}
                  </h3>
                  <p className="mt-2 leading-7 text-slate-600">
                    {group.description}
                  </p>
                  <div className="mt-5 grid gap-5 lg:grid-cols-2">
                    {group.packages.map((catalogPackage) => (
                      <article
                        key={catalogPackage.id}
                        className="rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-sm"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
                              Complete System
                            </p>
                            <h4 className="mt-2 text-xl font-black">
                              {yarboPackageDisplayName(catalogPackage)}
                            </h4>
                          </div>
                          <YarboPriceDisplay
                            item={catalogPackage}
                            priceClassName="text-xl font-black text-emerald-700"
                          />
                        </div>
                        {catalogPackage.description && (
                          <p className="mt-3 leading-7 text-slate-600">
                            {catalogPackage.description.replaceAll(
                              "Leaf Blower",
                              "Blower"
                            )}
                          </p>
                        )}
                        <div className="mt-4 grid gap-4 text-sm md:grid-cols-2">
                          <div>
                            <p className="font-black text-slate-950">
                              Mower distinction
                            </p>
                            <p className="mt-1 leading-6 text-slate-600">
                              {yarboPackageMowerType(catalogPackage)}
                            </p>
                          </div>
                          <div>
                            <p className="font-black text-slate-950">
                              Best fit
                            </p>
                            <p className="mt-1 leading-6 text-slate-600">
                              {yarboPackageBestFit(catalogPackage)}
                            </p>
                          </div>
                        </div>
                        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                          <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
                            Included equipment
                          </p>
                          <ul className="mt-3 space-y-2 text-sm font-semibold leading-6 text-slate-700">
                            {YARBO_INCLUDED_PLATFORM_EQUIPMENT.map((item) => (
                              <li key={`${catalogPackage.id}-${item}`}>
                                {item}
                              </li>
                            ))}
                            {yarboPackageModuleNames(catalogPackage).map(
                              (name) => (
                                <li key={`${catalogPackage.id}-${name}`}>
                                  {name}
                                </li>
                              )
                            )}
                          </ul>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </section>

          <section
            id="individual-yarbo-equipment"
            className="mt-16 scroll-mt-8"
          >
            <span id="compatible-equipment" className="scroll-mt-8" />
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.2em] text-emerald-700">
                  Individual Yarbo Equipment
                </p>
                <h2 className="mt-3 text-3xl font-black">
                  Core and module-only equipment
                </h2>
                <p className="mt-3 max-w-4xl leading-7 text-slate-600">
                  Individual equipment can support existing Yarbo owners,
                  customers manually assembling a custom system, or customers
                  adding seasonal capability later.
                </p>
              </div>
              <Link
                href="/#location-and-customer-path"
                className="rounded-2xl bg-emerald-600 px-6 py-4 text-center font-black text-white hover:bg-emerald-700"
              >
                Request Individual Equipment
              </Link>
            </div>

            <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              <article className="rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
                  Core Platform
                </p>
                <h3 className="mt-3 text-xl font-black">Yarbo Core</h3>
                <p className="mt-3 leading-7 text-slate-600">
                  The base robot platform for complete Yarbo systems or a
                  manually assembled Core-plus-module request.
                </p>
                <YarboPriceDisplay
                  item={product}
                  className="mt-4"
                  priceClassName="text-xl font-black text-emerald-700"
                />
              </article>

              {modules.map((option) => (
                <article
                  key={option.id}
                  className="rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-sm"
                >
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
                    Module Only
                  </p>
                  <h3 className="mt-3 text-xl font-black">
                    {yarboOptionDisplayName(option)}
                  </h3>
                  <p className="mt-3 leading-7 text-slate-600">
                    {option.description?.replaceAll("Leaf Blower", "Blower") ??
                      "Compatible Yarbo module."}
                  </p>
                  <YarboPriceDisplay
                    item={option}
                    className="mt-4"
                    priceClassName="text-xl font-black text-emerald-700"
                  />
                  <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold leading-6 text-amber-950">
                    {YARBO_MODULE_ONLY_NOTICE}
                  </p>
                </article>
              ))}
            </div>
          </section>

          <section className="mt-16 grid gap-5 lg:grid-cols-2">
            <article className="rounded-[2rem] border border-slate-200 bg-white p-7">
              <p className="text-sm font-black uppercase tracking-[0.2em] text-emerald-700">
                Core-required ownership guidance
              </p>
              <h2 className="mt-3 text-2xl font-black">
                Modules need a Yarbo Core
              </h2>
              <p className="mt-4 leading-7 text-slate-600">
                Module-only purchases do not include Yarbo Core. Customers
                choosing modules without Core should already own a compatible
                Yarbo Core or be manually assembling a separate Core purchase.
              </p>
            </article>
            <article className="rounded-[2rem] border border-slate-200 bg-white p-7">
              <p className="text-sm font-black uppercase tracking-[0.2em] text-emerald-700">
                Warranty and support
              </p>
              <h2 className="mt-3 text-2xl font-black">
                IDS review before final order
              </h2>
              <p className="mt-4 leading-7 text-slate-600">
                IDS will confirm final equipment selection, shipping,
                availability, support options, and applicable manufacturer
                warranty terms before preparing the order.
              </p>
            </article>
          </section>

          <div className="mt-16 rounded-[2rem] bg-slate-950 p-8 text-white sm:p-10">
            <h2 className="text-3xl font-black">Ready to request Yarbo?</h2>
            <p className="mt-3 max-w-2xl leading-7 text-slate-300">
              Choose Yarbo in the equipment request flow, review either a
              complete system package or individual Yarbo equipment, then check
              service and delivery availability. No payment is collected
              online.
            </p>
            <Link
              href="/#location-and-customer-path"
              className="mt-6 inline-flex rounded-2xl bg-emerald-500 px-7 py-4 font-black text-slate-950"
            >
              Request Yarbo Equipment
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

function StandardProductPage({ product }: { product: CatalogProduct }) {
  const options = [
    ...product.optionGroups.flatMap((group) => group.options),
    ...product.ungroupedOptions,
  ];
  const included = options.filter((item) => item.isIncluded);
  const optional = options.filter((item) => !item.isIncluded);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <CatalogHeader />
      <main>
        <section className="bg-gradient-to-br from-slate-950 to-emerald-950 px-5 py-14 text-white sm:px-8">
          <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-2">
            <div>
              <Link
                href="/equipment"
                className="text-sm font-bold text-emerald-300"
              >
                Back to equipment catalog
              </Link>
              <p className="mt-8 text-sm font-black uppercase tracking-[0.22em] text-emerald-400">
                {product.brand}
              </p>
              <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl">
                {product.page?.heroHeading ?? product.name}
              </h1>
              <p className="mt-6 text-lg leading-8 text-slate-200">
                {product.page?.heroSubheading ??
                  product.fullDescription ??
                  product.homepageSummary}
              </p>
              {product.slug === "lymow-one-plus" ? (
                <div className="mt-7">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-300">
                    Starting at
                  </p>
                  <LymowPriceDisplay
                    product={product}
                    className="mt-2"
                    priceClassName="text-3xl font-black text-emerald-300"
                    labelClassName="text-xs font-bold uppercase tracking-[0.14em] text-slate-300"
                    regularClassName="text-lg font-bold text-slate-300 line-through"
                  />
                </div>
              ) : (
                <p className="mt-7 text-3xl font-black">
                  {priceLabel(product)}
                </p>
              )}
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/#location-and-customer-path"
                  className="rounded-2xl bg-emerald-500 px-7 py-4 text-center font-black text-slate-950 hover:bg-emerald-400"
                >
                  Build Your System
                </Link>
                <Link
                  href="/#location-and-customer-path"
                  className="rounded-2xl border border-white/30 px-7 py-4 text-center font-bold hover:bg-white/10"
                >
                  Ask a Question
                </Link>
              </div>
            </div>
            <div className="flex min-h-80 items-center justify-center rounded-[2rem] bg-white/95 p-8">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={product.imageUrl}
                alt={product.imageAlt}
                className="max-h-[28rem] w-full object-contain"
              />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
          {product.slug === "lymow-one-plus" &&
            product.variants.length > 0 && (
              <div>
                <p className="text-sm font-black uppercase tracking-[0.2em] text-emerald-700">
                  Available configurations
                </p>
                <h2 className="mt-3 text-3xl font-black">
                  Choose the charging configuration for your property
                </h2>
                <div className="mt-5 grid gap-5 md:grid-cols-2">
                  {product.variants.map((variant) => (
                    <article
                      key={variant.id}
                      className="rounded-3xl border border-slate-200 bg-white p-7"
                    >
                      <h3 className="text-xl font-black">{variant.name}</h3>
                      {variant.description && (
                        <p className="mt-3 leading-7 text-slate-600">
                          {variant.description}
                        </p>
                      )}
                      <LymowPriceDisplay
                        variant={variant}
                        className="mt-5"
                        priceClassName="text-2xl font-black text-emerald-700"
                      />
                    </article>
                  ))}
                </div>
              </div>
            )}

          <div
            className={`grid gap-5 md:grid-cols-3 ${
              product.slug === "lymow-one-plus" ? "mt-14" : ""
            }`}
          >
            {product.propertyScale && (
              <Info label="Best fit" value={product.propertyScale} />
            )}
            {product.capabilityLevel && (
              <Info label="Capability" value={product.capabilityLevel} />
            )}
            {product.customerGuidance && (
              <Info label="IDS guidance" value={product.customerGuidance} />
            )}
          </div>

          {product.page?.sections.length ? (
            <div className="mt-14">
              <p className="text-sm font-black uppercase tracking-[0.2em] text-emerald-700">
                Product information
              </p>
              <div className="mt-5 grid gap-5 md:grid-cols-2">
                {product.page.sections.map((section) => (
                  <article
                    key={section.id}
                    className="rounded-3xl border border-slate-200 bg-white p-7"
                  >
                    <h2 className="text-2xl font-black">{section.heading}</h2>
                    <p className="mt-4 whitespace-pre-line leading-7 text-slate-600">
                      {section.bodyContent}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          <div id="compatible-equipment" className="mt-14 scroll-mt-8">
            <p className="text-sm font-black uppercase tracking-[0.2em] text-emerald-700">
              Compatible equipment
            </p>
            <h2 className="mt-3 text-3xl font-black">
              Included and optional equipment
            </h2>
            {included.length > 0 && (
              <EquipmentList title="Included with the system" items={included} />
            )}
            {optional.length > 0 && (
              <EquipmentList
                title="Optional attachments and accessories"
                items={optional}
              />
            )}
            {!options.length && (
              <p className="mt-5 rounded-2xl bg-white p-6 text-slate-600">
                No compatible equipment is currently published for this product.
              </p>
            )}
          </div>

          <div className="mt-14 rounded-[2rem] bg-slate-950 p-8 text-white sm:p-10">
            <h2 className="text-3xl font-black">
              {product.slug === "lymow-one-plus"
                ? "Ready to Build Your System?"
                : "Ready to plan the complete system?"}
            </h2>
            <p className="mt-3 max-w-2xl leading-7 text-slate-300">
              {product.slug === "lymow-one-plus"
                ? "Choose your Lymow One Plus configuration and compatible accessories first, then check delivery and service availability."
                : "Choose the machine and compatible equipment first, then check delivery and service availability. No payment is collected online."}
            </p>
            <Link
              href="/#location-and-customer-path"
              className="mt-6 inline-flex rounded-2xl bg-emerald-500 px-7 py-4 font-black text-slate-950"
            >
              Build Your System
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">
        {label}
      </p>
      <p className="mt-3 leading-7 text-slate-700">{value}</p>
    </div>
  );
}

function EquipmentList({
  title,
  items,
}: {
  title: string;
  items: CatalogOption[];
}) {
  return (
    <div className="mt-7">
      <h3 className="text-xl font-black">{title}</h3>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <article
            key={item.id}
            className="rounded-2xl border border-slate-200 bg-white p-5"
          >
            <div className="flex justify-between gap-4">
              <h4 className="font-black">{item.name}</h4>
              <span className="shrink-0 text-sm font-bold text-emerald-700">
                {item.isIncluded ? "Included" : priceLabel(item)}
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {item.description ?? "Compatible with this product configuration."}
            </p>
            {!item.isIncluded && (
              <Link
                href="/#location-and-customer-path"
                className="mt-4 inline-flex text-sm font-black text-emerald-700"
              >
                Add when building your system -&gt;
              </Link>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
