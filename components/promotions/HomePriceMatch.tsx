"use client";

import { useEffect, useState } from "react";
import ContactInformationModal from "@/components/contact/ContactInformationModal";
import { DEFAULT_PRICE_MATCH, type PriceMatchConfig } from "@/lib/price-match/config";

export default function HomePriceMatch() {
  const [settings, setSettings] = useState<PriceMatchConfig>(DEFAULT_PRICE_MATCH);
  useEffect(() => { fetch("/api/price-match", { cache: "no-store" }).then(async response => { if (!response.ok) throw new Error(); return response.json(); }).then(setSettings).catch(() => setSettings(DEFAULT_PRICE_MATCH)); }, []);
  if (!settings.enabled) return null;
  return <section aria-labelledby="price-match-heading" className="relative overflow-hidden border-y border-emerald-900 bg-gradient-to-br from-emerald-950 via-slate-950 to-slate-900 px-6 py-20 text-white md:px-10 md:py-24">
    <div aria-hidden="true" className="absolute -left-24 top-1/2 h-72 w-72 -translate-y-1/2 rounded-full bg-emerald-400/20 blur-3xl" />
    <div aria-hidden="true" className="absolute -right-28 top-0 h-80 w-80 rounded-full bg-cyan-400/10 blur-3xl" />
    <div className="relative mx-auto max-w-5xl text-center">
      <h2 id="price-match-heading" className="text-4xl font-black leading-tight tracking-tight sm:text-5xl lg:text-6xl">{settings.heading}</h2>
      <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-slate-200 sm:text-xl">{settings.description}</p>
      <ContactInformationModal triggerClassName="mt-8 inline-flex items-center justify-center rounded-2xl bg-emerald-400 px-8 py-4 text-lg font-black text-slate-950 shadow-xl transition hover:bg-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-200" triggerLabel={settings.buttonLabel} />
    </div>
  </section>;
}
