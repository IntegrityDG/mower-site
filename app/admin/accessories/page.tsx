"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import AdminNav from "@/components/admin/AdminNav";
import AccessoryImageUploader from "@/components/admin/AccessoryImageUploader";
import { ACCESSORY_AVAILABILITY_LABELS, ACCESSORY_AVAILABILITY_STATUSES, type AccessoryAction, type AccessoryAvailabilityStatus, type AccessoryCatalogResponse, type AccessoryItem, type AccessoryPackageRelationship, type AccessorySettings, type AccessoryTab, type AccessoryVariantRelationship } from "@/lib/accessories/types";

type Draft = {
  id?: string; tab: AccessoryTab; publicStatus: AccessoryAvailabilityStatus;
  name: string; description: string; imageUrl: string; imageAlt: string;
  badge: string; manufacturer: string; idsExclusive: boolean; showInBuilder: boolean;
  visible: boolean; isIncluded: boolean; isRecommended: boolean; sortOrder: number;
  regularPrice: string; salePrice: string; promotionLabel: string;
  showPublicPrice: boolean; contactForPricing: boolean; actionType: AccessoryAction;
  actionLabel: string; actionUrl: string; priceText: string;
  variantRelationships: AccessoryVariantRelationship[];
  packageRelationships: AccessoryPackageRelationship[];
};
const blank = (tab: AccessoryTab): Draft => ({
  tab, publicStatus: "active", name: "", description: "", imageUrl: "", imageAlt: "",
  badge: "", manufacturer: "", idsExclusive: false, showInBuilder: tab === "lymow" || tab === "yarbo",
  visible: true, isIncluded: false, isRecommended: false, sortOrder: 100,
  regularPrice: "", salePrice: "", promotionLabel: "", showPublicPrice: true,
  contactForPricing: false, actionType: tab === "aftermarket" ? "external" : tab === "pandag" ? "contact" : "builder",
  actionLabel: tab === "aftermarket" ? "Go to Manufacturer's Site" : tab === "pandag" ? "Contact IDS" : "View / Purchase",
  actionUrl: "", priceText: "", variantRelationships: [], packageRelationships: [],
});
const fromItem = (item: AccessoryItem): Draft => ({
  id: item.id, tab: item.tab, publicStatus: item.publicStatus, name: item.name,
  description: item.description ?? "", imageUrl: item.imageUrl ?? "", imageAlt: item.imageAlt ?? "",
  badge: item.badge ?? "", manufacturer: item.manufacturer ?? "", idsExclusive: item.idsExclusive,
  showInBuilder: item.showInBuilder, visible: item.visible ?? false, isIncluded: item.isIncluded,
  isRecommended: item.isRecommended, sortOrder: item.sortOrder,
  regularPrice: item.regularPriceCents === null ? "" : (item.regularPriceCents / 100).toFixed(2),
  salePrice: item.salePriceCents === null ? "" : (item.salePriceCents / 100).toFixed(2),
  promotionLabel: item.promotionLabel ?? "", showPublicPrice: item.showPublicPrice,
  contactForPricing: item.contactForPricing, actionType: item.actionType,
  actionLabel: item.actionLabel ?? "", actionUrl: item.actionUrl ?? "",
  priceText: item.priceText ?? "", variantRelationships: item.variantRelationships,
  packageRelationships: item.packageRelationships,
});
const tabs: AccessoryTab[] = ["lymow", "yarbo", "pandag", "aftermarket"];

