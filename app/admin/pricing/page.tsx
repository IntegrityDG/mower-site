"use client";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { isoToLocalDateTimeInput } from "@/lib/admin-pricing/datetime-local";
import { editablePricingFields } from "@/lib/admin-pricing/validation";
import type { PricingItem } from "@/lib/admin-pricing/types";
import { grossMarginPercent, grossProfitCents } from "@/lib/admin-pricing/gross-margin";
const labels: Record<string, string> = { display_msrp_price_cents: "Manufacturer / MSRP", regular_price_cents: "IDS Everyday Low Price", sale_price_cents: "Temporary Sale Price", sale_starts_at: "Sale Start", sale_ends_at: "Sale End", promotion_label: "Promotion Label", show_public_price: "Show Public Price", contact_for_pricing: "Contact for Pricing", override_display_msrp_price_cents: "Manufacturer / MSRP Override", override_regular_price_cents: "IDS Everyday Low Price Override", override_sale_price_cents: "Temporary Sale Price Override", override_sale_starts_at: "Sale Start Override", override_sale_ends_at: "Sale End Override", override_promotion_label: "Promotion Label Override", override_show_public_price: "Show Public Price Override", override_contact_for_pricing: "Contact for Pricing Override", is_available: "Available", schedule_name: "Schedule Name", starts_at: "Starts At", ends_at: "Ends At", public_status: "Public Status" };
const priceFields = new Set(["display_msrp_price_cents", "regular_price_cents", "sale_price_cents", "override_display_msrp_price_cents", "override_regular_price_cents", "override_sale_price_cents"]);
const fieldLabel = (kind: PricingItem["kind"], field: string) => kind === "schedules" && field === "regular_price_cents" ? "Scheduled IDS Price" : kind === "schedules" && field === "sale_price_cents" ? "Scheduled Sale Price" : labels[field] ?? field;
const dateFields = new Set(["sale_starts_at", "sale_ends_at", "override_sale_starts_at", "override_sale_ends_at", "starts_at", "ends_at"]);
const booleanFields = new Set(["show_public_price", "contact_for_pricing", "is_available"]);
const nullableBooleanFields = new Set(["override_show_public_price", "override_contact_for_pricing"]);
const money = (cents: number | null) => cents === null ? "Not set" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const margin = (value: number | null) => value === null ? "Not available" : `${value.toFixed(1)}%`;
const itemPrice = (item: PricingItem, field: string) => typeof item.values[field] === "number" ? item.values[field] as number : null;
const itemDate = (item: PricingItem, field: string) => typeof item.values[field] === "string" ? item.values[field] as string : null;
const dateLabel = (value: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value));
function PricingFacts({ item }: {
    item: PricingItem;
}) {
    if (item.kind === "schedules")
        return null;
    const prefix = item.kind === "product-services" ? "override_" : "";
    const msrp = itemPrice(item, `${prefix}display_msrp_price_cents`);
    const everyday = itemPrice(item, `${prefix}regular_price_cents`);
    const sale = itemPrice(item, `${prefix}sale_price_cents`);
    const start = itemDate(item, `${prefix}sale_starts_at`);
    const end = itemDate(item, `${prefix}sale_ends_at`);
    const everydayProfit = grossProfitCents(everyday, item.dealerCostCents);
    const saleProfit = grossProfitCents(sale, item.dealerCostCents);
    return <dl className="mt-4 grid gap-2 border-t pt-4 text-sm"><div><dt className="font-bold">Manufacturer / MSRP</dt><dd>{money(msrp)}</dd></div><div><dt className="font-bold">IDS Everyday Price</dt><dd>{money(everyday)}</dd></div><div><dt className="font-bold">Temporary Sale Price</dt><dd>{money(sale)}</dd></div>{sale !== null && (start || end) && <div><dt className="font-bold">Sale Period</dt><dd>{start ? dateLabel(start) : "Open start"} – {end ? dateLabel(end) : "No end date"}</dd></div>}<div className="mt-2 rounded-xl bg-slate-950 p-3 text-white"><dt className="font-black">🔒 Dealer Cost — PRIVATE / IDS INTERNAL ONLY</dt><dd>{item.dealerCostCents === null ? "Not set" : money(item.dealerCostCents)}</dd></div><div><dt className="font-bold">Gross Profit at Everyday Price</dt><dd>{everydayProfit === null ? "Not available" : money(everydayProfit)}</dd></div><div><dt className="font-bold">Gross Margin at Everyday Price</dt><dd>{margin(grossMarginPercent(everyday, item.dealerCostCents))}</dd></div>{sale !== null && <><div><dt className="font-bold">Gross Profit at Sale Price</dt><dd>{saleProfit === null ? "Not available" : money(saleProfit)}</dd></div><div><dt className="font-bold">Gross Margin at Sale Price</dt><dd>{margin(grossMarginPercent(sale, item.dealerCostCents))}</dd></div></>}</dl>;
}
function initialDraft(item: PricingItem) {
    return Object.fromEntries(editablePricingFields[item.kind].map((field) => {
        const value = item.values[field];
        if (priceFields.has(field))
            return [field, typeof value === "number" ? (value / 100).toFixed(2) : ""];
        if (dateFields.has(field))
            return [field, isoToLocalDateTimeInput(typeof value === "string" ? value : null)];
        if (nullableBooleanFields.has(field))
            return [field, value === null || value === undefined ? "inherit" : String(value)];
        return [field, value ?? ""];
    }));
}
export default function PricingAdminPage() {
    const [authed, setAuthed] = useState<boolean | null>(null);
    const [password, setPassword] = useState("");
    const [items, setItems] = useState<PricingItem[]>([]);
    const [message, setMessage] = useState("");
    const [search, setSearch] = useState("");
    const [kind, setKind] = useState("all");
    const [brand, setBrand] = useState("all");
    const [editing, setEditing] = useState<PricingItem | null>(null);
    const [draft, setDraft] = useState<Record<string, unknown>>({});
    const [saving, setSaving] = useState(false);
    const [availabilitySavingKey, setAvailabilitySavingKey] = useState<string | null>(null);
    const load = useCallback(async () => { const response = await fetch("/api/admin/pricing", { cache: "no-store" }); if (response.status === 401) {
        setAuthed(false);
        return;
    } const payload = await response.json().catch(() => ({})); if (response.ok) {
        setItems(payload.items);
        setAuthed(true);
        setMessage("");
    }
    else {
        setAuthed(true);
        setMessage(payload.error ?? "Pricing catalog could not be loaded.");
    } }, []);
    useEffect(() => { fetch("/api/admin/pricing", { cache: "no-store" }).then(async (response) => { if (response.status === 401) {
        setAuthed(false);
        return;
    } const payload = await response.json().catch(() => ({})); if (response.ok) {
        setItems(payload.items);
        setAuthed(true);
        setMessage("");
    }
    else {
        setAuthed(true);
        setMessage(payload.error ?? "Pricing catalog could not be loaded.");
    } }); }, []);
    async function login(event: FormEvent) { event.preventDefault(); const response = await fetch("/api/admin/reviews/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) }); if (response.ok) {
        setPassword("");
        await load();
    }
    else
        setMessage("Invalid password."); }
    function edit(item: PricingItem) { setEditing(item); setDraft(initialDraft(item)); setMessage(""); }
    async function setAvailability(item: PricingItem, available: boolean) {
        const nextStatus = available ? "active" : "unavailable";
        if (item.availabilityStatus === nextStatus || availabilitySavingKey)
            return;
        const key = `${item.kind}:${item.id}`;
        const previousItems = items;
        setAvailabilitySavingKey(key);
        setMessage("");
        setItems(current => current.map(candidate => candidate.kind === item.kind && candidate.id === item.id ? {
            ...candidate,
            isAvailable: available,
            availabilityStatus: nextStatus,
            publicStatus: candidate.availabilityField === "public_status" ? nextStatus : candidate.publicStatus,
            values: { ...candidate.values, [candidate.availabilityField]: candidate.availabilityField === "is_available" ? available : nextStatus },
        } : candidate));
        const body = item.availabilityField === "is_available" ? { is_available: available } : { public_status: nextStatus };
        try {
            const response = await fetch(`/api/admin/pricing/${item.kind}/${item.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok)
                throw new Error(payload.error ?? "Availability update failed.");
            setItems(current => current.map(candidate => candidate.kind === payload.item.kind && candidate.id === payload.item.id ? payload.item : candidate));
            setMessage(`${payload.item.name} is now ${available ? "available" : "unavailable"}.`);
        }
        catch (error) {
            setItems(previousItems);
            setMessage(`Availability update failed: ${error instanceof Error ? error.message : "Please try again."}`);
        }
        finally {
            setAvailabilitySavingKey(null);
        }
    }
    async function save(event: FormEvent) { event.preventDefault(); if (!editing)
        return; setSaving(true); setMessage(""); const body: Record<string, unknown> = {}; for (const field of editablePricingFields[editing.kind]) {
        const value = draft[field];
        if (priceFields.has(field)) {
            if (value === "")
                body[field] = null;
            else {
                const dollars = Number(value);
                body[field] = Number.isFinite(dollars) ? Math.round(dollars * 100) : value;
            }
        }
        else if (dateFields.has(field))
            body[field] = value ? new Date(String(value)).toISOString() : null;
        else if (nullableBooleanFields.has(field))
            body[field] = value === "inherit" ? null : value === "true";
        else
            body[field] = value;
    } const response = await fetch(`/api/admin/pricing/${editing.kind}/${editing.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); const payload = await response.json().catch(() => ({})); setSaving(false); if (!response.ok) {
        setMessage(payload.error ?? "Pricing update failed.");
        return;
    } setItems(current => current.map(item => item.kind === payload.item.kind && item.id === payload.item.id ? payload.item : item)); setEditing(null); setMessage(`${payload.item.name} pricing saved successfully.`); }
    const brands = useMemo(() => [...new Set(items.map(item => item.brand ?? item.productName?.split(" ")[0] ?? null).filter(Boolean) as string[])].sort(), [items]);
    const filtered = useMemo(() => items.filter(item => { const query = search.trim().toLowerCase(); const matchesSearch = !query || [item.name, item.slug, item.brand, item.productName, item.targetLabel].some(value => value?.toLowerCase().includes(query)); const matchesKind = kind === "all" || item.kind === kind; const matchesBrand = brand === "all" || [item.brand, item.productName].some(value => value?.toLowerCase().includes(brand.toLowerCase())); return matchesSearch && matchesKind && matchesBrand; }), [items, search, kind, brand]);
    if (authed === null)
        return <main className="min-h-screen bg-slate-100 p-6">Loading admin…</main>;
    if (!authed)
        return <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6"><form onSubmit={login} className="w-full max-w-md rounded-[2rem] bg-white p-8 shadow-xl"><p className="text-sm font-bold uppercase tracking-[.2em] text-emerald-700">IDS Admin</p><h1 className="mt-2 text-3xl font-black">Pricing Management</h1><p className="mt-3 text-slate-600">Use the existing IDS administrator password.</p><label className="mt-6 block font-bold">Admin password<input type="password" required value={password} onChange={event => setPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 p-3"/></label><button className="mt-5 w-full rounded-xl bg-slate-950 px-5 py-3 font-black text-white">Sign In</button>{message && <p role="alert" className="mt-4 text-red-700">{message}</p>}</form></main>;
    return <main className="min-h-screen bg-slate-100 p-5 text-slate-950 md:p-10"><div className="mx-auto max-w-7xl"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-bold uppercase tracking-[.2em] text-emerald-700">IDS Admin</p><h1 className="text-4xl font-black">Pricing Management</h1></div><button onClick={async () => { await fetch("/api/admin/reviews/login", { method: "DELETE" }); setAuthed(false); }} className="rounded-xl border px-4 py-2 font-bold">Sign Out</button></div>
  <div className="mt-7 rounded-2xl border border-amber-300 bg-amber-50 p-4 font-bold text-amber-950">Checkout pricing order: Active Temporary Sale Price → IDS Everyday Low Price. Manufacturer MSRP is display-only and is never charged.</div>
  <div className="mt-3 rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 font-black text-amber-950">Pricing changes made here directly control the public storefront and checkout pricing.</div>
  <p className="mt-2 font-semibold text-slate-700">Manufacturer sync and catalog imports cannot automatically change IDS selling prices.</p>
  <div className="mt-6 grid gap-4 rounded-2xl bg-white p-5 md:grid-cols-3"><label className="font-bold">Search<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Name or slug" className="mt-2 w-full rounded-xl border p-3"/></label><label className="font-bold">Type<select value={kind} onChange={event => setKind(event.target.value)} className="mt-2 w-full rounded-xl border bg-white p-3"><option value="all">All categories</option>{Object.entries({ products: "Equipment", variants: "Product Variants", packages: "Packages", options: "Modules / Options", services: "Services", "service-payment-options": "Service Payment Options", "product-services": "Product-Service Overrides", schedules: "Price Schedules" }).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="font-bold">Brand / Product<select value={brand} onChange={event => setBrand(event.target.value)} className="mt-2 w-full rounded-xl border bg-white p-3"><option value="all">All brands</option>{brands.map(value => <option key={value}>{value}</option>)}</select></label></div>
  {message && <p role="status" className="mt-5 rounded-xl bg-white p-4 font-bold">{message}</p>}<p className="mt-6 font-bold">{filtered.length} pricing records</p><div className="mt-4 grid gap-4 lg:grid-cols-2">{filtered.map(item => <article key={`${item.kind}:${item.id}`} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.16em] text-emerald-700">{item.category}</p><h2 className="mt-1 text-xl font-black">{item.name}</h2><p className="text-sm text-slate-500">{[item.slug, item.brand, item.productName].filter(Boolean).join(" · ")}</p>{item.targetLabel && <p className="mt-1 text-sm font-bold">Target: {item.targetLabel}</p>}</div><button onClick={() => edit(item)} className="rounded-xl bg-slate-950 px-4 py-2 font-black text-white">Edit</button></div><div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3"><span className="mr-1 text-xs font-black uppercase tracking-[.16em] text-slate-700">Available</span><button type="button" aria-pressed={item.availabilityStatus === "active"} disabled={Boolean(availabilitySavingKey)} onClick={() => void setAvailability(item, true)} className={`rounded-lg px-4 py-2 text-sm font-black ${item.availabilityStatus === "active" ? "bg-emerald-600 text-white" : "border border-slate-300 bg-white text-slate-700"} disabled:cursor-wait disabled:opacity-60`}>ON</button><button type="button" aria-pressed={item.availabilityStatus === "unavailable"} disabled={Boolean(availabilitySavingKey)} onClick={() => void setAvailability(item, false)} className={`rounded-lg px-4 py-2 text-sm font-black ${item.availabilityStatus === "unavailable" ? "bg-slate-950 text-white" : "border border-slate-300 bg-white text-slate-700"} disabled:cursor-wait disabled:opacity-60`}>OFF</button><span className={`ml-auto rounded-full px-3 py-1 text-xs font-black uppercase ${item.isAvailable ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-950"}`}>{availabilitySavingKey === `${item.kind}:${item.id}` ? "SAVING…" : item.availabilityStatus === "active" ? "AVAILABLE" : item.availabilityStatus === "unavailable" ? "UNAVAILABLE" : item.availabilityStatus.replaceAll("_", " ")}</span></div><div className="mt-4 flex flex-wrap gap-2"><span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold">Effective: {money(item.effectivePriceCents)}</span>{item.activeScheduleName && <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-black text-blue-900">Active schedule: {item.activeScheduleName}</span>}{item.quoteOnly && <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-black text-amber-900">Quote only — not self-service</span>}</div><PricingFacts item={item}/></article>)}</div></div>
  {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4" onMouseDown={event => { if (event.target === event.currentTarget && !saving)
        setEditing(null); }}><div role="dialog" aria-modal="true" aria-labelledby="pricing-edit-heading" className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl sm:p-8"><div className="flex justify-between gap-4"><div><p className="text-sm font-bold uppercase text-emerald-700">{editing.category}</p><h2 id="pricing-edit-heading" className="text-2xl font-black">Edit {editing.name}</h2></div><button type="button" onClick={() => setEditing(null)} className="h-fit rounded-xl border px-3 py-2 font-bold">Close</button></div>{editing.kind === "product-services" && <p className="mt-4 rounded-xl bg-blue-50 p-3 font-bold text-blue-900">Blank = inherit base service pricing</p>}{editing.quoteOnly && <p className="mt-4 rounded-xl bg-amber-50 p-3 font-bold text-amber-950">This product remains quote-only. Pricing changes do not enable self-service checkout.</p>}<form onSubmit={save} className="mt-5 grid gap-4 sm:grid-cols-2">{editablePricingFields[editing.kind].map(field => <label key={field} className="font-bold">{fieldLabel(editing.kind, field)}{priceFields.has(field) ? <input type="number" min="0" step="0.01" value={String(draft[field] ?? "")} onChange={event => setDraft(current => ({ ...current, [field]: event.target.value }))} placeholder="2799.00" className="mt-2 w-full rounded-xl border p-3"/> : dateFields.has(field) ? <input type="datetime-local" required={editing.kind === "schedules" && field === "starts_at"} value={String(draft[field] ?? "")} onChange={event => setDraft(current => ({ ...current, [field]: event.target.value }))} className="mt-2 w-full rounded-xl border p-3"/> : booleanFields.has(field) ? <input type="checkbox" checked={Boolean(draft[field])} onChange={event => setDraft(current => ({ ...current, [field]: event.target.checked }))} className="ml-3 h-5 w-5 accent-emerald-600"/> : nullableBooleanFields.has(field) ? <select value={String(draft[field] ?? "inherit")} onChange={event => setDraft(current => ({ ...current, [field]: event.target.value }))} className="mt-2 w-full rounded-xl border bg-white p-3"><option value="inherit">Blank — inherit</option><option value="true">Yes</option><option value="false">No</option></select> : field === "public_status" ? <select value={String(draft[field] ?? "hidden")} onChange={event => setDraft(current => ({ ...current, [field]: event.target.value }))} className="mt-2 w-full rounded-xl border bg-white p-3">{["active", "unavailable", "coming_soon", "hidden"].map(value => <option key={value}>{value}</option>)}</select> : <input maxLength={160} required={field === "schedule_name"} value={String(draft[field] ?? "")} onChange={event => setDraft(current => ({ ...current, [field]: event.target.value }))} className="mt-2 w-full rounded-xl border p-3"/>}</label>)}<div className="sm:col-span-2"><p className="mb-4 rounded-xl bg-amber-50 p-3 font-bold text-amber-950">Checkout pricing order: Active Temporary Sale Price → IDS Everyday Price. Manufacturer / Comparison Price is display-only and is never charged.</p><button disabled={saving} className="rounded-xl bg-emerald-600 px-6 py-3 font-black text-white disabled:opacity-60">{saving ? "Saving…" : "Save Pricing"}</button></div></form></div></div>}</main>;
}
