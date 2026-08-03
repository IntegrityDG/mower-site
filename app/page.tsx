"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import NationwidePurchaseFlow from "@/components/customer-paths/purchase/NationwidePurchaseFlow";
import LymowPriceDisplay from "@/components/equipment/LymowPriceDisplay";
import YarboStartingPriceDisplay from "@/components/equipment/YarboStartingPriceDisplay";
import { fetchCatalog } from "@/lib/catalog/fetch-catalog";
import type { CatalogProduct } from "@/lib/catalog/types";

const hearthFinancingUrl =
  "https://app.gethearth.com/requests/930af233-2a7b-4f52-a836-bd11173d6fee";

const featuredMachineImages: Record<string, string> = {
  "lymow-one-plus": "/images/featured-machines/lymow-one-plus.jpg",
  yarbo: "/images/featured-machines/yarbo-mower.jpg",
  "pandag-g1": "/images/featured-machines/pandag-g1.jpg",
};

function FeaturedMachineImage({
  product,
  productName,
  productSlug,
}: {
  product: CatalogProduct | undefined;
  productName: string;
  productSlug: string;
}) {
  const [failedImageUrls, setFailedImageUrls] = useState<string[]>([]);
  const imageUrl = [
    featuredMachineImages[productSlug],
    product?.imageUrl,
  ].find((candidate) => candidate && !failedImageUrls.includes(candidate));

  return (
    <div className="flex aspect-[16/10] w-full items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {imageUrl ? (
        // The homepage uses dedicated local imagery with catalog media as fallback.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={product?.imageAlt ?? productName}
          className="h-full w-full object-cover object-center"
          onError={() =>
            setFailedImageUrls((failedUrls) =>
              failedUrls.includes(imageUrl)
                ? failedUrls
                : [...failedUrls, imageUrl]
            )
          }
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center rounded-xl bg-gradient-to-br from-slate-100 to-emerald-50 px-6 text-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">
              Integrity Distribution Systems
            </p>
            <p className="mt-3 text-xl font-black text-slate-950">
              {productName}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Page() {
  const [catalogProducts, setCatalogProducts] = useState<CatalogProduct[]>([]);

  useEffect(() => {
    const controller = new AbortController();

    fetchCatalog({ signal: controller.signal })
      .then((catalog) => setCatalogProducts(catalog.products))
      .catch(() => {
        // Featured cards retain their branded placeholders if catalog loading fails.
      });

    return () => controller.abort();
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      {/* HEADER */}
      <header className="border-b border-slate-300 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-center px-4 py-5 sm:px-6 md:px-10">
          <div className="flex w-full max-w-6xl items-center justify-center gap-3 sm:gap-5 md:gap-8">
            <img
              src="/logo.png"
              alt="Integrity Distribution Systems"
              width={1250}
              height={500}
              className="h-auto w-[145px] shrink-0 object-contain sm:w-[230px] md:w-[320px] lg:w-[360px]"
            />

            <div className="min-w-0 border-l border-slate-300 pl-3 text-left sm:pl-5 md:pl-8">
              <p className="text-2xl font-black leading-tight tracking-tight text-slate-950 sm:text-3xl md:text-4xl lg:text-5xl">
                Integrity Distribution Systems
              </p>

              <p className="mt-2 text-sm font-bold uppercase leading-5 tracking-[0.12em] text-emerald-700 sm:text-base sm:tracking-[0.17em] md:text-lg lg:text-xl">
                Autonomous Lawn Care Solutions
              </p>
            </div>
          </div>
        </div>
      </header>

      <main>
        {/* HERO */}
        <section className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 px-6 py-20 text-white md:px-10 md:py-24">
          <div className="pointer-events-none absolute inset-0 opacity-20">
            <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-emerald-400 blur-3xl" />

            <div className="absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-cyan-400 blur-3xl" />
          </div>

          <div className="relative z-10 mx-auto w-full max-w-5xl text-center">
            <p className="w-full text-center text-2xl font-bold uppercase leading-tight tracking-[0.02em] text-emerald-400 md:text-[2rem] md:tracking-[0.08em]">
              <span className="block md:inline">A SMALL BUSINESS</span>{" "}
              <span className="block md:inline">WITH A SIMPLE</span>{" "}
              <span className="block md:inline">PURPOSE</span>
            </p>

            <h1 className="mx-auto mt-5 max-w-4xl text-center text-4xl font-black leading-[1.08] tracking-tight md:text-5xl">
              Helping people get more time back for what matters most.
            </h1>

            <p className="mx-auto mt-7 max-w-4xl text-center text-lg leading-8 text-slate-200 md:text-xl">
              Integrity Distribution Systems is a small, Southeast
              Missouri&ndash;based business built around honesty, practical
              guidance, and doing right by the people we serve. We are not here
              to push the most expensive machine or chase the biggest sale. Our
              goal is to help each customer find a system that genuinely fits
              their property, needs, and budget.
            </p>

            <p className="mx-auto mt-5 max-w-4xl text-center text-lg leading-8 text-slate-200 md:text-xl">
              After spending a great deal of my own life working away from
              home, I understand how valuable time can be. Autonomous lawn care
              can reduce the hours and expense tied up in routine property
              maintenance, giving people more time with family, more room in
              their budget, and a little more opportunity to slow down and enjoy
              life.
            </p>

            <div className="mt-8 flex w-full justify-center">
              <div className="inline-flex items-center justify-center rounded-2xl border border-white/20 bg-white/10 px-6 py-3 text-center text-sm font-semibold text-slate-100 backdrop-blur">
                Southeast Missouri Based &bull; Nationwide Equipment Sales
                &bull; Regional Hands-On Support
              </div>
            </div>

            <div className="mt-8 flex w-full justify-center">
              <img
                src="/images/cartoon-mowers.png"
                alt="Autonomous mower lineup"
                className="h-auto w-full max-w-[560px] object-contain drop-shadow-2xl sm:max-w-[680px] md:max-w-[780px]"
              />
            </div>
          </div>
        </section>

        {/* FEATURED EQUIPMENT */}
        <section className="bg-white px-6 py-20 md:px-10">
          <div className="mx-auto max-w-7xl">
            <div>
              <p className="text-2xl font-bold uppercase leading-tight tracking-[0.02em] text-emerald-400 md:text-[2rem] md:tracking-[0.08em]">
                Featured Machines
              </p>
              <h2 className="mt-3 max-w-3xl text-3xl font-black tracking-tight text-slate-950 md:text-5xl">
                Meet our top picks for helping you reclaim your time.
              </h2>
              <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-600">
                Each system offers a different approach to autonomous lawn care,
                from residential mowing to modular property maintenance and
                heavy-duty commercial work. Take a look through the lineup and
                explore the details.
              </p>
            </div>

            <div className="mt-10 grid gap-6 lg:grid-cols-3">
              {[
                {
                  slug: "lymow-one-plus",
                  label: "Residential Equipment",
                  title: "Lymow One Plus",
                  text: "Engineered for complex residential lawns, the Lymow One Plus combines tracked traction, intelligent navigation, and precise virtual-boundary mowing. It confidently handles tight passages, uneven terrain, and challenging layouts with dependable, automated performance.",
                  href: "/equipment/lymow-one-plus",
                },
                {
                  slug: "yarbo",
                  label: "Complete Systems and Packages",
                  title: "Yarbo",
                  text: "Yarbo is a powerful modular platform built to handle year-round property care from a single autonomous machine. Add mowing, trimming, blowing, or snow-removal equipment as your needs grow and create a complete system around your property.",
                  href: "/equipment/yarbo",
                },
                {
                  slug: "pandag-g1",
                  label: "Commercial Equipment",
                  title: "Pandag G1",
                  text: "Built primarily for solar farms, golf courses, large city parks, and expansive private estates, the Pandag G1 delivers heavy-duty autonomous mowing for properties where acreage, terrain, and labor demands exceed the capabilities of conventional zero-turn mowers and smaller robotic platforms.",
                  href: "/equipment/pandag-g1",
                },
              ].map((item) => {
                const product = catalogProducts.find(
                  (catalogProduct) => catalogProduct.slug === item.slug
                );

                return (
                  <article
                    key={item.title}
                    className="rounded-[2rem] border border-slate-200 bg-slate-50 p-7"
                  >
                    <FeaturedMachineImage
                      product={product}
                      productName={item.title}
                      productSlug={item.slug}
                    />
                    <p className="mt-6 text-xs font-black uppercase tracking-[0.18em] text-emerald-700">
                      {item.label}
                    </p>
                    <h3 className="mt-4 text-2xl font-black text-slate-950">
                      {item.title}
                    </h3>
                    <p className="mt-4 leading-7 text-slate-600">{item.text}</p>
                    {item.title === "Lymow One Plus" && (
                      <div className="mt-5">
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                          Starting at
                        </p>
                        <LymowPriceDisplay
                          className="mt-2"
                          priceClassName="text-2xl font-black text-emerald-700"
                        />
                      </div>
                    )}
                    {item.title === "Yarbo" && (
                      <div className="mt-5">
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                          Starting at
                        </p>
                        <YarboStartingPriceDisplay
                          className="mt-2"
                          priceClassName="text-2xl font-black text-emerald-700"
                        />
                      </div>
                    )}
                    {item.title === "Pandag G1" && (
                      <div className="mt-5">
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                          Starting at
                        </p>
                        <p className="mt-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                          MSRP Everyday Price
                        </p>
                        <p className="mt-1 text-2xl font-black text-emerald-700">
                          $24,660
                        </p>
                        <p className="mt-3 text-sm font-bold leading-6 text-slate-700">
                          Contact us to find out the IDS LOW Everyday Price.
                        </p>
                      </div>
                    )}
                    <Link
                      href={item.href}
                      className="mt-6 inline-flex font-black text-emerald-700 hover:text-emerald-600"
                    >
                      View Details -&gt;
                    </Link>
                    {item.title === "Pandag G1" && (
                      <Link
                        href="/pandag/project-quote"
                        className="mt-4 flex w-full justify-center rounded-2xl bg-emerald-600 px-5 py-4 text-center font-black text-white transition hover:bg-emerald-700"
                      >
                        Request Pricing &amp; Information
                      </Link>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* EQUIPMENT REQUEST PROCESS */}
        <section className="border-y border-slate-300 bg-slate-100 px-6 py-20 md:px-10">
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.95fr_1.05fr]">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.25em] text-emerald-700">
                Equipment Request Process
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 md:text-5xl">
                Build and review an equipment-only request.
              </h2>
              <p className="mt-5 text-lg leading-8 text-slate-600">
                Compare machines, packages, modules, attachments, and accessories,
                then provide delivery and contact information for review.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {[
                "Browse public equipment without entering a ZIP.",
                "Select a machine, package, module, attachment, or accessory.",
                "Enter the delivery or installation address after selection.",
                "Review the configured equipment estimate before submitting.",
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-2xl border border-slate-300 bg-white p-5 font-bold leading-7 text-slate-700"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* HEARTH FINANCING */}
        <section
          id="financing"
          className="relative overflow-hidden border-b border-slate-700 bg-gradient-to-br from-slate-950 via-emerald-950 to-slate-900 px-6 py-20 text-white md:px-10 md:py-24"
        >
          <div className="pointer-events-none absolute inset-0 opacity-20">
            <div className="absolute -left-32 top-0 h-96 w-96 rounded-full bg-emerald-400 blur-3xl" />

            <div className="absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-cyan-400 blur-3xl" />
          </div>

          <div className="relative z-10 mx-auto max-w-7xl">
            <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
              {/* FINANCING ARTWORK */}
              <div className="mx-auto w-full max-w-2xl">
                <div className="overflow-hidden rounded-[2rem] border border-white/20 bg-slate-900 shadow-2xl">
                  <img
                    src="/images/hearth-financing-background.png"
                    alt="Integrity Distribution Systems financing through Hearth"
                    className="h-auto w-full object-cover"
                  />
                </div>
              </div>

              {/* FINANCING INFORMATION */}
              <div className="mx-auto w-full max-w-xl text-center lg:text-left">
                <p className="text-sm font-bold uppercase tracking-[0.28em] text-emerald-400">
                  Flexible Financing Available
                </p>

                <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl md:text-5xl">
                  Explore your financing options through Hearth.
                </h2>

                <p className="mt-6 text-lg leading-8 text-slate-200">
                  Interested in an autonomous mower but prefer manageable
                  payments? Use our secure Hearth financing link to explore
                  potential options from participating lending partners.
                </p>

                <div className="mt-7 rounded-2xl border border-white/15 bg-white/10 p-5 text-left backdrop-blur">
                  <p className="font-black text-white">
                    Through the Hearth financing portal, you can:
                  </p>

                  <div className="mt-4 space-y-3 text-sm leading-6 text-slate-200">
                    <p>✓ Explore potential financing options online</p>
                    <p>✓ Compare available payment choices</p>
                    <p>✓ Submit your information securely</p>
                    <p>✓ Continue shopping after checking your options</p>
                  </div>
                </div>

                <a
                  href={hearthFinancingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-8 inline-flex w-full items-center justify-center rounded-2xl bg-emerald-500 px-8 py-5 text-center text-lg font-black text-slate-950 shadow-xl transition hover:scale-[1.02] hover:bg-emerald-400 sm:w-auto"
                >
                  Check Financing Options
                  <span aria-hidden="true" className="ml-3 text-xl">
                    ↗
                  </span>
                </a>

                <p className="mt-5 text-sm leading-6 text-slate-300">
                  The financing page will open in a new tab so you can return
                  here when finished.
                </p>

                <p className="mt-5 text-xs leading-5 text-slate-400">
                  Financing is provided through participating third-party
                  lenders. Approval, rates, terms, fees, and availability are
                  determined by the applicable lender.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* EQUIPMENT REQUEST FLOW */}
        <section
          id="location-and-customer-path"
          className="scroll-mt-6 px-6 py-20 md:px-10"
        >
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto mb-8 max-w-3xl text-center md:mb-9">
              <p className="text-sm font-bold uppercase tracking-[0.25em] text-emerald-700">
                BUILD YOUR SYSTEM
              </p>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950 md:text-5xl">
                Choose your equipment and create the right setup for your property.
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-600 md:text-lg">
                Select your machine, customize its configuration, review your
                complete price and financing options, then provide delivery
                information and continue to secure checkout.
              </p>
            </div>

            <NationwidePurchaseFlow />
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="border-t border-slate-800 bg-slate-950 text-slate-300">
        <div className="mx-auto grid max-w-7xl gap-8 px-6 py-12 md:grid-cols-2 md:px-10">
          <div>
            <p className="text-lg font-black text-white">
              Integrity Distribution Systems
            </p>

            <p className="mt-3 max-w-xl text-sm leading-6">
              Nationwide autonomous mower sales with professional installation,
              setup, and ongoing support available throughout the IDS regional
              service area.
            </p>
          </div>

          <div className="md:text-right">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-emerald-400">
              Regional Service Coverage
            </p>

            <p className="mt-3 text-sm leading-6">
              Southern Missouri • Northern Arkansas • Western Kentucky
              <br />
              Western Tennessee • Southern Illinois
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
