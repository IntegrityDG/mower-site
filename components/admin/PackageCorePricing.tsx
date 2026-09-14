"use client";

import { useEffect, useState, type FormEvent } from "react";
import { isoToLocalDateTimeInput } from "@/lib/admin-pricing/datetime-local";
import type { PackageCorePriceAdminRow } from "@/lib/admin-pricing/package-core-prices";

type Draft = {
  regular: string;
  sale: string;
  start: string;
  end: string;
  promotion: string;
  status: string;
  showPublicPrice: boolean;
  contactForPricing: boolean;
};

const money = (cents: number | null) => cents === null ? "Inherited from package" :
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const dollars = (cents: number | null) => cents === null ? "" : (cents / 100).toFixed(2);
const cents = (value: string) => {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(amount) ? amount : null;
};
const draftFor = (row: PackageCorePriceAdminRow): Draft => ({
  regular: dollars(row.regularPriceCents),
  sale: dollars(row.salePriceCents),
  start: isoToLocalDateTimeInput(row.saleStartsAt),
  end: isoToLocalDateTimeInput(row.saleEndsAt),
  promotion: row.promotionLabel ?? "",
  status: row.publicStatus,
  showPublicPrice: row.showPublicPrice,
  contactForPricing: row.contactForPricing,
});

async function fetchRows(): Promise<PackageCorePriceAdminRow[]> {
  const response = await fetch("/api/admin/pricing/package-core-prices", { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? "Package/Core pricing is unavailable.");
  return payload.rows ?? [];
}

export default function PackageCorePricing() {
  const [rows, setRows] = useState<PackageCorePriceAdminRow[]>([]);
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState<PackageCorePriceAdminRow | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  async function load() {
    try { setRows(await fetchRows()); setLoadError(""); }
    catch (error) { setLoadError(error instanceof Error ? error.message : "Package/Core pricing is unavailable."); }
  }

  useEffect(() => {
    let cancelled = false;
    void fetchRows().then((data) => { if (!cancelled) setRows(data); })
      .catch((error) => { if (!cancelled) setLoadError(error instanceof Error ? error.message : "Package/Core pricing is unavailable."); });
    return () => { cancelled = true; };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || !draft) return;
    const regular = cents(draft.regular);
    const sale = draft.sale.trim() ? cents(draft.sale) : null;
    if (regular === null || (draft.sale.trim() && sale === null)) {
      setMessage("Enter valid dollar amounts with no more than two decimal places.");
      return;
    }
    setSaving(true);
    setMessage("");
    const response = await fetch(`/api/admin/pricing/package-core-prices/${editing.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        regular_price_cents: regular,
        sale_price_cents: sale,
        sale_starts_at: draft.start ? new Date(draft.start).toISOString() : null,
        sale_ends_at: draft.end ? new Date(draft.end).toISOString() : null,
        promotion_label: draft.promotion.trim() || null,
        public_status: draft.status,
        show_public_price: draft.showPublicPrice,
        contact_for_pricing: draft.contactForPricing,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) { setMessage(payload.error ?? "Could not save package/Core pricing."); return; }
    setRows((current) => current.map((row) => row.id === editing.id ? payload.row : row));
    setEditing(null);
    setDraft(null);
    setMessage(`${editing.packageName} / ${editing.coreName} pricing saved.`);
  }

  return <section aria-labelledby="package-core-pricing-title" className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs font-black uppercase tracking-[.18em] text-emerald-700">Yarbo Catalog</p>
        <h2 id="package-core-pricing-title" className="mt-1 text-2xl font-black">Package + Core pricing</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">One package has a Y40 price inherited from the existing package record and a separate Y40P price. Edit Y40 prices on the package record below. Edit Core availability on the Y40 or Y40P variant record below.</p>
      </div>
      <button type="button" onClick={() => void load()} className="rounded-xl border border-slate-300 px-4 py-2 font-bold">Refresh</button>
    </div>
    {loadError && <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-950">{loadError}</p>}
    {message && <p role="status" className="mt-4 rounded-xl bg-blue-50 p-3 text-sm font-bold text-blue-950">{message}</p>}
    {rows.length > 0 && <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{rows.map((row) => <article key={row.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-black uppercase tracking-wider text-slate-600">{row.coreName} · {row.coreStatus.replaceAll("_", " ")}</p>
      <h3 className="mt-1 text-lg font-black">{row.packageName}</h3>
      <p className="mt-2 text-sm">{row.priceMode === "package" ? "Existing package price" : "Regular / MSRP"}: <strong>{money(row.regularPriceCents)}</strong></p>
      {row.salePriceCents !== null && <p className="mt-1 text-sm">Temporary sale: <strong>{money(row.salePriceCents)}</strong></p>}
      <p className="mt-1 text-xs font-bold uppercase text-slate-500">Pair status: {row.publicStatus.replaceAll("_", " ")}</p>
      {row.priceMode === "core_specific" && <button type="button" onClick={() => { setEditing(row); setDraft(draftFor(row)); setMessage(""); }} className="mt-4 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white">Edit package/Core price</button>}
    </article>)}</div>}
    {editing && draft && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/70 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="core-price-edit-title" className="max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3"><h3 id="core-price-edit-title" className="text-xl font-black">{editing.packageName} / {editing.coreName}</h3><button type="button" onClick={() => setEditing(null)} className="rounded-lg border px-3 py-2 font-bold">Close</button></div>
        <p className="mt-2 text-sm text-slate-600">Core status: {editing.coreStatus.replaceAll("_", " ")}. Change it on the variant record in Pricing Management.</p>
        <form onSubmit={save} className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="font-bold">Regular / MSRP ($)<input required inputMode="decimal" value={draft.regular} onChange={(e) => setDraft({ ...draft, regular: e.target.value })} className="mt-1 w-full rounded-xl border p-3" /></label>
          <label className="font-bold">Temporary sale ($)<input inputMode="decimal" value={draft.sale} onChange={(e) => setDraft({ ...draft, sale: e.target.value })} className="mt-1 w-full rounded-xl border p-3" /></label>
          <label className="font-bold">Sale starts<input type="datetime-local" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} className="mt-1 w-full rounded-xl border p-3" /></label>
          <label className="font-bold">Sale ends<input type="datetime-local" value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} className="mt-1 w-full rounded-xl border p-3" /></label>
          <label className="font-bold sm:col-span-2">Promotion label<input maxLength={160} value={draft.promotion} onChange={(e) => setDraft({ ...draft, promotion: e.target.value })} className="mt-1 w-full rounded-xl border p-3" /></label>
          <label className="font-bold">Pair availability<select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })} className="mt-1 w-full rounded-xl border p-3"><option value="active">Available with Core</option><option value="unavailable">Unavailable</option><option value="coming_soon">Coming Soon</option><option value="hidden">Hidden</option></select></label>
          <div className="space-y-3 sm:col-span-2"><label className="flex gap-2 font-bold"><input type="checkbox" checked={draft.showPublicPrice} onChange={(e) => setDraft({ ...draft, showPublicPrice: e.target.checked })} /> Show public price</label><label className="flex gap-2 font-bold"><input type="checkbox" checked={draft.contactForPricing} onChange={(e) => setDraft({ ...draft, contactForPricing: e.target.checked })} /> Contact for pricing</label></div>
          <button disabled={saving} className="rounded-xl bg-emerald-700 px-5 py-3 font-black text-white disabled:opacity-60 sm:col-span-2">{saving ? "Saving…" : "Save package/Core pricing"}</button>
        </form>
      </div>
    </div>}
  </section>;
}
