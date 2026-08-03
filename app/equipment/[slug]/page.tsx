import Link from "next/link";

import CatalogHeader from "@/components/equipment/CatalogHeader";
import LymowPriceDisplay from "@/components/equipment/LymowPriceDisplay";
import ProductBuildCta from "@/components/equipment/ProductBuildCta";
import ProductPageSections from "@/components/equipment/ProductPageSections";
import QuoteOnlyNotice from "@/components/equipment/QuoteOnlyNotice";
import YarboInformationSections from "@/components/equipment/YarboInformationSections";
import YarboStartingPriceDisplay from "@/components/equipment/YarboStartingPriceDisplay";
import { formatCents, priceLabel } from "@/lib/catalog/pricing";
import { customerFacingProductOptions } from "@/lib/catalog/customer-facing-options";
import { loadPublicCatalog } from "@/lib/catalog/load-public-catalog";
import {
  hasCompletePandagSpecifications,
  pandagApplications,
  pandagSpecificationDisplay,
} from "@/lib/catalog/pandag-specifications";
import { isQuoteOnlyProduct } from "@/lib/catalog/sales-mode";
import type { CatalogOption, CatalogProduct } from "@/lib/catalog/types";
import { isYarboProduct } from "@/lib/catalog/yarbo";

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let product: CatalogProduct | null = null;
  let loadFailed = false;

  try {
    const payload = await loadPublicCatalog(slug);
    product = payload.products[0] ?? null;
  } catch {
    loadFailed = true;
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-slate-50">
        <CatalogHeader />
        <p className="mx-auto max-w-7xl px-6 py-20 font-bold text-slate-600">
          {loadFailed ? "Unable to load product." : "Product not found."}
        </p>
      </div>
    );
  }

  if (isYarboProduct(product)) {
    return <YarboProductPage product={product} />;
  }

  if (isQuoteOnlyProduct(product)) {
    return <PandagProductPage product={product} />;
  }

  return <StandardProductPage product={product} />;
}

