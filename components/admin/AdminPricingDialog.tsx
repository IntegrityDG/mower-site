"use client";

import { useEffect, useRef, type ReactNode } from "react";

export default function AdminPricingDialog({ title, onClose, busy, children, wide = false }: { title: string; onClose: () => void; busy?: boolean; children: ReactNode; wide?: boolean }) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.querySelector<HTMLElement>("button, input, select, textarea, [tabindex]")?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) { event.preventDefault(); onClose(); }
      if (event.key !== "Tab") return;
      const controls = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]') ?? [])];
      const first = controls[0]; const last = controls.at(-1);
      if (!dialog.current?.contains(document.activeElement)) { event.preventDefault(); first?.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [busy, onClose]);
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-3 sm:p-5" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}><div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="catalog-dialog-title" className={`max-h-[calc(100dvh-1.5rem)] w-full overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-7 ${wide ? "max-w-5xl" : "max-w-2xl"}`}><div className="mb-5 flex items-start justify-between gap-4"><h2 id="catalog-dialog-title" className="text-2xl font-black">{title}</h2><button type="button" disabled={busy} onClick={onClose} className="min-h-11 rounded-xl border px-3 py-2 font-bold disabled:opacity-50">Close</button></div>{children}</div></div>;
}
