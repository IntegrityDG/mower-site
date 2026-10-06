"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { PricingItem } from "@/lib/admin-pricing/types";
import type { PackageCorePriceAdminRow } from "@/lib/admin-pricing/package-core-prices";
import { centralDateTimeInputToIso, isoToLocalDateTimeInput } from "@/lib/admin-pricing/datetime-local";
import { sellingPriceDecision } from "@/lib/pricing-program/policy";
import { isYarboModuleSlug } from "@/lib/catalog/yarbo";
import AdminPricingDialog from "./AdminPricingDialog";
import PricingCatalogCard, { pricingMoney } from "./PricingCatalogCard";

type CoreDraft = { msrp: string; regular: string; sale: string; dealerCost: string; start: string; end: string; promotion: string; status: string; showPublicPrice: boolean; contactForPricing: boolean };
const dollars = (value: number | null | undefined) => value == null ? "" : (value / 100).toFixed(2);
const cents = (value: string) => value.trim() === "" ? null : /^\d+(?:\.\d{1,2})?$/.test(value) && Number.isSafeInteger(Math.round(Number(value) * 100)) ? Math.round(Number(value) * 100) : NaN;
const previewCents = (value: string) => { const parsed = cents(value); return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null; };
export const corePriceDraft = (row: PackageCorePriceAdminRow): CoreDraft => ({ msrp: dollars(row.displayMsrpPriceCents), regular: dollars(row.regularPriceCents), sale: dollars(row.salePriceCents), dealerCost: dollars(row.normalDealerCostCents), start: isoToLocalDateTimeInput(row.saleStartsAt), end: isoToLocalDateTimeInput(row.saleEndsAt), promotion: row.promotionLabel ?? "", status: row.publicStatus, showPublicPrice: row.storedShowPublicPrice ?? row.showPublicPrice, contactForPricing: row.storedContactForPricing ?? row.contactForPricing });

export function corePricePreview(row: PackageCorePriceAdminRow, draft: CoreDraft) {
  if (row.priceContextBlocked || draft.status === "hidden" || !draft.showPublicPrice || draft.contactForPricing) return null;
  return sellingPriceDecision({ display_msrp_price_cents: previewCents(draft.msrp), regular_price_cents: previewCents(draft.regular), sale_price_cents: previewCents(draft.sale), sale_starts_at: centralDateTimeInputToIso(draft.start), sale_ends_at: centralDateTimeInputToIso(draft.end) }, row.pricingProgramEnabled !== false).priceCents;
}

export function isPairedYarboPackage(item: PricingItem, rows: PackageCorePriceAdminRow[]) {
  if (item.values.core_selectable === true) return true;
  const contexts = rows.filter(row => row.packageId === item.id);
  return contexts.some(row => row.priceMode === "package") && contexts.some(row => row.priceMode === "core_specific");
}

export function packageContextItem(item: PricingItem, row: PackageCorePriceAdminRow): PricingItem {
  return { ...item, category: (row.priceMode === "core_specific") ? "Y40P" : "Y40", values: { ...item.values, display_msrp_price_cents: row.displayMsrpPriceCents ?? null, regular_price_cents: row.regularPriceCents, sale_price_cents: row.salePriceCents, sale_starts_at: row.saleStartsAt, sale_ends_at: row.saleEndsAt, promotion_label: row.promotionLabel, show_public_price: row.storedShowPublicPrice ?? row.showPublicPrice, contact_for_pricing: row.storedContactForPricing ?? row.contactForPricing, public_status: row.publicStatus }, effectivePriceCents: row.effectivePriceCents ?? null, checkoutPriceCents: row.checkoutPriceCents, effectiveSourceLabel: row.sourceLabel, effectiveExplanation: [row.explanation, row.availabilityExplanation].filter(Boolean).join(" "), availabilityStatus: row.effectiveAvailabilityStatus ?? row.publicStatus, isAvailable: row.isAvailable ?? row.publicStatus === "active", saleState: row.saleState, priceContextBlocked: row.priceContextBlocked ?? item.priceContextBlocked, dealerCostCents: row.dealerCostCents ?? null, normalDealerCostCents: row.normalDealerCostCents ?? null };
}

