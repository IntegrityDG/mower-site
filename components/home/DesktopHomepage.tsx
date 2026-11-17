"use client";

import Link from "next/link";
import FooterActions from "@/components/footer/FooterActions";
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
import type { HomeHeroSnapshot } from "@/lib/promotions/home-hero";
import HomePromotionHero from "@/components/home/HomePromotionHero";
import HomepageNavigation from "@/components/home/HomepageNavigation";
import HomeReviews from "@/components/reviews/HomeReviews";
import { homeUrlForView, homeViewFromLocation } from "@/lib/homepage-navigation";
import type { HomeView } from "@/lib/homepage-navigation";

function DesktopFooter() {
  return <footer className="border-t border-slate-800 bg-slate-950 text-slate-300"><div className="mx-auto grid max-w-7xl gap-8 px-10 py-12 md:grid-cols-2"><div><p className="text-lg font-black text-white">Integrity Distribution Systems</p><p className="mt-3 max-w-xl text-sm leading-6">Nationwide autonomous mower sales. Demos, installation, setup, and physical service or repair are available only within the IDS regional service area. Remote assistance is our only nationwide service, subject to eligibility and availability.</p></div><div className="text-right"><p className="text-sm font-bold uppercase tracking-[0.2em] text-emerald-400">Regional Service Coverage</p><p className="mt-3 text-sm leading-6">Missouri &bull; Southern Illinois &bull; Northeast Arkansas<br />Western Kentucky &bull; Western Tennessee</p></div><div className="md:col-span-2"><p className="mb-5 text-sm leading-6">Connect with IDS through our <Link href="/referral-program" className="underline">referral program</Link>, meet <Link href="/featured-businesses" className="underline">featured small businesses</Link>, or explore <Link href="/dealer-tech-resources" className="underline">dealer and technician resources</Link>.</p><FooterActions /></div></div></footer>;
}

export default function DesktopHomepage({ heroSnapshot, heroObservedAt }: { heroSnapshot: HomeHeroSnapshot; heroObservedAt?: number }) {
  const [view, setView] = useState<HomeView>("home");
  const selectView = useCallback((next: HomeView, push = true) => {
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

  return <div className="hidden min-h-screen bg-slate-100 text-slate-950 md:block"><HomepageNavigation activeView={view} onSelect={selectView} /><main>{view === "home" && <><HomePromotionHero initialSnapshot={heroSnapshot} serverObservedAt={heroObservedAt} onBuild={() => selectView("build")} /><HomeSalesSpecial /><HomePriceMatch /><HomeBusinessSpotlight /></>}{view !== "home" && <section className="bg-slate-100 px-10 py-10"><button type="button" onClick={() => selectView("home")} className="mb-7 min-h-12 rounded-xl bg-white px-5 py-3 font-black text-emerald-700 shadow-sm">← Back to Home</button>{view === "build" && <div id="location-and-customer-path"><div className="mx-auto mb-9 max-w-3xl text-center"><p className="text-sm font-bold uppercase tracking-[0.25em] text-emerald-700">BUILD YOUR SYSTEM</p><h1 className="mt-2 text-5xl font-black">Choose your equipment and create the right setup for your property.</h1><p className="mt-4 text-lg leading-7 text-slate-600">Select your machine, customize its configuration, review your complete price and financing options, then provide delivery information and continue to secure checkout.</p></div><NationwidePurchaseFlow /></div>}{view === "machines" && <div className="mx-auto max-w-7xl"><div className="mb-8 grid items-start gap-8 md:grid-cols-[minmax(0,1fr)_auto]"><div><p className="text-sm font-black uppercase tracking-[0.2em] text-emerald-700">OUR MACHINES</p><h1 className="mt-2 text-5xl font-black">Featured Machines</h1><p className="mt-4 max-w-3xl text-lg leading-8 text-slate-600">Explore our featured autonomous lawn care systems, then choose the machine you would like to see in action.</p></div><ScheduleDemoModal source="featured_machines" triggerClassName="inline-flex min-h-14 items-center justify-center rounded-2xl bg-emerald-600 px-7 py-4 font-black text-white shadow-md hover:bg-emerald-700" /></div><EquipmentCatalog featuredBrands /></div>}{view === "financing" && <HomeFinancing />}{view === "reviews" && <HomeReviews />}{view === "ids-action" && <IdsActionCarousel />}{view === "contact" && <HomepageContactSection />}</section>}</main><DesktopFooter /></div>;
}
