"use client";

import { useCallback, useEffect, useState } from "react";
import HomepageContactSection from "@/components/contact/HomepageContactSection";
import NationwidePurchaseFlow from "@/components/customer-paths/purchase/NationwidePurchaseFlow";
import ScheduleDemoModal from "@/components/demo-scheduling/ScheduleDemoModal";
import EquipmentCatalog from "@/components/equipment/EquipmentCatalog";
import HomeBusinessSpotlight from "@/components/featured-businesses/HomeBusinessSpotlight";
import IdsActionCarousel from "@/components/ids-action/IdsActionCarousel";
import HomeFinancing from "@/components/home/HomeFinancing";
import HomePriceMatch from "@/components/promotions/HomePriceMatch";
import HomeSalesSpecial from "@/components/promotions/HomeSalesSpecial";
import HomeReviews from "@/components/reviews/HomeReviews";
import { homeUrlForView, homeViewFromLocation } from "@/lib/homepage-navigation";
import DesktopHomeNavigation, { type DesktopHomeView } from "./DesktopHomeNavigation";

function DesktopHeader({ menuOpen, onOpen }: { menuOpen: boolean; onOpen: () => void }) {
  return <header className="border-b border-slate-300 bg-white"><div className="mx-auto flex max-w-7xl items-center gap-8 px-6 py-5 md:px-10"><div className="flex min-w-0 flex-1 items-center gap-8"><img src="/logo.png" alt="Integrity Distribution Systems" width={1250} height={500} className="h-auto w-[280px] shrink-0 object-contain lg:w-[340px]" /><div className="min-w-0 border-l border-slate-300 pl-8 text-left"><p className="text-3xl font-black leading-tight tracking-tight text-slate-950 lg:text-4xl">Integrity Distribution Systems</p><p className="mt-2 text-base font-bold uppercase tracking-[0.15em] text-emerald-700 lg:text-lg">Autonomous Lawn Care Solutions</p></div></div><button type="button" aria-label="Open desktop navigation" aria-expanded={menuOpen} aria-controls="desktop-navigation" onClick={onOpen} className="flex min-h-14 shrink-0 items-center gap-3 rounded-2xl border border-slate-300 bg-white px-5 font-black shadow-sm hover:bg-slate-50"><span className="flex flex-col gap-1.5" aria-hidden="true"><span className="h-0.5 w-7 bg-slate-900" /><span className="h-0.5 w-7 bg-slate-900" /><span className="h-0.5 w-7 bg-slate-900" /></span><span>MENU</span></button></div></header>;
}

function DesktopHero() {
  return <section className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 px-10 py-16 text-white"><div className="pointer-events-none absolute inset-0 opacity-20"><div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-emerald-400 blur-3xl" /><div className="absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-cyan-400 blur-3xl" /></div><div className="relative z-10 mx-auto w-full max-w-5xl text-center"><div className="flex w-full justify-center"><img src="/images/cartoon-mowers.png" alt="Autonomous mower lineup" className="h-auto w-full max-w-[720px] object-contain drop-shadow-2xl" /></div><p className="mt-4 w-full text-center text-2xl font-bold uppercase leading-tight tracking-[0.08em] text-emerald-400 md:text-[2rem]"><span className="block md:inline">A SMALL BUSINESS</span>{" "}<span className="block md:inline">WITH A SIMPLE</span>{" "}<span className="block md:inline">PURPOSE</span></p><h1 className="mx-auto mt-5 max-w-4xl text-5xl font-black leading-[1.08] tracking-tight">Helping people get more time back for what matters most.</h1><p className="mx-auto mt-7 max-w-4xl text-xl leading-8 text-slate-200">Integrity Distribution Systems is a small, Southeast Missouri&ndash;based business built around honesty, practical guidance, and doing right by the people we serve. We are not here to push the most expensive machine or chase the biggest sale. Our goal is to help each customer find a system that genuinely fits their property, needs, and budget.</p><p className="mx-auto mt-5 max-w-4xl text-xl leading-8 text-slate-200">After spending a great deal of my own life working away from home, I understand how valuable time can be. Autonomous lawn care can reduce the hours and expense tied up in routine property maintenance, giving people more time with family, more room in their budget, and a little more opportunity to slow down and enjoy life.</p><div className="mt-8 flex justify-center"><div className="inline-flex rounded-2xl border border-white/20 bg-white/10 px-6 py-3 text-sm font-semibold text-slate-100 backdrop-blur">Southeast Missouri Based &bull; Nationwide Equipment Sales &bull; Regional Hands-On Support</div></div></div></section>;
}

