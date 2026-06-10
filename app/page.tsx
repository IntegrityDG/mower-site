"use client";

import { useEffect, useState } from "react";

import LocationPathSelector, {
  type CustomerPath,
  type Region,
} from "@/components/LocationPathSelector";

type PathContent = {
  eyebrow: string;
  title: string;
  description: string;
};

const hearthFinancingUrl =
  "https://app.gethearth.com/requests/930af233-2a7b-4f52-a836-bd11173d6fee";

const pathContent: Record<CustomerPath, PathContent> = {
  nationwide: {
    eyebrow: "Nationwide Purchasing",
    title: "Build your equipment order.",
    description:
      "Compare available systems, select equipment and accessories, choose purchase or financing, and begin the self-ordering process.",
  },

  "local-services": {
    eyebrow: "IDS Regional Services",
    title: "Build your equipment and service package.",
    description:
      "Eligible customers can select equipment along with professional installation, setup, support, and other locally available IDS services.",
  },

  recommendation: {
    eyebrow: "Guided Recommendation",
    title: "Let us help identify the right system.",
    description:
      "Answer questions about acreage, terrain, obstacles, maintenance goals, and desired capabilities to receive a guided equipment recommendation.",
  },
};

export default function Page() {
  const [selectedState, setSelectedState] = useState("");
  const [selectedRegion, setSelectedRegion] = useState<Region>("");
  const [selectedPath, setSelectedPath] = useState<CustomerPath | "">("");

  const activePath = selectedPath ? pathContent[selectedPath] : null;

  function handleStateChange(state: string) {
    setSelectedState(state);
    setSelectedRegion("");
    setSelectedPath("");
  }

  function handleRegionChange(region: Region) {
    setSelectedRegion(region);
    setSelectedPath("");
  }

  function handlePathSelect(path: CustomerPath) {
    setSelectedPath(path);
  }

  useEffect(() => {
    if (!selectedPath) return;

    const scrollTimer = window.setTimeout(() => {
      document.getElementById("selected-path-section")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 150);

    return () => window.clearTimeout(scrollTimer);
  }, [selectedPath]);

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

        {/* LOCATION AND CUSTOMER PATH */}
        <LocationPathSelector
          selectedState={selectedState}
          selectedRegion={selectedRegion}
          selectedPath={selectedPath}
          onStateChange={handleStateChange}
          onRegionChange={handleRegionChange}
          onPathSelect={handlePathSelect}
        />

        {/* SELECTED PATH */}
        <section
          id="selected-path-section"
          className="scroll-mt-6 px-6 py-20 md:px-10"
        >
          <div className="mx-auto max-w-6xl">
            {activePath ? (
              <div className="overflow-hidden rounded-[2rem] border border-slate-300 bg-white shadow-xl">
                <div className="grid lg:grid-cols-[1.15fr_0.85fr]">
                  <div className="p-8 md:p-12">
                    <p className="text-sm font-bold uppercase tracking-[0.25em] text-emerald-700">
                      {activePath.eyebrow}
                    </p>

                    <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-950 md:text-5xl">
                      {activePath.title}
                    </h2>

                    <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-600">
                      {activePath.description}
                    </p>

                    <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm leading-6 text-emerald-950">
                      Your selected state, region, and customer path will carry
                      forward into the next stage of the website.
                    </div>
                  </div>

                  <div className="bg-slate-950 p-8 text-white md:p-12">
                    <p className="text-sm font-bold uppercase tracking-[0.22em] text-emerald-400">
                      Current Selection
                    </p>

                    <div className="mt-7 space-y-5">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                          State
                        </p>

                        <p className="mt-1 text-xl font-black">
                          {selectedState}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                          Region
                        </p>

                        <p className="mt-1 text-xl font-black">
                          {selectedRegion}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                          Customer Path
                        </p>

                        <p className="mt-1 text-xl font-black">
                          {activePath.eyebrow}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled
                      className="mt-9 w-full cursor-not-allowed rounded-2xl bg-white px-5 py-4 font-bold text-slate-950 opacity-60"
                    >
                      Continue — Next Section Coming
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-[2rem] border border-dashed border-slate-400 bg-white px-8 py-14 text-center">
                <p className="text-sm font-bold uppercase tracking-[0.25em] text-emerald-700">
                  Choose Your Starting Point
                </p>

                <h2 className="mt-3 text-3xl font-black text-slate-950">
                  Select your location and preferred path above.
                </h2>

                <p className="mx-auto mt-4 max-w-2xl leading-7 text-slate-600">
                  The next stage changes depending on whether you want to
                  purchase nationwide, request regional IDS services, or receive
                  a guided equipment recommendation.
                </p>
              </div>
            )}
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