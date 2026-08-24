"use client";

import { type FormEvent, useEffect, useState } from "react";
import { DEFAULT_SALES_SPECIALS_SLOTS, SALES_SPECIALS_CARTOONS, SALES_SPECIALS_DESCRIPTION_MAX, SALES_SPECIALS_HEADLINE_MAX, type SalesSpecialsConfig, type SalesSpecialsSlot, type SalesSpecialsSlots } from "@/lib/promotions/config";

function PromotionEditor({ slot, promotion, saving, message, onChange, onSave }: { slot: SalesSpecialsSlot; promotion: SalesSpecialsConfig; saving: boolean; message: string; onChange: (promotion: SalesSpecialsConfig) => void; onSave: (event: FormEvent) => void }) {
  const number = slot === "primary" ? 1 : 2;
  const update = <K extends keyof SalesSpecialsConfig>(key: K, value: SalesSpecialsConfig[K]) => onChange({ ...promotion, [key]: value });
  return <form onSubmit={onSave} className="space-y-6 rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
    <h2 className="text-2xl font-black uppercase">Promotion {number}</h2>
    <label className="flex items-center gap-3 font-bold"><input type="checkbox" checked={promotion.enabled} onChange={(event) => update("enabled", event.target.checked)} className="h-5 w-5 accent-emerald-600" />Show promotion on the homepage</label>
    <label className="block font-bold">Product cartoon<select value={promotion.cartoonKey} onChange={(event) => update("cartoonKey", event.target.value as SalesSpecialsConfig["cartoonKey"])} className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3">{Object.entries(SALES_SPECIALS_CARTOONS).map(([key, cartoon]) => <option key={key} value={key}>{cartoon?.label ?? "None"}</option>)}</select></label>
    <label className="block font-bold">Headline<input required maxLength={SALES_SPECIALS_HEADLINE_MAX} value={promotion.headline} onChange={(event) => update("headline", event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 p-3" /><span className="mt-1 block text-right text-xs font-normal text-slate-500">{promotion.headline.length}/{SALES_SPECIALS_HEADLINE_MAX}</span></label>
    <label className="block font-bold">Brief description<textarea required maxLength={SALES_SPECIALS_DESCRIPTION_MAX} rows={5} value={promotion.description} onChange={(event) => update("description", event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 p-3" /><span className="mt-1 block text-right text-xs font-normal text-slate-500">{promotion.description.length}/{SALES_SPECIALS_DESCRIPTION_MAX}</span></label>
    <button disabled={saving} className="rounded-xl bg-emerald-600 px-6 py-3 font-black text-white disabled:opacity-60">{saving ? "Saving…" : "Save Changes"}</button>
    {message && <p role="status" className="font-bold text-slate-700">{message}</p>}
  </form>;
}

export default function SalesSpecialsAdmin() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [promotions, setPromotions] = useState<SalesSpecialsSlots>(DEFAULT_SALES_SPECIALS_SLOTS);
  const [messages, setMessages] = useState<Record<SalesSpecialsSlot, string>>({ primary: "", secondary: "" });
  const [saving, setSaving] = useState<Record<SalesSpecialsSlot, boolean>>({ primary: false, secondary: false });

  async function load() {
    const response = await fetch("/api/admin/sales-specials");
    if (response.status === 401) { setAuthed(false); return; }
    const payload = await response.json().catch(() => ({}));
    if (response.ok) { setPromotions(payload.promotions); setAuthed(true); }
    else { setAuthed(true); setMessages((current) => ({ ...current, primary: payload.error ?? "Settings could not be loaded." })); }
  }
  useEffect(() => {
    fetch("/api/admin/sales-specials").then(async (response) => {
      if (response.status === 401) { setAuthed(false); return; }
      const payload = await response.json().catch(() => ({}));
      if (response.ok) { setPromotions(payload.promotions); setAuthed(true); }
      else { setAuthed(true); setMessages((current) => ({ ...current, primary: payload.error ?? "Settings could not be loaded." })); }
    });
  }, []);

  async function login(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/admin/reviews/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
    if (response.ok) { setPassword(""); setMessages({ primary: "", secondary: "" }); await load(); }
    else setMessages((current) => ({ ...current, primary: "Invalid password." }));
  }

  async function save(slot: SalesSpecialsSlot, event: FormEvent) {
    event.preventDefault();
    setSaving((current) => ({ ...current, [slot]: true }));
    setMessages((current) => ({ ...current, [slot]: "" }));
    const response = await fetch("/api/admin/sales-specials", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ slot, promotion: promotions[slot] }) });
    const payload = await response.json().catch(() => ({}));
    setSaving((current) => ({ ...current, [slot]: false }));
    if (response.ok) {
      setPromotions((current) => ({ ...current, [slot]: payload.promotion }));
      setMessages((current) => ({ ...current, [slot]: `Promotion ${slot === "primary" ? 1 : 2} saved successfully.` }));
    } else setMessages((current) => ({ ...current, [slot]: payload.error ?? Object.values(payload.errors ?? {}).join(" ") ?? "Save failed." }));
  }

  if (authed === null) return <main className="min-h-screen bg-slate-100 p-6 text-slate-950"><p className="mx-auto max-w-xl">Loading admin…</p></main>;
  if (!authed) return <main className="min-h-screen bg-slate-100 p-6 text-slate-950 md:p-10"><form onSubmit={login} className="mx-auto max-w-md rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm"><p className="text-sm font-bold uppercase tracking-[.2em] text-emerald-700">IDS Admin</p><h1 className="mt-2 text-4xl font-black">Sales &amp; Specials</h1><label className="mt-7 block font-bold">Admin password<input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 p-3" /></label><button className="mt-5 rounded-xl bg-emerald-600 px-5 py-3 font-black text-white">Sign In</button>{messages.primary && <p role="alert" className="mt-4 text-sm font-bold text-red-700">{messages.primary}</p>}</form></main>;
  return <main className="min-h-screen bg-slate-100 p-6 text-slate-950 md:p-10"><div className="mx-auto max-w-7xl"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-bold uppercase tracking-[.2em] text-emerald-700">IDS Admin</p><h1 className="text-4xl font-black">Sales &amp; Specials</h1></div><button onClick={async () => { await fetch("/api/admin/reviews/login", { method: "DELETE" }); setAuthed(false); }} className="rounded-xl border px-4 py-2 font-bold">Sign Out</button></div><div className="mt-7 grid gap-7 lg:grid-cols-2">{(["primary", "secondary"] as const).map((slot) => <PromotionEditor key={slot} slot={slot} promotion={promotions[slot]} saving={saving[slot]} message={messages[slot]} onChange={(promotion) => setPromotions((current) => ({ ...current, [slot]: promotion }))} onSave={(event) => save(slot, event)} />)}</div></div></main>;
}