function PandagProductPage({ product }: { product: CatalogProduct }) {
  const chargingDock = customerFacingProductOptions(product).find(
    (option) => option.slug === "pandag-charging-dock"
  );
  const modelInterestBySlug: Record<string, string> = {
    "pandag-g1-m1500-sd": "m1500_sd",
    "pandag-g1-m1500-rd": "m1500_rd",
    "pandag-g1-pro-m3000": "pro_m3000",
  };
  const includedEquipment = [
    "Machine",
    "Cutting Deck",
    "Blades",
    "Battery",
    "Charging Cable",
    "RTK Station",
    "Turf Tires",
  ];
  const positioningBySlug: Record<string, string> = {
    "pandag-g1-m1500-sd":
      "Fine-turf commercial configuration intended for golf courses and similar properties that prioritize lower cutting heights, side discharge, and a bar-blade system.",
    "pandag-g1-m1500-rd":
      "Large-property commercial configuration suited to municipal parks, playing fields, orchards, airports, solar farms, and similar maintained acreage.",
    "pandag-g1-pro-m3000":
      "High-power rear-discharge configuration intended for land reclamation, overgrown ground, scrub-covered slopes, and taller or rougher vegetation.",
  };
  const specificationGroups = [
    ["Power", "power"],
    ["Performance", "performance"],
    ["Battery", "battery"],
    ["Cutting Height", "cuttingHeight"],
    ["Physical", "physical"],
  ] as const;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <CatalogHeader salesMode={product.salesMode} />
      <main>
        <section className="bg-gradient-to-br from-slate-950 to-emerald-950 px-5 py-14 text-white sm:px-8">
          <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-2">
            <div>
              <Link href="/equipment" className="text-sm font-bold text-emerald-300">
                Back to equipment catalog
              </Link>
              <p className="mt-8 text-sm font-black uppercase tracking-[0.22em] text-emerald-400">
                Commercial Autonomous Mowing Platform
              </p>
              <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl">
                {product.page?.heroHeading ?? product.name}
              </h1>
              <p className="mt-6 text-lg leading-8 text-slate-200">
                {product.page?.heroSubheading ?? product.fullDescription ?? product.homepageSummary}
              </p>
              <p className="mt-6 rounded-2xl border border-emerald-400/30 bg-white/10 p-5 leading-7 text-slate-100">
                Pandag systems are professionally configured according to property acreage,
                terrain, cutting requirements, charging strategy, and operating schedule.
                Integrity Distribution Systems will recommend the appropriate model after
                reviewing the project.
              </p>
              {product.displayMsrpPriceCents != null && (
                <div className="mt-6">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-300">
                    Starting MSRP Everyday Price
                  </p>
                  <p className="mt-1 text-3xl font-black text-white">
                    {formatCents(product.displayMsrpPriceCents)}
                  </p>
                </div>
              )}
              <QuoteOnlyNotice className="mt-7" />
            </div>
            <div className="flex min-h-80 items-center justify-center rounded-[2rem] bg-white/95 p-8">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={product.imageUrl} alt={product.imageAlt} className="max-h-[28rem] w-full object-contain" />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
          <div className="grid gap-5 md:grid-cols-3">
            {product.propertyScale && <Info label="Best fit" value={product.propertyScale} />}
            {product.capabilityLevel && <Info label="Capability" value={product.capabilityLevel} />}
            <Info
              label="Commercial applications"
              value="Solar farms, golf courses, large city and municipal parks, expansive private estates, airports, commercial campuses, and substantial agricultural or utility properties."
            />
          </div>

          <ProductPageSections sections={product.page?.sections ?? []} />

          <section id="model-configurations" className="mt-14 scroll-mt-8">
            <p className="text-sm font-black uppercase tracking-[0.2em] text-emerald-700">
              Available configurations
            </p>
            <h2 className="mt-3 text-3xl font-black">Three commercial Pandag models</h2>
            <p className="mt-3 max-w-4xl leading-7 text-slate-600">
              These models are shown for project planning only. Model interest is non-binding,
              and IDS recommends the final configuration after reviewing the property.
            </p>
            <div className="mt-6 grid gap-5 lg:grid-cols-3">
              {product.variants.map((variant) => {
                const applications = pandagApplications(variant);
                const completeSpecifications = hasCompletePandagSpecifications(variant);
                const minimumHeight = pandagSpecificationDisplay(variant, "minimum_cutting_height").replace(" inches", "");
                const maximumHeight = pandagSpecificationDisplay(variant, "maximum_cutting_height");

                return (
                <article key={variant.id} className="flex flex-col rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">Commercial configuration</p>
                  <h3 className="mt-2 text-2xl font-black">{variant.name}</h3>
                  <div className="mt-5">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                      MSRP Everyday Price
                    </p>
                    <p className="mt-1 text-2xl font-black text-emerald-700">
                      {variant.displayMsrpPriceCents == null
                        ? "Contact for MSRP"
                        : formatCents(variant.displayMsrpPriceCents)}
                    </p>
                  </div>
                  <p className="mt-4 leading-7 text-slate-600">
                    {positioningBySlug[variant.slug] ?? variant.description}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {applications.map((application) => (
                      <span key={`${variant.id}-${application}`} className="rounded-full bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">
                        {application}
                      </span>
                    ))}
                  </div>
                  <div className="mt-6 grid grid-cols-2 gap-3">
                    {[
                      ["Discharge", "discharge_type"],
                      ["Blade", "blade_type"],
                      ["Runtime", "maximum_runtime"],
                      ["Capacity", "mowable_acreage_per_day"],
                      ["Rated Power", "rated_power"],
                      ["Battery", "battery_capacity"],
                    ].map(([label, slug]) => (
                      <div key={`${variant.id}-${slug}`} className="rounded-2xl border border-slate-200 p-4">
                        <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
                        <p className="mt-2 font-black text-slate-950">{pandagSpecificationDisplay(variant, slug)}</p>
                      </div>
                    ))}
                  </div>
                  <details className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5" open>
                    <summary className="cursor-pointer font-black text-slate-950">Complete specifications</summary>
                    {!completeSpecifications && (
                      <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-950">
                        Complete specifications are temporarily unavailable.
                      </p>
                    )}
                    <div className="mt-4 space-y-5">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-700">Cutting System</p>
                        <dl className="mt-2 space-y-2 text-sm">
                          <SpecificationRow label="Discharge Type" value={pandagSpecificationDisplay(variant, "discharge_type")} />
                          <SpecificationRow label="Blade Type" value={pandagSpecificationDisplay(variant, "blade_type")} />
                        </dl>
                      </div>
                      {specificationGroups.map(([label, category]) => (
                        <div key={`${variant.id}-${category}`}>
                          <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-700">{label}</p>
                          <dl className="mt-2 space-y-2 text-sm">
                            {variant.specifications?.[category].map((specification) => (
                              <SpecificationRow
                                key={specification.slug}
                                label={specification.label}
                                value={specification.displayValue ?? pandagSpecificationDisplay(variant, specification.slug)}
                              />
                            ))}
                            {category === "cuttingHeight" && (
                              <SpecificationRow label="Adjustable Range" value={`${minimumHeight}–${maximumHeight}`} />
                            )}
                          </dl>
                        </div>
                      ))}
                    </div>
                  </details>
                  <div className="mt-5 rounded-2xl bg-emerald-50 p-5">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-800">
                      Included equipment
                    </p>
                    <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm font-semibold text-slate-700">
                      {includedEquipment.map((item) => <li key={`${variant.id}-${item}`}>{item}</li>)}
                    </ul>
                  </div>
                  <div className="mt-auto pt-6">
                    <p className="font-bold text-slate-800">
                      Contact us to find out the IDS LOW Everyday Price.
                    </p>
                    <Link
                      href={`/pandag/project-quote?model=${modelInterestBySlug[variant.slug] ?? "recommend"}`}
                      className="mt-4 inline-flex w-full justify-center rounded-2xl bg-emerald-600 px-5 py-4 text-center font-black text-white hover:bg-emerald-700"
                    >
                      Request Pricing &amp; Information
                    </Link>
                  </div>
                </article>
              )})}
            </div>
            <p className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 font-semibold leading-7 text-amber-950">
              Manufacturer-published capacity is stated as “Up To” and may vary based on terrain,
              vegetation, cutting height, operating conditions, charging strategy, and mowing schedule.
            </p>
          </section>

          {chargingDock?.displayMsrpPriceCents != null && (
            <section id="compatible-equipment" className="mt-14 scroll-mt-8">
              <p className="text-sm font-black uppercase tracking-[0.2em] text-emerald-700">Optional charging equipment</p>
              <article className="mt-5 max-w-2xl rounded-2xl border border-slate-200 bg-white p-6">
                <h2 className="text-2xl font-black">Optional Charging Dock</h2>
                <p className="mt-3 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">MSRP Everyday Price</p>
                <p className="mt-1 text-2xl font-black text-emerald-700">{formatCents(chargingDock.displayMsrpPriceCents)}</p>
                <p className="mt-3 leading-7 text-slate-600">Contact IDS for project pricing and deployment planning.</p>
              </article>
            </section>
          )}

          <div className="mt-14 rounded-[2rem] bg-slate-950 p-8 text-white sm:p-10">
            <h2 className="text-3xl font-black">Plan a Pandag commercial mowing project</h2>
            <p className="mt-3 max-w-3xl leading-7 text-slate-300">
              Submit property and operating requirements for project review. No purchase or payment occurs through the request form, and model interest is non-binding.
            </p>
            <Link href="/pandag/project-quote" className="mt-6 inline-flex rounded-2xl bg-emerald-500 px-7 py-4 font-black text-slate-950">
              Request Pricing &amp; Information
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

function SpecificationRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-2 last:border-0 last:pb-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-bold text-slate-950">{value}</dd>
    </div>
  );
}

