"use client";

type Props = {
  draft: Record<string, unknown>;
  onChange: (field: string, value: string | boolean) => void;
};

export default function Y40PackageRelationshipFields({ draft, onChange }: Props) {
  return <fieldset className="grid gap-4 rounded-2xl border border-slate-300 p-4 sm:col-span-2 sm:grid-cols-2">
    <legend className="px-2 font-black">Y40 package/Core relationship</legend>
    <p className="text-sm font-normal text-slate-600 sm:col-span-2">Y40 prices remain on the package. These controls gate this Y40 relationship; package visibility and required dependencies also apply.</p>
    <label className="font-bold">Availability
      <select value={String(draft.public_status ?? "hidden")} onChange={event => onChange("public_status", event.target.value)} className="mt-2 w-full rounded-xl border bg-white p-3">
        {["active", "unavailable", "coming_soon", "hidden"].map(value => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}
      </select>
    </label>
    <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={draft.core_show_public_price === true} onChange={event => onChange("core_show_public_price", event.target.checked)} />Show Public Price</label>
    <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={draft.core_contact_for_pricing === true} onChange={event => onChange("core_contact_for_pricing", event.target.checked)} />Contact for Pricing</label>
  </fieldset>;
}