function DesktopFooter() {
  return <footer className="border-t border-slate-800 bg-slate-950 text-slate-300"><div className="mx-auto grid max-w-7xl gap-8 px-10 py-12 md:grid-cols-2"><div><p className="text-lg font-black text-white">Integrity Distribution Systems</p><p className="mt-3 max-w-xl text-sm leading-6">Nationwide autonomous mower sales with professional installation, setup, and ongoing support available throughout the IDS regional service area.</p></div><div className="text-right"><p className="text-sm font-bold uppercase tracking-[0.2em] text-emerald-400">Regional Service Coverage</p><p className="mt-3 text-sm leading-6">Southern Missouri &bull; Northern Arkansas &bull; Western Kentucky<br />Western Tennessee &bull; Southern Illinois</p></div></div></footer>;
}

export default function DesktopHomepage() {
  const [view, setView] = useState<DesktopHomeView>("home");
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const selectView = useCallback((next: DesktopHomeView, push = true) => {
    setView(next);
    window.scrollTo({ top: 0, behavior: "auto" });
    if (push) window.history.pushState({ idsHomeView: next }, "", homeUrlForView(window.location, next));
  }, []);
  useEffect(() => {
    const initialViewTimer = window.setTimeout(() => setView(homeViewFromLocation(window.location)), 0);
    const onPopState = () => { setView(homeViewFromLocation(window.location)); window.scrollTo(0, 0); };
    window.addEventListener("popstate", onPopState);
    return () => { window.clearTimeout(initialViewTimer); window.removeEventListener("popstate", onPopState); };
  }, []);

  return <div className="hidden min-h-screen bg-slate-100 text-slate-950 md:block"><DesktopHeader menuOpen={menuOpen} onOpen={() => setMenuOpen(true)} /><DesktopHomeNavigation open={menuOpen} activeView={view} onClose={closeMenu} onSelect={selectView} /><main>{view === "home" && <><DesktopHero /><section className="bg-white px-10 py-12 text-center"><button type="button" onClick={() => selectView("build")} className="w-full max-w-2xl rounded-2xl bg-emerald-600 px-10 py-6 text-xl font-black tracking-wide text-white shadow-lg transition hover:bg-emerald-700">BUILD YOUR SYSTEM</button><p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-600">Choose your equipment, customize your setup, and continue to secure checkout.</p></section><HomeSalesSpecial /><HomePriceMatch /><HomeBusinessSpotlight /></>}{view !== "home" && <section className="bg-slate-100 px-10 py-10"><button type="button" onClick={() => selectView("home")} className="mb-7 min-h-12 rounded-xl bg-white px-5 py-3 font-black text-emerald-700 shadow-sm">← Back to Home</button>{view === "build" && <div id="location-and-customer-path"><div className="mx-auto mb-9 max-w-3xl text-center"><p className="text-sm font-bold uppercase tracking-[0.25em] text-emerald-700">BUILD YOUR SYSTEM</p><h1 className="mt-2 text-5xl font-black">Choose your equipment and create the right setup for your property.</h1><p className="mt-4 text-lg leading-7 text-slate-600">Select your machine, customize its configuration, review your complete price and financing options, then provide delivery information and continue to secure checkout.</p></div><NationwidePurchaseFlow /></div>}{view === "machines" && <div className="mx-auto max-w-7xl"><div className="mb-8 grid items-start gap-8 md:grid-cols-[minmax(0,1fr)_auto]"><div><p className="text-sm font-black uppercase tracking-[0.2em] text-emerald-700">OUR MACHINES</p><h1 className="mt-2 text-5xl font-black">Featured Machines</h1><p className="mt-4 max-w-3xl text-lg leading-8 text-slate-600">Explore our featured autonomous lawn care systems, then choose the machine you would like to see in action.</p></div><ScheduleDemoModal source="featured_machines" triggerClassName="inline-flex min-h-14 items-center justify-center rounded-2xl bg-emerald-600 px-7 py-4 font-black text-white shadow-md hover:bg-emerald-700" /></div><EquipmentCatalog /></div>}{view === "financing" && <HomeFinancing />}{view === "reviews" && <HomeReviews />}{view === "ids-action" && <IdsActionCarousel />}{view === "contact" && <HomepageContactSection />}</section>}</main><DesktopFooter /></div>;
}
