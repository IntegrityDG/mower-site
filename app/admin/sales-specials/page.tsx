"use client";

import { type FormEvent, useEffect, useState } from "react";
import {
  DEFAULT_SALES_SPECIALS,
  SALES_SPECIALS_CARTOONS,
  SALES_SPECIALS_DESCRIPTION_MAX,
  SALES_SPECIALS_HEADLINE_MAX,
  type SalesSpecialsConfig,
} from "@/lib/promotions/config";

export default function SalesSpecialsAdmin() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [promotion, setPromotion] = useState(DEFAULT_SALES_SPECIALS);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const response = await fetch("/api/admin/sales-specials");
    if (response.status === 401) { setAuthed(false); return; }
    const payload = await response.json().catch(() => ({}));
    if (response.ok) { setPromotion(payload.promotion); setAuthed(true); }
    else { setAuthed(true); setMessage(payload.error ?? "Settings could not be loaded."); }
  }
  useEffect(() => {
    fetch("/api/admin/sales-specials").then(async (response) => {
      if (response.status === 401) { setAuthed(false); return; }
      const payload = await response.json().catch(() => ({}));
      if (response.ok) { setPromotion(payload.promotion); setAuthed(true); }
      else { setAuthed(true); setMessage(payload.error ?? "Settings could not be loaded."); }
    });
  }, []);

  async function login(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/admin/reviews/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
    if (response.ok) { setPassword(""); setMessage(""); await load(); }
    else setMessage("Invalid password.");
  }

  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true); setMessage("");
    const response = await fetch("/api/admin/sales-specials", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(promotion) });
    const payload = await response.json().catch(() => ({}));
    setSaving(false);
    if (response.ok) { setPromotion(payload.promotion); setMessage("Sales & Specials saved successfully."); }
    else setMessage(payload.error ?? Object.values(payload.errors ?? {}).join(" ") ?? "Save failed.");
  }

  if (authed === null) return <main className="min-h-screen bg-slate-100 p-6 text-slate-950"><p className="mx-auto max-w-xl">Loading admin…</p></main>;
  if (!authed) return <main className="min-h-screen bg-slate-100 p-6 text-slate-950 md:p-10"><form onSubmit={login} className="mx-auto max-w-md rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm"><p className="text-sm font-bold uppercase tracking-[.2em] text-emerald-700">IDS Admin</p><h1 className="mt-2 text-4xl font-black">Sales &amp; Specials</h1><label className="mt-7 block font-bold">Admin password<input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 p-3" /></label><button className="mt-5 rounded-xl bg-emerald-600 px-5 py-3 font-black text-white">Sign In</button>{message && <p role="alert" className="mt-4 text-sm font-bold text-red-700">{message}</p>}</form></main>;

  const update = <K extends keyof SalesSpecialsConfig>(key: K, value: SalesSpecialsConfig[K]) => setPromotion((current) => ({ ...current, [key]: value }));
  return <main className="min-h-screen bg-slate-100 p-6 text-slate-950 md:p-10"><div className="mx-auto max-w-3xl"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-bold uppercase tracking-[.2em] text-emerald-700">IDS Admin</p><h1 className="text-4xl font-black">Sales &amp; Specials</h1></div><button onClick={async () => { await fetch("/api/admin/reviews/login", { method: "DELETE" }); setAuthed(false); }} className="rounded-xl border px-4 py-2 font-bold">Sign Out</button></div><form onSubmit={save} className="mt-7 space-y-6 rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm sm:p-9"><label className="flex items-center gap-3 font-bold"><input type="checkbox" checked={promotion.enabled} onChange={(event) => update("enabled", event.target.checked)} className="h-5 w-5 accent-emerald-600" />Show promotion on the homepage</label><label className="block font-bold">Product cartoon<select value={promotion.cartoonKey} onChange={(event) => update("cartoonKey", event.target.value as SalesSpecialsConfig["cartoonKey"])} className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3">{Object.entries(SALES_SPECIALS_CARTOONS).map(([key, cartoon]) => <option key={key} value={key}>{cartoon?.label ?? "None"}</option>)}</select></label><label className="block font-bold">Headline<input required maxLength={SALES_SPECIALS_HEADLINE_MAX} value={promotion.headline} onChange={(event) => update("headline", event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 p-3" /><span className="mt-1 block text-right text-xs font-normal text-slate-500">{promotion.headline.length}/{SALES_SPECIALS_HEADLINE_MAX}</span></label><label className="block font-bold">Brief description<textarea required maxLength={SALES_SPECIALS_DESCRIPTION_MAX} rows={5} value={promotion.description} onChange={(event) => update("description", event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 p-3" /><span className="mt-1 block text-right text-xs font-normal text-slate-500">{promotion.description.length}/{SALES_SPECIALS_DESCRIPTION_MAX}</span></label><button disabled={saving} className="rounded-xl bg-emerald-600 px-6 py-3 font-black text-white disabled:opacity-60">{saving ? "Saving…" : "Save Changes"}</button>{message && <p role="status" className="font-bold text-slate-700">{message}</p>}</form></div></main>;
}
