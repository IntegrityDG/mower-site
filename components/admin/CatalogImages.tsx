"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { ManagedCatalog, ManagedCatalogItem, ManagedPackage } from "@/lib/catalog-management/types";
import { catalogImageUpdate } from "@/lib/catalog-management/image-update";
import { safeCatalogImageUrl } from "@/lib/catalog/card-image";
import AdminPricingDialog from "./AdminPricingDialog";
import AccessoryImageUploader from "./AccessoryImageUploader";

type Item = ManagedCatalogItem | ManagedPackage;
function ImageEditor({ item, onSaved, onBusyChange }: { item: Item; onSaved: () => Promise<void>; onBusyChange: (busy: boolean) => void }) {
  const [url, setUrl] = useState(item.imageUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const image = safeCatalogImageUrl(url);
  useEffect(() => { onBusyChange(saving || uploading); return () => onBusyChange(false); }, [saving, uploading, onBusyChange]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving || uploading) return;
    setError(""); setMessage("");
    if (url.trim() && !image) { setError("Use a site image path or HTTPS image URL without credentials."); return; }
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/catalog-management/${item.kind}/${item.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(catalogImageUpdate(item, url)) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "The image could not be saved. Close and reload the image manager before retrying.");
      await onSaved();
      setMessage("Image saved on this existing entry. Public cards use it the next time they load.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "The image could not be saved."); }
    finally { setSaving(false); }
  }
  return <form onSubmit={save} className="mt-5 space-y-4 rounded-2xl border p-4">
    <h3 className="font-black">{item.name}</h3><p className="text-sm text-slate-600">{item.brand} · {item.kind} · {item.slug}</p>
    <p className="text-sm text-slate-600">Replace the photo here without creating a new catalog entry. Prices, availability, components, and existing orders stay unchanged. Use an image that accurately represents every configuration of this entry. A shared Y40/Y40P package needs a photo suitable for both Core choices.</p>
    <label className="block text-sm font-bold">Product or package image URL<input value={url} disabled={saving || uploading} onChange={e => { setUrl(e.target.value); setMessage(""); }} maxLength={2000} className="mt-2 w-full rounded-xl border p-3" placeholder="/images/product.webp or https://…"/></label>
    <AccessoryImageUploader onUploaded={setUrl} onBusyChange={setUploading} disabled={saving}/>
    {image && <div className="rounded-xl border bg-slate-50 p-3"><p className="mb-2 text-xs font-bold">Selected image preview</p>{/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image} alt={item.name} className="h-48 w-full object-contain" referrerPolicy="no-referrer"/></div>}
    <p className="text-xs text-slate-600">Only upload photos IDS may use. Removing a saved photo restores an existing exact-item fallback where one exists; otherwise the card shows that a photo is unavailable. Image display can be suppressed on promotional cards.</p>
    <div className="flex flex-wrap gap-3"><button disabled={saving || uploading} className="min-h-12 rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white disabled:opacity-50">{saving ? "Saving…" : "Save image"}</button><button type="button" disabled={saving || uploading} onClick={() => { setUrl(""); setMessage(""); }} className="rounded-xl border px-4 py-3 font-bold">Remove saved image</button><button type="button" disabled={saving || uploading} onClick={() => { setUrl(item.imageUrl ?? ""); setError(""); setMessage(""); }} className="rounded-xl border px-4 py-3 font-bold">Reset changes</button></div>
    {error && <p role="alert" className="text-sm font-bold text-red-800">{error}</p>}{message && <p role="status" className="text-sm font-bold text-emerald-800">{message}</p>}
  </form>;
}
export default function CatalogImages({ onClose, onSaved }: { onClose: () => void; onSaved: (message: string) => Promise<void> }) {
  const [catalog, setCatalog] = useState<ManagedCatalog | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function reload() {
    const response = await fetch("/api/admin/catalog-management", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Catalog images could not be loaded.");
    setCatalog(payload);
  }
  useEffect(() => { const controller = new AbortController(); void fetch("/api/admin/catalog-management", { cache: "no-store", signal: controller.signal }).then(async response => { const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? "Catalog images could not be loaded."); setCatalog(payload); }).catch(e => { if (!controller.signal.aborted) setError(e.message); }); return () => controller.abort(); }, []);
  const items = catalog ? [...catalog.items, ...catalog.packages] : [];
  const item = items.find(row => `${row.kind}:${row.id}` === selected);
  const filtered = items.filter(row => `${row.name} ${row.slug} ${row.brand} ${row.kind}`.toLowerCase().includes(search.toLowerCase()));
  return <AdminPricingDialog title="Manage catalog images" onClose={onClose} busy={busy} wide>
    <p className="text-sm text-slate-600">One saved photo per existing product, physical Core, model, accessory, or package. Matching public cards share it. This edits images only.</p>
    {error && <p role="alert" className="mt-4 text-red-800">{error}</p>}
    {!catalog ? <p role="status" className="mt-4">Loading catalog images…</p> : <><label className="mt-4 block text-sm font-bold">Find an entry<input disabled={busy} value={search} onChange={e => setSearch(e.target.value)} className="mt-2 w-full rounded-xl border p-3" placeholder="Search name, model, brand, or slug"/></label><label className="mt-4 block text-sm font-bold">Catalog entry<select disabled={busy} value={selected} onChange={e => setSelected(e.target.value)} className="mt-2 w-full rounded-xl border bg-white p-3"><option value="">Choose an existing entry</option>{item && !filtered.includes(item) && <option value={selected}>{item.name} · {item.kind}</option>}{filtered.map(row => <option key={`${row.kind}:${row.id}`} value={`${row.kind}:${row.id}`}>{row.brand} · {row.name} · {row.kind}</option>)}</select></label>{item && <ImageEditor key={`${selected}:${item.updatedAt}`} item={item} onBusyChange={setBusy} onSaved={async () => { await reload(); await onSaved(`Saved image for ${item.name}.`); }}/>}</>}
  </AdminPricingDialog>;
}
