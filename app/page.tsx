"use client";

import Link from "next/link";

import NationwidePurchaseFlow from "@/components/customer-paths/purchase/NationwidePurchaseFlow";

const hearthFinancingUrl =
  "https://app.gethearth.com/requests/930af233-2a7b-4f52-a836-bd11173d6fee";

export default function Page() {
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
            <p className="w-full text-center text-sm font-bold uppercase tracking-[0.28em] text-emerald-400">
              Nationwide Autonomous Mower Sales
            </p>

            <h1 className="mx-auto mt-5 max-w-4xl text-center text-4xl font-black leading-[1.08] tracking-tight md:text-6xl">
              Autonomous lawn care, built on integrity.
            </h1>

            <p className="mx-auto mt-7 max-w-3xl text-center text-lg leading-8 text-slate-200 md:text-xl">
              Purchase autonomous mowing equipment nationwide, get help
              identifying the right system, get help locating local resources for post-sale support, or add professional IDS setup and
              support where regional service is available.
            </p>

            <div className="mt-8 flex w-full justify-center">
              <Link
                href="/equipment"
                className="rounded-2xl bg-emerald-500 px-8 py-4 text-lg font-black text-slate-950 shadow-xl transition hover:bg-emerald-400"
              >
                Browse Equipment
              </Link>
            </div>

            <div className="mt-8 flex w-full justify-center">
              <div className="inline-flex items-center justify-center rounded-2xl border border-white/20 bg-white/10 px-6 py-3 text-center text-sm font-semibold text-slate-100 backdrop-blur">
                Nationwide Sales • Regional Hands-On Services
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

        {/* FEATURED EQUIPMENT */}
        <section className="bg-white px-6 py-20 md:px-10">
          <div className="mx-auto max-w-7xl">
            <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.25em] text-emerald-700">
                  Featured Machines
                </p>
                <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 md:text-5xl">
                  Browse equipment before checking availability.
                </h2>
                <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-600">
                  Compare residential equipment, commercial equipment, complete
                  systems, packages, attachments, accessories, and individual
                  equipment first. Location is checked after you select what you
                  want to review.
                </p>
              </div>
              <Link
                href="/equipment"
                className="rounded-2xl bg-slate-950 px-7 py-4 text-center font-black text-white transition hover:bg-emerald-700"
              >
                Browse Equipment Catalog
              </Link>
            </div>

            <div className="mt-10 grid gap-6 lg:grid-cols-3">
              {[
                {
                  label: "Residential Equipment",
                  title: "Lymow One Plus",
                  text: "Tracked virtual-boundary mowing for complex residential lawns, with configurations and compatible equipment available to review before location entry.",
                  href: "/equipment/lymow-one-plus",
                },
                {
                  label: "Complete Systems and Packages",
                  title: "Yarbo",
                  text: "A modular outdoor platform with Complete Yarbo Systems and Individual Yarbo Equipment shown as separate customer paths.",
                  href: "/equipment/yarbo",
                },
                {
                  label: "Commercial Equipment",
                  title: "Pandag G1",
                  text: "Commercial autonomous mowing equipment for larger and more demanding properties, preserved as a browsable catalog option.",
                  href: "/equipment/pandag-g1",
                },
              ].map((item) => (
                <article
                  key={item.title}
                  className="rounded-[2rem] border border-slate-200 bg-slate-50 p-7"
                >
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">
                    {item.label}
                  </p>
                  <h3 className="mt-4 text-2xl font-black text-slate-950">
                    {item.title}
                  </h3>
                  <p className="mt-4 leading-7 text-slate-600">{item.text}</p>
                  <Link
                    href={item.href}
                    className="mt-6 inline-flex font-black text-emerald-700 hover:text-emerald-600"
                  >
                    View Details -&gt;
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* INSTALLATION AND SUPPORT */}
        <section className="border-y border-slate-300 bg-slate-100 px-6 py-20 md:px-10">
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.95fr_1.05fr]">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.25em] text-emerald-700">
                Installation and Support
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 md:text-5xl">
                Services appear only after the location check.
              </h2>
              <p className="mt-5 text-lg leading-8 text-slate-600">
                Professional installation and local support are available within
                our service area. Equipment sales and remote support may be
                available nationwide.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {[
                "Browse public equipment without entering a ZIP.",
                "Select a machine, package, module, attachment, or accessory.",
                "Enter the delivery or installation address after selection.",
                "See only eligible delivery, deployment, installation, and service-plan options.",
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

        {/* EQUIPMENT REQUEST FLOW */}
        <section
          id="location-and-customer-path"
          className="scroll-mt-6 px-6 py-20 md:px-10"
        >
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto mb-10 max-w-3xl text-center">
              <p className="text-sm font-bold uppercase tracking-[0.25em] text-emerald-700">
                Request Information
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 md:text-5xl">
                Start with equipment, then check service and delivery
                availability.
              </h2>
              <p className="mt-5 text-lg leading-8 text-slate-600">
                The request flow keeps equipment browsing first. Location is
                used later to determine which local services, delivery options,
                setup options, and support plans can be shown.
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
