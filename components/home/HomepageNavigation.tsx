"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import type { HomeView } from "@/lib/homepage-navigation";

type MenuKey = "machines" | "service" | "about";
const menuLabels: Record<MenuKey, string> = {
  machines: "OUR MACHINES",
  service: "SERVICE AND SCHEDULE",
  about: "ABOUT IDS",
};
const menuLink = "block min-h-11 rounded-lg px-4 py-3 text-sm font-semibold leading-5 text-slate-800 transition hover:bg-emerald-50 hover:text-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700";

export default function HomepageNavigation({ activeView, onSelect }: {
  activeView: HomeView;
  onSelect: (view: HomeView) => void;
}) {
  const [openMenu, setOpenMenu] = useState<MenuKey | null>(null);
  const root = useRef<HTMLElement>(null);
  const triggers = useRef<Partial<Record<MenuKey, HTMLButtonElement | null>>>({});
  const panels = useRef<Partial<Record<MenuKey, HTMLDivElement | null>>>({});
  const focusOnOpen = useRef<"first" | "last" | null>(null);
  const id = useId();

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpenMenu(null);
    };
    const closeForHistory = () => setOpenMenu(null);
    document.addEventListener("pointerdown", closeOutside);
    window.addEventListener("popstate", closeForHistory);
    window.addEventListener("hashchange", closeForHistory);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("popstate", closeForHistory);
      window.removeEventListener("hashchange", closeForHistory);
    };
  }, []);

  useEffect(() => {
    if (!openMenu || !focusOnOpen.current) return;
    const links = panels.current[openMenu]?.querySelectorAll<HTMLAnchorElement>("a[href]");
    (focusOnOpen.current === "last" ? links?.[links.length - 1] : links?.[0])?.focus();
    focusOnOpen.current = null;
  }, [openMenu]);

  const selectView = (event: MouseEvent<HTMLAnchorElement>, view: HomeView) => {
    // Keep native new-tab/window behavior for modifier clicks.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    setOpenMenu(null);
    onSelect(view);
  };
  const viewLink = (view: HomeView, label: string) => <Link href={view === "home" ? "/" : `/#${view}`} className={menuLink} aria-current={activeView === view ? "page" : undefined} onClick={(event) => selectView(event, view)}>{label}</Link>;
  const close = () => setOpenMenu(null);
  const triggerKey = (event: KeyboardEvent<HTMLButtonElement>, key: MenuKey) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const edge = event.key === "ArrowUp" ? "last" : "first";
    if (openMenu === key) {
      const links = panels.current[key]?.querySelectorAll<HTMLAnchorElement>("a[href]");
      (edge === "last" ? links?.[links.length - 1] : links?.[0])?.focus();
    } else {
      focusOnOpen.current = edge;
      setOpenMenu(key);
    }
  };
  const panelKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const links = Array.from(event.currentTarget.querySelectorAll<HTMLAnchorElement>("a[href]"));
    if (!links.length) return;
    const index = links.findIndex((link) => link === document.activeElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? links.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + links.length) % links.length;
    event.preventDefault();
    links[next]?.focus();
  };

  return <header ref={root} className="relative z-40 border-b border-slate-200 bg-white text-slate-950" onBlur={(event) => {
    if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setOpenMenu(null);
  }} onKeyDown={(event) => {
    if (event.key === "Escape" && openMenu) {
      event.preventDefault();
      triggers.current[openMenu]?.focus();
      setOpenMenu(null);
    }
  }}>
    <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:gap-6 lg:px-10 lg:py-4">
      <Link href="/" onClick={(event) => selectView(event, "home")} className="order-first ml-auto flex w-44 flex-col items-center text-center focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700 lg:order-last lg:ml-0 lg:w-64 lg:shrink-0" aria-label="Integrity Distribution Systems home">
        <Image src="/logo.png" alt="Integrity Distribution Systems" width={1250} height={500} priority className="h-auto w-36 object-contain lg:w-56" />
        <span className="mt-1 text-[10px] font-bold leading-tight tracking-wide text-slate-700 lg:text-sm">Integrity Distribution Systems</span>
      </Link>
      <nav aria-label="Main navigation" className="relative grid flex-1 grid-cols-3 items-stretch gap-1.5 lg:flex lg:flex-wrap lg:items-center lg:gap-1">
        <Link href="/" onClick={(event) => selectView(event, "home")} aria-current={activeView === "home" ? "page" : undefined} className="flex min-h-11 items-center justify-center rounded-lg px-2 py-2 text-[10px] font-black tracking-wide transition hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-700 sm:text-xs lg:px-3">HOME</Link>
        {(Object.keys(menuLabels) as MenuKey[]).map((key) => <div key={key} className="contents lg:relative lg:block">
          <button ref={(element) => { triggers.current[key] = element; }} id={`${id}-${key}-trigger`} type="button" aria-expanded={openMenu === key} aria-controls={`${id}-${key}-panel`} onKeyDown={(event) => triggerKey(event, key)} onClick={() => { focusOnOpen.current = null; setOpenMenu(openMenu === key ? null : key); }} className={`flex min-h-11 items-center justify-center gap-1 rounded-lg px-2 py-2 text-[10px] font-black tracking-wide transition focus-visible:outline-2 focus-visible:outline-emerald-700 sm:text-xs lg:px-3 ${openMenu === key ? "bg-emerald-50 text-emerald-900" : "hover:bg-slate-50"}`}>
            <span>{menuLabels[key]}</span><svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" className={`shrink-0 transition-transform ${openMenu === key ? "rotate-180" : ""}`}><path d="m3 4.5 3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <div ref={(element) => { panels.current[key] = element; }} id={`${id}-${key}-panel`} aria-labelledby={`${id}-${key}-trigger`} hidden={openMenu !== key} onKeyDown={panelKey} className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[min(65vh,36rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-[0_20px_60px_-15px_rgba(15,23,42,0.3)] lg:right-auto lg:w-80">
            {key === "machines" && <>
              {viewLink("machines", "ALL MACHINES")}
              <Link href="/equipment/lymow-one-plus" onClick={close} className={menuLink}>LYMOW<span className="mt-0.5 block text-xs font-normal text-slate-500">One Plus robotic mowing</span></Link>
              <div className="my-1 rounded-lg bg-slate-50 p-1">
                <Link href="/equipment/yarbo" onClick={close} className={menuLink}>YARBO<span className="mt-0.5 block text-xs font-normal text-slate-500">Modular systems and PAC-MAN editions</span></Link>
                <Link href="/equipment/yarbo-pac-man-snow-blower-gen-2" onClick={close} className="ml-4 block min-h-11 rounded-lg px-4 py-3 text-xs font-bold text-emerald-800 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-700">PAC-MAN Snow Blower →</Link>
                <Link href="/equipment/yarbo-pac-man-snow-blower-gen-2-mower-pro" onClick={close} className="ml-4 block min-h-11 rounded-lg px-4 py-3 text-xs font-bold text-emerald-800 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-700">PAC-MAN Snow Blower + Mower Pro →</Link>
              </div>
              <Link href="/equipment/pandag-g1" onClick={close} className={menuLink}>PANDAG<span className="mt-0.5 block text-xs font-normal text-slate-500">Commercial equipment information</span></Link>
              <Link href="/equipment/accessories" onClick={close} className={`${menuLink} mt-1 border-t border-slate-100`}>ACCESSORIES &amp; PARTS</Link>
              {viewLink("financing", "FINANCING OPTIONS")}
            </>}
            {key === "service" && <>
              <Link href="/services-scheduling" onClick={close} className={menuLink}>SERVICES &amp; SCHEDULING</Link>
              <Link href="/professional-installation" onClick={close} className={menuLink}>INSTALLATION &amp; SETUP</Link>
              <Link href="/service" onClick={close} className={menuLink}>SERVICE &amp; REPAIR</Link>
              <Link href="/remote-assistance" onClick={close} className={menuLink}>REMOTE SUPPORT &amp; ASSISTANCE</Link>
              <Link href="/services-scheduling?service=demo&source=contact_ids#services-top" onClick={close} className={`${menuLink} mt-1 border-t border-slate-100`}>SCHEDULE SERVICE/DEMO</Link>
              {viewLink("contact", "CONTACT IDS")}
            </>}
            {key === "about" && <>
              <Link href="/about-us" onClick={close} className={menuLink}>ABOUT US</Link>
              {viewLink("reviews", "CUSTOMER REVIEWS")}
              {viewLink("ids-action", "IDS IN ACTION")}
              <Link href="/featured-businesses" onClick={close} className={menuLink}>FEATURED BUSINESSES</Link>
              <Link href="/referral-program" onClick={close} className={menuLink}>REFERRAL PROGRAM</Link>
              <Link href="/dealer-tech-resources" onClick={close} className={`${menuLink} mt-1 border-t border-slate-100 text-emerald-800`}>DEALER PORTAL</Link>
              {viewLink("contact", "CONTACT IDS")}
            </>}
          </div>
        </div>)}
        <Link href="/#build" onClick={(event) => selectView(event, "build")} aria-current={activeView === "build" ? "page" : undefined} className="col-span-2 flex min-h-11 items-center justify-center rounded-lg bg-emerald-700 px-3 py-2 text-[10px] font-black tracking-wide text-white shadow-sm transition hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 sm:text-xs lg:ml-2 lg:px-4">BUILD YOUR SYSTEM</Link>
      </nav>
    </div>
  </header>;
}
