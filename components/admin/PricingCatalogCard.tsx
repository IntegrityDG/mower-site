import type { PricingItem } from "@/lib/admin-pricing/types";

export const pricingMoney = (cents: number | null | undefined) => cents == null ? "Not set" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

export default function PricingCatalogCard({ item, onEdit, onDelete, onAvailability, availabilitySaving = false, compatibility, heading }: {
  item: PricingItem;
  onEdit: () => void;
  onDelete?: () => void;
  onAvailability?: (status: "active" | "unavailable" | "hidden") => void;
  availabilitySaving?: boolean;
  compatibility?: string;
  heading?: string;
}) {
  const prefix = item.kind === "product-services" ? "override_" : "";
  const price = (field: string) => typeof item.values[`${prefix}${field}`] === "number" ? item.values[`${prefix}${field}`] as number : null;
  const availabilityLabel = item.isAvailable ? item.availabilityStatus === "coming_soon" ? "Pre-order available" : "Available" : item.availabilityStatus === "active" ? "Unavailable" : item.availabilityStatus.replaceAll("_", " ");
  return <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1"><p className="text-xs font-black uppercase tracking-[.16em] text-emerald-700">{heading ?? item.category}</p><h3 className="mt-1 break-words text-xl font-black">{item.name}</h3><p className="mt-1 break-words text-xs text-slate-500">{[item.slug, item.sku, item.brand, item.productName].filter(Boolean).join(" · ")}</p>{compatibility && <p className="mt-2 text-xs font-bold text-emerald-800">{compatibility}</p>}{item.targetLabel && <p className="mt-1 text-sm font-bold">Target: {item.targetLabel}</p>}</div>
      <div className="flex flex-wrap gap-2"><button type="button" onClick={onEdit} className="min-h-11 rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white">Edit</button>{onDelete && <button type="button" onClick={onDelete} className="min-h-11 rounded-xl border border-red-200 px-3 py-2 text-sm font-bold text-red-700">Delete</button>}</div>
    </div>
    <div className="mt-4 rounded-2xl bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-500">Current customer price</p><p className="mt-1 text-2xl font-black">{pricingMoney(item.effectivePriceCents)}</p><dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs font-black uppercase text-slate-500">Price source</dt><dd className="mt-1 font-bold">{item.effectiveSourceLabel ?? item.storedAtLabel ?? item.category}</dd></div><div><dt className="text-xs font-black uppercase text-slate-500">Sale state</dt><dd className="mt-1 font-bold">{item.saleState === "active" ? "ACTIVE" : (item.saleState ?? "none").replaceAll("_", " ")}</dd></div></dl><p className="mt-3 text-xs leading-5 text-slate-600">{item.effectiveExplanation}</p></div>
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 p-3"><span className="mr-auto text-xs font-black uppercase">Availability</span><span className={`rounded-full px-3 py-1 text-xs font-black uppercase ${item.isAvailable ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-950"}`}>{availabilitySaving ? "SAVING…" : availabilityLabel}</span>{onAvailability && <div className="flex gap-2">{(["active", "unavailable", ...(item.availabilityField === "public_status" ? ["hidden"] : [])] as ("active" | "unavailable" | "hidden")[]).map(status => <button key={status} type="button" disabled={availabilitySaving} aria-pressed={item.availabilityStatus === status} onClick={() => onAvailability(status)} className={`min-h-10 rounded-lg border px-3 text-xs font-black ${item.availabilityStatus === status ? "bg-slate-950 text-white" : "bg-white"} disabled:opacity-60`}>{status === "active" ? "ON" : status === "unavailable" ? "OFF" : "HIDDEN"}</button>)}</div>}</div>
    {item.kind !== "schedules" && <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-slate-200 pt-4 text-sm"><div><dt className="text-xs font-bold text-slate-500">Manufacturer / MSRP</dt><dd className="mt-1 font-black">{pricingMoney(price("display_msrp_price_cents"))}</dd></div><div><dt className="text-xs font-bold text-slate-500">IDS Everyday Price</dt><dd className="mt-1 font-black">{pricingMoney(price("regular_price_cents"))}</dd></div><div className="col-span-2"><dt className="text-xs font-bold text-slate-500">Temporary Sale Price</dt><dd className="mt-1 font-black">{pricingMoney(price("sale_price_cents"))}</dd></div><div className="col-span-2 rounded-xl bg-slate-950 p-3 text-white"><dt className="text-xs font-black">Dealer Cost — PRIVATE / IDS INTERNAL ONLY</dt><dd className="mt-1 font-black">{pricingMoney(item.dealerCostCents)}</dd></div></dl>}
  </article>;
}
