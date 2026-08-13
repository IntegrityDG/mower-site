"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import HomepageContactSection from "@/components/contact/HomepageContactSection";
import NationwidePurchaseFlow from "@/components/customer-paths/purchase/NationwidePurchaseFlow";
import EquipmentCatalog from "@/components/equipment/EquipmentCatalog";
import HomeFinancing from "@/components/home/HomeFinancing";
import HomePriceMatch from "@/components/promotions/HomePriceMatch";
import HomeSalesSpecial from "@/components/promotions/HomeSalesSpecial";
import HomeReviews from "@/components/reviews/HomeReviews";
import MobileHomeNavigation, { type MobileView } from "./MobileHomeNavigation";
import HomeBusinessSpotlight from "@/components/featured-businesses/HomeBusinessSpotlight";

function MobileHeader({ menuOpen, onOpen }: { menuOpen: boolean; onOpen: () => void }) {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-300 bg-white/95 backdrop-blur md:hidden">
      <div className="flex min-h-16 items-center gap-2.5 px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <Image src="/logo.png" alt="Integrity Distribution Systems" width={1536} height={1024} className="h-auto w-[72px] shrink-0 object-contain" priority />
          <div aria-hidden="true" className="h-10 w-px shrink-0 bg-slate-300" />
          <div className="min-w-0 text-left">
            <p className="text-[12px] font-black leading-[1.15] tracking-tight text-slate-950 min-[390px]:text-sm">Integrity Distribution Systems</p>
            <p className="mt-1 text-[8px] font-bold uppercase leading-tight tracking-[0.08em] text-emerald-700 min-[390px]:text-[9px]">Autonomous Lawn Care Solutions</p>
          </div>
        </div>
        <button type="button" aria-label="Open navigation" aria-expanded={menuOpen} aria-controls="mobile-navigation" onClick={onOpen} className="flex h-11 w-11 shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white shadow-sm">
          <span className="h-0.5 w-6 bg-slate-900" /><span className="h-0.5 w-6 bg-slate-900" /><span className="h-0.5 w-6 bg-slate-900" />
        </button>
      </div>
    </header>
  );
}

function MobileHero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 px-5 py-10 text-white">
      <div className="pointer-events-none absolute inset-0 opacity-20"><div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-emerald-400 blur-3xl" /><div className="absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-cyan-400 blur-3xl" /></div>
      <div className="relative z-10 mx-auto text-center">
        <p className="text-xl font-bold uppercase leading-tight tracking-[0.02em] text-emerald-400"><span className="block">A SMALL BUSINESS</span><span className="block">WITH A SIMPLE PURPOSE</span></p>
        <h1 className="mx-auto mt-4 text-3xl font-black leading-[1.08] tracking-tight">Helping people get more time back for what matters most.</h1>
        <p className="mx-auto mt-5 text-base leading-7 text-slate-200">Integrity Distribution Systems is a small, Southeast Missouri&ndash;based business built around honesty, practical guidance, and doing right by the people we serve. We are not here to push the most expensive machine or chase the biggest sale. Our goal is to help each customer find a system that genuinely fits their property, needs, and budget.</p>
        <p className="mx-auto mt-4 text-base leading-7 text-slate-200">After spending a great deal of my own life working away from home, I understand how valuable time can be. Autonomous lawn care can reduce the hours and expense tied up in routine property maintenance, giving people more time with family, more room in their budget, and a little more opportunity to slow down and enjoy life.</p>
        <div className="mt-5 inline-flex rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-xs font-semibold text-slate-100 backdrop-blur">Southeast Missouri Based &bull; Nationwide Equipment Sales &bull; Regional Hands-On Support</div>
        <Image src="/images/cartoon-mowers.png" alt="Autonomous mower lineup" width={1536} height={1024} className="mx-auto mt-5 h-auto w-full max-w-[400px] object-contain drop-shadow-2xl" priority />
      </div>
    </section>
  );
}

function MobileFooter() {
  return <footer className="border-t border-slate-800 bg-slate-950 px-5 py-8 text-slate-300"><p className="text-lg font-black text-white">Integrity Distribution Systems</p><p className="mt-2 text-sm leading-6">Nationwide autonomous mower sales with professional installation, setup, and ongoing support available throughout the IDS regional service area.</p><p className="mt-5 text-sm font-bold uppercase tracking-[0.2em] text-emerald-400">Regional Service Coverage</p><p className="mt-2 text-sm leading-6">Southern Missouri &bull; Northern Arkansas &bull; Western Kentucky<br />Western Tennessee &bull; Southern Illinois</p></footer>;
}

export default function MobileHomepage() {
  const [view, setView] = useState<MobileView>("home");
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const selectView = useCallback((next: MobileView, push = true) => {
    setView(next);
    window.scrollTo({ top: 0, behavior: "auto" });
    if (push) window.history.pushState({ idsMobileView: next }, "", next === "home" ? window.location.pathname : `#${next}`);
  }, []);
  useEffect(() => {
    const onPopState = (event: PopStateEvent) => { setView((event.state?.idsMobileView as MobileView) || "home"); window.scrollTo(0, 0); };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950 md:hidden">
      <MobileHeader menuOpen={menuOpen} onOpen={() => setMenuOpen(true)} />
      <MobileHomeNavigation open={menuOpen} activeView={view} onClose={closeMenu} onSelect={selectView} />
      <main>
        {view === "home" && <><MobileHero /><section className="bg-white px-5 py-8 text-center"><button type="button" onClick={() => selectView("build")} className="w-full max-w-md rounded-2xl bg-emerald-600 px-6 py-5 text-lg font-black tracking-wide text-white shadow-lg transition hover:bg-emerald-700">BUILD YOUR SYSTEM</button><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">Choose your equipment, customize your setup, and continue to secure checkout.</p></section><HomeSalesSpecial /><HomePriceMatch /></>}
        {view !== "home" && <section className="bg-slate-100 px-4 py-5"><button type="button" onClick={() => selectView("home")} className="mb-5 min-h-11 rounded-xl bg-white px-4 py-2 font-black text-emerald-700 shadow-sm">← Back to Home</button>{view === "build" && <div id="location-and-customer-path"><div className="mb-6 text-center"><p className="text-sm font-bold uppercase tracking-[0.25em] text-emerald-700">BUILD YOUR SYSTEM</p><h1 className="mt-2 text-3xl font-black">Choose your equipment and create the right setup for your property.</h1></div><NationwidePurchaseFlow /></div>}{view === "machines" && <div><h1 className="mb-6 text-3xl font-black">Featured Machines</h1><EquipmentCatalog /><HomeBusinessSpotlight /></div>}{view === "financing" && <HomeFinancing />}{view === "reviews" && <HomeReviews />}{view === "contact" && <HomepageContactSection />}</section>}
      </main>
      {view === "home" && <MobileFooter />}
    </div>
  );
}