function matches(item: PricingItem, search: string, kind: string) {
  const text = `${item.name} ${item.slug} ${item.sku ?? ""} ${item.productName ?? ""} ${item.category}`.toLowerCase();
  return text.includes(search.toLowerCase()) && (kind === "all" || item.kind === kind || kind === "sale" && item.saleState === "active" || kind === "upcoming" && item.saleState === "upcoming" || kind === "unavailable" && !item.isAvailable || kind === "contact" && (item.effectiveSource === "contact_for_pricing" || item.values.contact_for_pricing === true || item.quoteOnly));
}

function CorePriceEditor({ row, onClose, onSaved }: { row: PackageCorePriceAdminRow; onClose: () => void; onSaved: (row: PackageCorePriceAdminRow) => void }) {
  const [draft, setDraft] = useState(() => corePriceDraft(row));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const proposedPrice = corePricePreview(row, draft);
  const suppressed = row.priceContextBlocked || draft.status === "hidden" || !draft.showPublicPrice || draft.contactForPricing;
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const amounts = { display_msrp_price_cents: cents(draft.msrp), regular_price_cents: cents(draft.regular), sale_price_cents: cents(draft.sale), dealer_cost_cents: cents(draft.dealerCost) };
    if (Object.values(amounts).some(value => typeof value === "number" && !Number.isFinite(value))) { setError("Enter valid dollar amounts with no more than two decimal places, or leave them blank."); return; }
    const start = centralDateTimeInputToIso(draft.start); const end = centralDateTimeInputToIso(draft.end);
    if ((draft.start && !start) || (draft.end && !end)) { setError("Enter valid Central Time sale dates."); return; }
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/pricing/package-core-prices/${row.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...amounts, sale_starts_at: start, sale_ends_at: end, promotion_label: draft.promotion.trim() || null, public_status: draft.status, show_public_price: draft.showPublicPrice, contact_for_pricing: draft.contactForPricing, expectedUpdatedAt: row.updatedAt }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Pricing could not be saved.");
      onSaved(payload.row);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Pricing could not be saved."); }
    finally { setSaving(false); }
  }
  return <AdminPricingDialog title={`Edit ${row.coreName} · ${row.packageName}`} onClose={onClose} busy={saving}>
    <p className="mb-4 text-sm text-slate-600">This changes the {row.coreName} pricing context for one public package. {row.availabilityExplanation}</p>
    <div className="grid gap-3 rounded-2xl bg-slate-100 p-4 sm:grid-cols-2"><div><p className="text-xs font-black uppercase">Current customer price</p><p className="mt-1 text-2xl font-black">{pricingMoney(row.effectivePriceCents)}</p></div><div><p className="text-xs font-black uppercase">Proposed customer price</p><p className="mt-1 text-2xl font-black">{pricingMoney(proposedPrice)}</p><p className="mt-1 text-xs text-slate-600">{row.priceContextBlocked ? "A parent offering or required dependency currently blocks this pricing context." : suppressed ? "Public pricing is suppressed." : "Final customer amount is rechecked against Core and package availability when saved."}</p></div></div>
    <form onSubmit={save} className="mt-5 grid gap-4 sm:grid-cols-2">{([["msrp", "Manufacturer / MSRP"], ["regular", "IDS Everyday Price"], ["sale", "Temporary Sale Price"], ["dealerCost", "Dealer Cost — PRIVATE / IDS INTERNAL ONLY"]] as const).map(([field, label]) => <label key={field} className="text-sm font-bold">{label} ($)<input type="number" min="0" step="0.01" value={draft[field]} onChange={event => setDraft(current => ({ ...current, [field]: event.target.value }))} className="mt-2 w-full rounded-xl border p-3"/><span className="mt-1 block text-xs font-normal text-slate-500">{field === "dealerCost" ? "Blank uses the package-level cost where configured." : "Blank = not set."}</span></label>)}
      {([["start", "Sale Start"], ["end", "Sale End"]] as const).map(([field,label]) => <label key={field} className="text-sm font-bold">{label} (Central Time)<input type="datetime-local" value={draft[field]} onChange={event => setDraft(current => ({ ...current, [field]: event.target.value }))} className="mt-2 w-full rounded-xl border p-3"/></label>)}
      <label className="text-sm font-bold">Promotion Label<input maxLength={160} value={draft.promotion} onChange={event => setDraft(current => ({ ...current, promotion: event.target.value }))} className="mt-2 w-full rounded-xl border p-3"/></label><label className="text-sm font-bold">Availability<select value={draft.status} onChange={event => setDraft(current => ({ ...current, status: event.target.value }))} className="mt-2 w-full rounded-xl border bg-white p-3">{["active","unavailable","coming_soon","hidden"].map(value => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
      <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={draft.showPublicPrice} onChange={event => setDraft(current => ({ ...current, showPublicPrice: event.target.checked }))}/> Show public price</label><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={draft.contactForPricing} onChange={event => setDraft(current => ({ ...current, contactForPricing: event.target.checked }))}/> Contact for pricing</label>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 font-bold text-red-800 sm:col-span-2">{error}</p>}<button disabled={saving} className="min-h-12 rounded-xl bg-emerald-700 px-5 py-3 font-black text-white disabled:opacity-60 sm:col-span-2">{saving ? "Saving…" : "Save Pricing"}</button>
    </form>
  </AdminPricingDialog>;
}

export default function YarboPricingWorkspace({ items, search, kind, onEdit, onDelete, onEditCatalog, onAvailability, availabilitySavingKey }: {
  items: PricingItem[]; search: string; kind: string; onEdit: (item: PricingItem) => void; onDelete: (item: PricingItem) => void; onEditCatalog: (item: PricingItem) => void; onAvailability: (item: PricingItem, status: "active" | "unavailable" | "hidden") => void; availabilitySavingKey: string | null;
}) {
  const [rows, setRows] = useState<PackageCorePriceAdminRow[]>([]);
  const [editing, setEditing] = useState<PackageCorePriceAdminRow | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/admin/pricing/package-core-prices", { cache: "no-store", signal: controller.signal }).then(async response => { const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? "Yarbo pricing could not be loaded."); setRows(payload.rows ?? []); setError(""); }).catch(failure => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Yarbo pricing could not be loaded."); });
    return () => controller.abort();
  }, [items]);
  const yarbo = items.filter(item => item.brand === "Yarbo");
  const base = yarbo.find(item => item.kind === "products" && item.slug === "yarbo");
  const pro = yarbo.find(item => item.kind === "variants" && /y40p/i.test(`${item.slug} ${item.name}`));
  const cores = [base, pro].filter((item): item is PricingItem => Boolean(item)).filter(item => matches({ ...item, name: item.id === base?.id ? "Y40 Core" : "Y40P Core" }, search, kind));
  const modules = yarbo.filter(item => item.kind === "options" || item.kind === "products" && item.id !== base?.id || item.kind === "variants" && item.id !== pro?.id && !/y40(?:-core)?$/i.test(item.slug)).filter(item => matches(item, search, kind));
  const corePackages = yarbo.filter(item => item.kind === "packages" && isPairedYarboPackage(item, rows));
  const otherPackages = yarbo.filter(item => item.kind === "packages" && !corePackages.some(candidate => candidate.id === item.id)).filter(item => matches(item, search, kind));
  const packages = corePackages.map(item => ({ item, contexts: rows.filter(row => row.packageId === item.id).sort((a,b) => Number((a.priceMode === "core_specific")) - Number((b.priceMode === "core_specific"))) })).filter(({ item, contexts }) => contexts.length ? contexts.some(row => matches(packageContextItem(item,row),search,kind)) : matches(item,search,kind));
  const card = (item: PricingItem, heading?: string, compatibility?: string) => <PricingCatalogCard key={`${item.kind}:${item.id}`} item={heading?.endsWith("Core") ? { ...item, name: heading } : item} heading={heading} compatibility={compatibility} onEdit={() => onEdit(item)} onDelete={() => onDelete(item)} onAvailability={status => onAvailability(item,status)} availabilitySaving={Boolean(availabilitySavingKey)}/>;
  return <div className="mt-5 space-y-7">
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 font-bold text-red-800">{error}</p>}{message && <p role="status" className="rounded-xl bg-blue-50 p-4 font-bold text-blue-950">{message}</p>}
    {cores.length > 0 && <section aria-labelledby="yarbo-cores-title"><h2 id="yarbo-cores-title" className="text-lg font-black uppercase tracking-wide">Yarbo Cores</h2><div className="mt-3 grid gap-4 lg:grid-cols-2">{cores.map(item => card(item, item.id === base?.id ? "Y40 Core" : "Y40P Core"))}</div></section>}
    {packages.length > 0 && <section aria-labelledby="yarbo-packages-title"><h2 id="yarbo-packages-title" className="text-lg font-black uppercase tracking-wide">Yarbo Packages</h2><p className="mt-1 text-sm text-slate-600">Each pair controls two Core choices for the same customer-facing package.</p><div className="mt-4 space-y-5">{packages.map(({ item, contexts }) => <section key={item.id} aria-label={item.name} className="rounded-3xl border border-slate-300 bg-slate-200/50 p-3 sm:p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-1"><h3 className="text-lg font-black">{item.name}</h3><button type="button" onClick={() => onEditCatalog(item)} className="min-h-11 rounded-xl border bg-white px-3 py-2 text-sm font-bold">Edit package contents</button></div><div className="grid gap-4 lg:grid-cols-2">{contexts.map(row => <PricingCatalogCard key={row.id} item={packageContextItem(item,row)} heading={(row.priceMode === "core_specific") ? "Y40P" : "Y40"} onEdit={() => row.priceMode === "package" ? onEdit(item) : setEditing(row)} onDelete={() => onDelete(item)}/>)}{contexts.length === 0 && <p className="p-4 text-sm font-bold">Pricing contexts are loading. {error && "Refresh the catalog before editing this package."}</p>}</div></section>)}</div></section>}
    {modules.length > 0 && <section aria-labelledby="yarbo-modules-title"><h2 id="yarbo-modules-title" className="text-lg font-black uppercase tracking-wide">Modules &amp; Accessories</h2><div className="mt-3 grid gap-4 lg:grid-cols-2">{modules.map(item => card(item, item.category, item.compatibility?.length ? `Compatible with ${item.compatibility.join(" + ")}` : isYarboModuleSlug(item.slug) ? "Compatible with Y40 + Y40P" : undefined))}</div></section>}
    {otherPackages.length > 0 && <section aria-labelledby="yarbo-other-packages-title"><h2 id="yarbo-other-packages-title" className="text-lg font-black uppercase tracking-wide">Other catalog packages</h2><div className="mt-3 grid gap-4 lg:grid-cols-2">{otherPackages.map(item => card(item))}</div></section>}
    {editing && <CorePriceEditor key={editing.id} row={editing} onClose={() => setEditing(null)} onSaved={updated => { setRows(current => current.map(row => row.id === updated.id ? updated : row)); setEditing(null); setMessage(updated.effectivePriceCents == null ? `Saved. ${updated.explanation}` : `Saved — customer price is now ${pricingMoney(updated.effectivePriceCents)} from ${updated.sourceLabel}.`); }}/>}
  </div>;
}
