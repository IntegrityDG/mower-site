"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { HomeView } from "@/lib/homepage-navigation";

export type MobileView = HomeView;

const viewItems: Array<{ label: string; view: MobileView; primary?: boolean }> = [
  { label: "HOME", view: "home" },
  { label: "BUILD YOUR SYSTEM", view: "build", primary: true },
  { label: "OUR MACHINES", view: "machines" },
  { label: "FINANCING OPTIONS", view: "financing" },
  { label: "CUSTOMER REVIEWS", view: "reviews" },
  { label: "IDS IN ACTION", view: "ids-action" },
  { label: "CONTACT IDS", view: "contact" },
];

export default function MobileHomeNavigation({ open, activeView, onClose, onSelect }: { open: boolean; activeView: MobileView; onClose: () => void; onSelect: (view: MobileView) => void }) {
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
      if (event.key === "Tab") {
        const drawer = closeButton.current?.closest("[role=dialog]");
        const focusable = Array.from(drawer?.querySelectorAll<HTMLElement>('button, a[href]') ?? []);
        if (!focusable.length) return;
        const first = focusable[0]; const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = originalOverflow; document.removeEventListener("keydown", onKeyDown); previousFocus.current?.focus(); };
  }, [open, onClose]);

  if (!open) return null;
  const choose = (view: MobileView) => { onSelect(view); onClose(); };
  return (
    <div className="fixed inset-0 z-[100] md:hidden">
      <button type="button" aria-label="Close navigation" className="absolute inset-0 bg-slate-950/70" onClick={onClose} />
      <aside id="mobile-navigation" role="dialog" aria-modal="true" aria-label="Mobile navigation" className="absolute right-0 top-0 flex h-full w-[min(88vw,22rem)] flex-col bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <p className="font-black text-slate-950">IDS Navigation</p>
          <button ref={closeButton} type="button" aria-label="Close navigation" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-xl text-3xl text-slate-700 hover:bg-slate-100">×</button>
        </div>
        <nav className="mt-5 flex flex-col gap-2" aria-label="Mobile homepage">
          {viewItems.slice(0, 3).map((item) => <button key={item.view} type="button" aria-current={activeView === item.view ? "page" : undefined} onClick={() => choose(item.view)} className={`min-h-12 rounded-xl px-4 py-3 text-left text-sm font-black tracking-wide ${item.primary ? "bg-emerald-600 text-white shadow-md" : activeView === item.view ? "bg-emerald-50 text-emerald-800" : "text-slate-800 hover:bg-slate-100"}`}>{item.label}</button>)}
          <Link href="/equipment/accessories" className="min-h-12 rounded-xl px-4 py-3 text-sm font-black tracking-wide text-slate-800 hover:bg-slate-100">ACCESSORIES &amp; PARTS</Link>
          <Link href="/services-scheduling" className="min-h-12 rounded-xl px-4 py-3 text-sm font-black tracking-wide text-slate-800 hover:bg-slate-100">SERVICES &amp; SCHEDULING</Link>
          {viewItems.slice(3, 5).map((item) => <button key={item.view} type="button" aria-current={activeView === item.view ? "page" : undefined} onClick={() => choose(item.view)} className={`min-h-12 rounded-xl px-4 py-3 text-left text-sm font-black tracking-wide ${activeView === item.view ? "bg-emerald-50 text-emerald-800" : "text-slate-800 hover:bg-slate-100"}`}>{item.label}</button>)}
          {viewItems.slice(5).map((item) => <button key={item.view} type="button" aria-current={activeView === item.view ? "page" : undefined} onClick={() => choose(item.view)} className={`min-h-12 rounded-xl px-4 py-3 text-left text-sm font-black tracking-wide ${activeView === item.view ? "bg-emerald-50 text-emerald-800" : "text-slate-800 hover:bg-slate-100"}`}>{item.label}</button>)}
          <Link href="/dealer-tech-resources" className="mt-2 min-h-12 rounded-xl border-2 border-emerald-600 px-4 py-3 text-center text-sm font-black tracking-wide text-emerald-800 hover:bg-emerald-50">DEALER PORTAL</Link>
          <Link href="/referral-program" className="min-h-12 rounded-xl px-4 py-3 text-sm font-black tracking-wide text-slate-800 hover:bg-slate-100">REFERRAL PROGRAM</Link>
        </nav>
      </aside>
    </div>
  );
}