function YarboProductPage({ product }: { product: CatalogProduct }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <CatalogHeader productSlug="yarbo" />
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
                {product.page?.heroHeading ?? product.name}
              </h1>
              <p className="mt-6 text-lg leading-8 text-slate-200">
                {product.homepageSummary ??
                  product.fullDescription ??
                  product.page?.heroSubheading}
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
              <Link
                href="/?product=yarbo#location-and-customer-path"
                className="mt-7 inline-flex rounded-2xl bg-emerald-500 px-7 py-4 text-center font-black text-slate-950 hover:bg-emerald-400"
              >
                Build Your System
              </Link>
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
              label="Platform foundation"
              value="Yarbo Core is the shared base platform. Compatible task modules add the work the system is configured to perform."
            />
          </div>

          <YarboInformationSections product={product} />

          <ProductBuildCta
            supportingText="Choose your Yarbo configuration and compatible accessories first, then check delivery and service availability."
            productSlug="yarbo"
          />
        </section>
      </main>
    </div>
  );
}

function StandardProductPage({ product }: { product: CatalogProduct }) {
  const options = customerFacingProductOptions(product);
  const included = options.filter((item) => item.isIncluded);
  const optional = options.filter((item) => !item.isIncluded);
  const isLymowOnePlus = product.slug === "lymow-one-plus";

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
              <Link
                href="/#location-and-customer-path"
                className="mt-7 inline-flex rounded-2xl bg-emerald-500 px-7 py-4 text-center font-black text-slate-950 hover:bg-emerald-400"
              >
                Build Your System
              </Link>
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

          <ProductPageSections sections={product.page?.sections ?? []} />

          <div id="compatible-equipment" className="mt-14 scroll-mt-8">
            {isLymowOnePlus ? (
              <p className="text-lg font-black uppercase leading-tight tracking-[0.02em] text-emerald-700 md:text-2xl lg:text-3xl">
                Optional Parts and Accessories
              </p>
            ) : (
              <>
                <p className="text-sm font-black uppercase tracking-[0.2em] text-emerald-700">
                  Compatible equipment
                </p>
                <h2 className="mt-3 text-3xl font-black">
                  Included and optional equipment
                </h2>
              </>
            )}
            {included.length > 0 && (
              <EquipmentList title="Included with the system" items={included} />
            )}
            {optional.length > 0 && (
              <EquipmentList
                title={
                  isLymowOnePlus
                    ? undefined
                    : "Optional attachments and accessories"
                }
                items={optional}
              />
            )}
            {!options.length && (
              <p className="mt-5 rounded-2xl bg-white p-6 text-slate-600">
                No compatible equipment is currently published for this product.
              </p>
            )}
          </div>

          {isLymowOnePlus ? (
            <ProductBuildCta supportingText="Choose your Lymow One Plus configuration and compatible accessories first, then check delivery and service availability." />
          ) : (
            <div className="mt-14 rounded-[2rem] bg-slate-950 p-8 text-white sm:p-10">
              <h2 className="text-3xl font-black">
                Ready to plan the complete system?
              </h2>
              <p className="mt-3 max-w-2xl leading-7 text-slate-300">
                Choose the machine and compatible equipment first, then check
                delivery and service availability. No payment is collected
                online.
              </p>
              <Link
                href="/#location-and-customer-path"
                className="mt-6 inline-flex rounded-2xl bg-emerald-500 px-7 py-4 font-black text-slate-950"
              >
                Build Your System
              </Link>
            </div>
          )}
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
  title?: string;
  items: CatalogOption[];
}) {
  return (
    <div className={title ? "mt-7" : "mt-5"}>
      {title && <h3 className="text-xl font-black">{title}</h3>}
      <div
        className={`${title ? "mt-4 " : ""}grid gap-4 md:grid-cols-2 xl:grid-cols-3`}
      >
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
