"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { HomeView } from "@/lib/homepage-navigation";

export type DesktopHomeView = HomeView;

const viewItems: Array<{ label: string; view: DesktopHomeView; primary?: boolean }> = [
  { label: "HOME", view: "home" },
  { label: "BUILD YOUR SYSTEM", view: "build", primary: true },
  { label: "OUR MACHINES", view: "machines" },
  { label: "FINANCING OPTIONS", view: "financing" },
  { label: "CUSTOMER REVIEWS", view: "reviews" },
  { label: "IDS IN ACTION", view: "ids-action" },
  { label: "CONTACT IDS", view: "contact" },
];

export default function DesktopHomeNavigation({ open, activeView, onClose, onSelect }: { open: boolean; activeView: DesktopHomeView; onClose: () => void; onSelect: (view: DesktopHomeView) => void }) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const drawer = closeButton.current?.closest("[role=dialog]");
      const focusable = Array.from(drawer?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href]') ?? []);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", onKeyDown);
      previousFocus.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  const choose = (view: DesktopHomeView) => { onSelect(view); onClose(); };
  const buttonClass = (primary: boolean | undefined, active: boolean) => `min-h-12 rounded-xl px-5 py-3 text-left font-black tracking-wide ${primary ? "bg-emerald-600 text-white shadow-md" : active ? "bg-emerald-50 text-emerald-800" : "text-slate-800 hover:bg-slate-100"}`;

  return (
    <div className="fixed inset-0 z-[100] hidden md:block">
      <button type="button" aria-label="Close desktop navigation" className="absolute inset-0 bg-slate-950/70" onClick={onClose} />
      <aside id="desktop-navigation" role="dialog" aria-modal="true" aria-label="Desktop navigation" className="absolute right-0 top-0 flex h-full w-[min(34rem,44vw)] min-w-[25rem] flex-col bg-white p-7 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 pb-5">
          <div><p className="text-xs font-black uppercase tracking-[.18em] text-emerald-700">Integrity Distribution Systems</p><p className="mt-1 text-xl font-black">Navigation</p></div>
          <button ref={closeButton} type="button" aria-label="Close desktop navigation" onClick={onClose} className="flex h-12 w-12 items-center justify-center rounded-xl text-3xl text-slate-700 hover:bg-slate-100">×</button>
        </div>
        <nav className="mt-6 flex flex-col gap-2" aria-label="Desktop homepage">
          {viewItems.slice(0, 3).map((item) => <button key={item.view} type="button" aria-current={activeView === item.view ? "page" : undefined} onClick={() => choose(item.view)} className={buttonClass(item.primary, activeView === item.view)}>{item.label}</button>)}
          <Link href="/equipment/accessories" className="min-h-12 rounded-xl px-5 py-3 font-black tracking-wide text-slate-800 hover:bg-slate-100">ACCESSORIES &amp; PARTS</Link>
          {viewItems.slice(3).map((item) => <button key={item.view} type="button" aria-current={activeView === item.view ? "page" : undefined} onClick={() => choose(item.view)} className={buttonClass(item.primary, activeView === item.view)}>{item.label}</button>)}
          <Link href="/dealer-tech-resources" className="mt-2 min-h-12 rounded-xl border-2 border-emerald-600 px-5 py-3 text-center font-black tracking-wide text-emerald-800 hover:bg-emerald-50">DEALER PORTAL</Link>
          <Link href="/referral-program" className="min-h-12 rounded-xl px-5 py-3 font-black tracking-wide text-slate-800 hover:bg-slate-100">REFERRAL PROGRAM</Link>
        </nav>
      </aside>
    </div>
  );
}
