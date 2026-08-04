import Image from "next/image";
import Link from "next/link";

import CatalogHeader from "@/components/equipment/CatalogHeader";
import LymowInformationSections from "@/components/equipment/LymowInformationSections";
import LymowPriceDisplay from "@/components/equipment/LymowPriceDisplay";
import { lymowImages } from "@/components/equipment/lymowBrochureContent";
import PandagInformationSections from "@/components/equipment/PandagInformationSections";
import { pandagImages } from "@/components/equipment/pandagBrochureContent";
import ProductBuildCta from "@/components/equipment/ProductBuildCta";
import ProductPageSections from "@/components/equipment/ProductPageSections";
import QuoteOnlyNotice from "@/components/equipment/QuoteOnlyNotice";
import YarboInformationSections from "@/components/equipment/YarboInformationSections";
import YarboStartingPriceDisplay from "@/components/equipment/YarboStartingPriceDisplay";
import { formatCents, priceLabel } from "@/lib/catalog/pricing";
import { customerFacingProductOptions } from "@/lib/catalog/customer-facing-options";
import { loadPublicCatalog } from "@/lib/catalog/load-public-catalog";
import { findCatalogProductBySlug } from "@/lib/catalog/product-routing";
import { isQuoteOnlyProduct } from "@/lib/catalog/sales-mode";
import type { CatalogOption, CatalogProduct } from "@/lib/catalog/types";
import { isYarboProduct } from "@/lib/catalog/yarbo";

export const dynamic = "force-dynamic";

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let product: CatalogProduct | null = null;
  let loadFailed = false;

  try {
    const payload = await loadPublicCatalog();
    product = findCatalogProductBySlug(payload, slug);
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
  const heroImage = pandagImages.platformLineup;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <CatalogHeader salesMode={product.salesMode} />
      <main>
        <section className="overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 px-5 py-14 text-white sm:px-8 lg:py-20">
          <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
            <div>
              <Link
                href="/equipment"
                className="text-sm font-bold text-emerald-300 hover:text-emerald-200"
              >
                Back to equipment catalog
              </Link>
              <p className="mt-8 text-sm font-black uppercase tracking-[0.22em] text-emerald-400">
                Pandag G1 Commercial Platform
              </p>
              <h1 className="mt-3 max-w-3xl text-4xl font-black tracking-tight sm:text-6xl">
                Autonomous mowing built for large properties and demanding
                commercial operations.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-200">
                {product.homepageSummary ??
                  product.fullDescription ??
                  product.page?.heroSubheading ??
                  "A heavy-duty autonomous mowing platform configured for commercial and institutional properties."}
              </p>
              <p className="mt-6 max-w-2xl rounded-2xl border border-emerald-400/30 bg-white/10 p-5 leading-7 text-slate-100 backdrop-blur-sm">
                Property acreage, terrain, vegetation, cutting requirements,
                charging access, and operating schedule shape the final model
                recommendation and commercial proposal.
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
            <div className="relative flex min-h-96 items-center justify-center overflow-hidden rounded-[2rem] border border-white/10 bg-white/95 p-4 shadow-2xl sm:p-8">
              <div
                aria-hidden="true"
                className="absolute inset-x-10 bottom-4 h-20 rounded-full bg-emerald-300/20 blur-3xl"
              />
              <Image
                src={heroImage.src}
                alt={heroImage.alt}
                width={heroImage.width}
                height={heroImage.height}
                priority
                sizes="(min-width: 1024px) 52vw, 100vw"
                className="relative max-h-[36rem] w-full object-contain"
              />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
          <PandagInformationSections product={product} />
        </section>
      </main>
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
      <CatalogHeader productSlug={isLymowOnePlus ? product.slug : undefined} />
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
                {isLymowOnePlus ? "Lymow One Plus features" : product.brand}
              </p>
              <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl">
                {product.page?.heroHeading ?? product.name}
              </h1>
              <p className="mt-6 text-lg leading-8 text-slate-200">
                {isLymowOnePlus
                  ? "Tracked autonomous mowing built for demanding residential properties."
                  : product.page?.heroSubheading ??
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
                  <div className="mt-5 flex flex-wrap gap-2 text-xs font-black uppercase tracking-[0.12em] text-slate-100">
                    <span className="rounded-full border border-white/20 bg-white/10 px-4 py-2">
                      5A configuration
                    </span>
                    <span className="rounded-full border border-white/20 bg-white/10 px-4 py-2">
                      10A configuration
                    </span>
                    <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-4 py-2 text-emerald-200">
                      Charger included
                    </span>
                  </div>
                </div>
              ) : (
                <p className="mt-7 text-3xl font-black">
                  {priceLabel(product)}
                </p>
              )}
              <Link
                href={
                  isLymowOnePlus
                    ? "/?product=lymow-one-plus#location-and-customer-path"
                    : "/#location-and-customer-path"
                }
                className="mt-7 inline-flex rounded-2xl bg-emerald-500 px-7 py-4 text-center font-black text-slate-950 hover:bg-emerald-400"
              >
                Build Your System
              </Link>
            </div>
            <div className="flex min-h-80 items-center justify-center overflow-hidden rounded-[2rem] bg-white/95">
              {isLymowOnePlus ? (
                <Image
                  src={lymowImages.hero.src}
                  alt={lymowImages.hero.alt}
                  width={lymowImages.hero.width}
                  height={lymowImages.hero.height}
                  className="h-full min-h-80 w-full object-cover"
                  priority
                  sizes="(min-width: 1024px) 50vw, 100vw"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={product.imageUrl}
                  alt={product.imageAlt}
                  className="max-h-[28rem] w-full object-contain p-8"
                />
              )}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
          {isLymowOnePlus ? (
            <LymowInformationSections product={product} />
          ) : (
            <>
              <div className="grid gap-5 md:grid-cols-3">
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
            </>
          )}

          {isLymowOnePlus ? (
            <ProductBuildCta
              supportingText="Choose your Lymow One Plus configuration and compatible accessories first, then check delivery and service availability."
              productSlug="lymow-one-plus"
            />
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
