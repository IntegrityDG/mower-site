import type { CatalogPackageItem } from "@/lib/catalog/types";
import { yarboIncludedEquipment } from "@/lib/catalog/yarbo";

/** Descriptive included equipment; deliberately no price or selection controls. */
export default function YarboCoreInclusions({ items = [] }: { items?: readonly CatalogPackageItem[] }) {
  return <section className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
    <h4 className="text-sm font-black uppercase tracking-wide text-emerald-800">Included with your Yarbo Core</h4>
    <ul className="mt-3 space-y-1 text-sm font-semibold text-slate-700">
      {yarboIncludedEquipment(items).map((name, index) => <li key={`${index}-${name}`}>{name}</li>)}
    </ul>
    <p className="mt-3 text-sm text-slate-700">The Data Center and Pro antennas are included at no additional charge.</p>
  </section>;
}