export default function AccessoriesAdmin() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [data, setData] = useState<AccessoryCatalogResponse | null>(null);
  const [filter, setFilter] = useState<AccessoryTab>("lymow");
  const [editing, setEditing] = useState<Draft | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const response = await fetch("/api/admin/accessories", { cache: "no-store" });
      if (response.status === 401) { setAuthed(false); return; }
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Accessories are unavailable.");
      setData(payload);
      setAuthed(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Accessories are unavailable."); }
  }
  useEffect(() => { void load(); }, []);
  async function login(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/admin/reviews/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
    if (response.ok) { setPassword(""); await load(); } else setMessage("Invalid password.");
  }
  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    if (!data) return;
    setBusy(true);
    try {
      const response = await fetch("/api/admin/accessories", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(data.settings) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setData({ ...data, settings: payload.settings });
      setMessage("Page settings saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Settings could not be saved."); }
    finally { setBusy(false); }
  }
  async function saveItem(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setBusy(true);
    try {
      const response = await fetch(editing.id ? `/api/admin/accessories/${editing.id}` : "/api/admin/accessories", { method: editing.id ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(editing) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setEditing(null);
      await load();
      setMessage("Accessory saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Accessory could not be saved."); }
    finally { setBusy(false); }
  }
  async function setAvailability(item: AccessoryItem, status: AccessoryAvailabilityStatus) {
    const response = await fetch(`/api/admin/accessories/${item.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
    setMessage(response.ok ? `${item.name} status changed to ${ACCESSORY_AVAILABILITY_LABELS[status]}.` : "Status change failed.");
    if (response.ok) await load();
  }
  const edit = (change: Partial<Draft>) => setEditing((current) => current ? { ...current, ...change } : current);
  const setSetting = <K extends keyof AccessorySettings>(key: K, value: AccessorySettings[K]) =>
    setData((current) => current ? { ...current, settings: { ...current.settings, [key]: value } } : current);
  if (authed === null) return <main className="p-8">Loading admin...</main>;
  if (!authed) return <main className="min-h-screen bg-slate-100 p-6"><form onSubmit={login} className="mx-auto max-w-md rounded-3xl bg-white p-8"><p className="font-bold uppercase text-emerald-700">IDS Admin</p><h1 className="mt-2 text-4xl font-black">Accessories &amp; Aftermarket</h1><label className="mt-6 block font-bold">Admin password<input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-xl border p-3" /></label><button className="mt-5 rounded-xl bg-emerald-600 px-5 py-3 font-black text-white">Sign In</button>{message && <p role="alert" className="mt-3 text-red-700">{message}</p>}</form></main>;
  if (!data) return <main role="alert" className="p-8">{message || "Accessories are unavailable."}</main>;

  const settings = data.settings;
  const shown = data.items.filter((item) => item.tab === filter);
  const variants = data.variants?.filter((target) => target.tab === editing?.tab) ?? [];
  const packages = data.packages?.filter((target) => target.tab === editing?.tab) ?? [];
  return <main className="min-h-screen bg-slate-100 p-5 text-slate-950 md:p-10"><div className="mx-auto max-w-6xl">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-bold uppercase tracking-[.2em] text-emerald-700">IDS Admin</p><h1 className="text-4xl font-black">Accessories &amp; Aftermarket</h1><AdminNav /></div><div className="flex gap-2"><Link href="/equipment/accessories" className="rounded-xl border bg-white px-4 py-2 font-bold">View Public Accessories Page</Link><button type="button" onClick={async () => { await fetch("/api/admin/reviews/login", { method: "DELETE" }); setAuthed(false); }} className="rounded-xl border bg-white px-4 py-2 font-bold">Sign Out</button></div></div>
    {message && <p role="status" className="mt-5 rounded-xl bg-white p-4 font-bold">{message}</p>}
    <form onSubmit={saveSettings} className="mt-7 rounded-3xl bg-white p-6 shadow-sm"><h2 className="text-2xl font-black">Accessory Page Settings</h2><div className="mt-5 grid gap-4 md:grid-cols-2">
      {tabs.map((key) => <fieldset key={key} className="rounded-2xl border p-4"><legend className="font-black capitalize">{key}</legend><label className="flex gap-2 font-bold"><input type="checkbox" checked={settings[`${key}Enabled`]} onChange={(event) => setSetting(`${key}Enabled`, event.target.checked)} />Show publicly</label><label className="mt-3 block font-bold">Tab label<input maxLength={50} value={settings[`${key}Label`]} onChange={(event) => setSetting(`${key}Label`, event.target.value)} className="mt-1 w-full rounded-xl border p-2" /></label>{key === "pandag" && <><label className="mt-3 block font-bold">Empty catalog message<input maxLength={200} value={settings.pandagMessage} onChange={(event) => setSetting("pandagMessage", event.target.value)} className="mt-1 w-full rounded-xl border p-2" /></label></>}</fieldset>)}
    </div><div className="mt-5 rounded-2xl border p-4"><h3 className="font-black">Featured Aftermarket</h3><label className="mt-3 flex gap-2 font-bold"><input type="checkbox" checked={settings.featuredAftermarketEnabled} onChange={(event) => setSetting("featuredAftermarketEnabled", event.target.checked)} />Show feature when Aftermarket is enabled</label><div className="mt-3 grid gap-4 md:grid-cols-2"><label className="font-bold">Image URL<input value={settings.featuredAftermarketImageUrl ?? ""} onChange={(event) => setSetting("featuredAftermarketImageUrl", event.target.value)} className="mt-1 w-full rounded-xl border p-2" /></label><AccessoryImageUploader onUploaded={(url) => setSetting("featuredAftermarketImageUrl", url)} /><label className="font-bold">Image alt<input value={settings.featuredAftermarketImageAlt ?? ""} onChange={(event) => setSetting("featuredAftermarketImageAlt", event.target.value)} className="mt-1 w-full rounded-xl border p-2" /></label><label className="font-bold">Heading<input value={settings.featuredAftermarketHeading ?? ""} onChange={(event) => setSetting("featuredAftermarketHeading", event.target.value)} className="mt-1 w-full rounded-xl border p-2" /></label></div><label className="mt-3 block font-bold">Description<textarea value={settings.featuredAftermarketDescription ?? ""} onChange={(event) => setSetting("featuredAftermarketDescription", event.target.value)} className="mt-1 w-full rounded-xl border p-2" /></label><label className="mt-3 flex gap-2 font-bold"><input type="checkbox" checked={settings.featuredAftermarketIdsExclusive} onChange={(event) => setSetting("featuredAftermarketIdsExclusive", event.target.checked)} />IDS Exclusive</label><label className="mt-3 block font-bold">Aftermarket disclaimer<textarea required maxLength={3000} value={settings.aftermarketDisclaimer} onChange={(event) => setSetting("aftermarketDisclaimer", event.target.value)} className="mt-1 w-full rounded-xl border p-2" /></label></div><button disabled={busy} className="mt-5 rounded-xl bg-emerald-600 px-5 py-3 font-black text-white disabled:opacity-50">Save Page Settings</button></form>
    <section className="mt-7 rounded-3xl bg-white p-6 shadow-sm"><div className="flex flex-wrap justify-between gap-3"><h2 className="text-2xl font-black">Inventory Management</h2><button type="button" onClick={() => setEditing(blank(filter))} className="rounded-xl bg-emerald-600 px-4 py-2 font-black text-white">Add Item</button></div><div className="mt-4 flex gap-2">{tabs.map((tab) => <button key={tab} type="button" onClick={() => setFilter(tab)} className={`rounded-full px-4 py-2 font-bold ${filter === tab ? "bg-slate-950 text-white" : "border"}`}>{tab}</button>)}</div><div className="mt-5 space-y-3">{shown.map((item) => <article key={item.id} className="flex flex-wrap items-center gap-4 rounded-2xl border p-4"><img src={item.imageUrl || "/logo.png"} alt="" onError={(event) => { event.currentTarget.src = "/logo.png"; }} className="h-16 w-20 object-contain" /><div className="min-w-48 flex-1"><h3 className="font-black">{item.name}</h3><p className="text-sm text-slate-500">{item.slug} · order {item.sortOrder} · {ACCESSORY_AVAILABILITY_LABELS[item.publicStatus]} · {item.visible ? "public" : "not listed"} {item.idsExclusive ? "· IDS Exclusive" : ""}</p></div><button type="button" onClick={() => setEditing(fromItem(item))} className="rounded-lg border px-3 py-2 font-bold">Edit</button><label className="font-bold">Availability<select aria-label={`Availability for ${item.name}`} value={item.publicStatus} onChange={(event) => void setAvailability(item, event.target.value as AccessoryAvailabilityStatus)} className="ml-2 rounded-lg border px-3 py-2">{ACCESSORY_AVAILABILITY_STATUSES.map((status) => <option key={status} value={status}>{ACCESSORY_AVAILABILITY_LABELS[status]}</option>)}</select></label></article>)}</div></section>
    {editing && <form onSubmit={saveItem} className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 p-4"><div className="mx-auto max-w-3xl rounded-3xl bg-white p-6"><div className="flex justify-between"><h2 className="text-2xl font-black">{editing.id ? "Edit" : "Add"} {editing.tab} item</h2><button type="button" onClick={() => setEditing(null)} className="font-black">Close</button></div>{editing.id && <p className="mt-2 text-sm text-slate-500">Reference: {data.items.find((item) => item.id === editing.id)?.slug}</p>}<p className="mt-2 text-sm font-bold text-amber-800">Builder accessory prices are authoritative catalog prices used by checkout.</p><div className="mt-5 grid gap-4 md:grid-cols-2">
      {([["name", "Product name"], ["description", "Description"], ["imageUrl", "Image URL"], ["imageAlt", "Image alt"], ["badge", "Category / type"], ["manufacturer", "Manufacturer"], ["regularPrice", "IDS Everyday Price (dollars)"], ["salePrice", "Temporary Sale Price (dollars)"], ["promotionLabel", "Promotion label"], ["priceText", "Custom price text"], ["actionLabel", "Action label"], ["actionUrl", "Action URL"], ["sortOrder", "Display order"]] as const).map(([key, label]) => <label key={key} className="font-bold">{label}<input required={key === "name" || key === "sortOrder"} value={editing[key]} onChange={(event) => edit({ [key]: event.target.value })} className="mt-1 w-full rounded-xl border p-2" /></label>)}
      <AccessoryImageUploader onUploaded={(url) => edit({ imageUrl: url })} />
      <label className="font-bold">Availability<select value={editing.publicStatus} onChange={(event) => edit({ publicStatus: event.target.value as AccessoryAvailabilityStatus, visible: event.target.value === "hidden" ? false : editing.publicStatus === "hidden" ? true : editing.visible })} className="mt-1 w-full rounded-xl border p-2">{ACCESSORY_AVAILABILITY_STATUSES.map((status) => <option key={status} value={status}>{ACCESSORY_AVAILABILITY_LABELS[status]}</option>)}</select></label>
      <label className="font-bold">Action type<select value={editing.actionType} onChange={(event) => edit({ actionType: event.target.value as AccessoryAction })} className="mt-1 w-full rounded-xl border p-2">{(editing.tab === "aftermarket" || editing.tab === "pandag" ? ["contact", "external", "none"] : ["builder", "contact", "external", "none"]).map((action) => <option key={action} value={action}>{action}</option>)}</select></label>
    </div><div className="mt-5 flex flex-wrap gap-5">
      <label className="flex gap-2 font-bold"><input type="checkbox" checked={editing.visible} disabled={editing.publicStatus === "hidden"} onChange={(event) => edit({ visible: event.target.checked })} />Show on accessories page</label>
      {editing.tab === "aftermarket" ? <label className="flex gap-2 font-bold"><input type="checkbox" checked={!editing.showInBuilder} onChange={(event) => edit({ showInBuilder: !event.target.checked })} />Do Not Add to IDS Pricing Catalog / Checkout</label> : editing.tab !== "pandag" && <label className="flex gap-2 font-bold"><input type="checkbox" checked={editing.showInBuilder} onChange={(event) => edit({ showInBuilder: event.target.checked, actionType: event.target.checked ? "builder" : editing.actionType === "builder" ? "none" : editing.actionType })} />Show in Builder</label>}
      {([["showPublicPrice", "Show public price"], ["contactForPricing", "Contact for pricing"], ["isIncluded", "Included with product"], ["isRecommended", "Recommended"], ["idsExclusive", "IDS Exclusive"]] as const).map(([key, label]) => <label key={key} className="flex gap-2 font-bold"><input type="checkbox" checked={editing[key]} onChange={(event) => edit(key === "isIncluded" && event.target.checked ? { isIncluded: true, showInBuilder: false, actionType: "none" } : { [key]: event.target.checked })} />{label}</label>)}
    </div>
    {variants.length > 0 && <fieldset className="mt-5 rounded-2xl border p-4"><legend className="font-black">Variant compatibility</legend><p className="mb-3 text-sm text-slate-600">Choose a relationship only when this item has a known variant-specific rule.</p><div className="grid gap-3 md:grid-cols-2">{variants.map((variant) => <label key={variant.id} className="font-bold">{variant.name}<select value={editing.variantRelationships.find((link) => link.variantId === variant.id)?.relationshipType ?? ""} onChange={(event) => edit({ variantRelationships: [...editing.variantRelationships.filter((link) => link.variantId !== variant.id), ...(event.target.value ? [{ variantId: variant.id, relationshipType: event.target.value as AccessoryVariantRelationship["relationshipType"] }] : [])] })} className="mt-1 w-full rounded-xl border p-2"><option value="">No specific rule</option><option value="compatible">Compatible</option><option value="included">Included</option><option value="required">Required</option><option value="excluded">Excluded</option></select></label>)}</div></fieldset>}
    {packages.length > 0 && <fieldset className="mt-5 rounded-2xl border p-4"><legend className="font-black">Package inclusion</legend><div className="space-y-3">{packages.map((pkg) => { const link = editing.packageRelationships.find((row) => row.packageId === pkg.id); return <div key={pkg.id} className="flex flex-wrap items-center gap-3"><label className="flex gap-2 font-bold"><input type="checkbox" checked={Boolean(link)} onChange={(event) => edit({ packageRelationships: event.target.checked ? [...editing.packageRelationships, { packageId: pkg.id, quantity: 1, includedInPackagePrice: true }] : editing.packageRelationships.filter((row) => row.packageId !== pkg.id) })} />{pkg.name}</label>{link && <><label className="text-sm font-bold">Quantity<input type="number" min={1} max={10} value={link.quantity} onChange={(event) => edit({ packageRelationships: editing.packageRelationships.map((row) => row.packageId === pkg.id ? { ...row, quantity: Number(event.target.value) } : row) })} className="ml-2 w-16 rounded-lg border p-2" /></label><label className="flex gap-2 text-sm font-bold"><input type="checkbox" checked={link.includedInPackagePrice} onChange={(event) => edit({ packageRelationships: editing.packageRelationships.map((row) => row.packageId === pkg.id ? { ...row, includedInPackagePrice: event.target.checked } : row) })} />Included in package price</label></>}</div>; })}</div></fieldset>}
    <button disabled={busy} className="mt-6 rounded-xl bg-emerald-600 px-5 py-3 font-black text-white disabled:opacity-50">Save Item</button></div></form>}
  </div></main>;
}
