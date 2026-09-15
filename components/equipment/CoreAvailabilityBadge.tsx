import type { CatalogVariant } from "@/lib/catalog/types";
import { yarboCoreStatus } from "./YarboCorePrice";

export default function CoreAvailabilityBadge({ core }: { core: CatalogVariant }) {
  const tone = core.purchaseState === "preorder" ? "bg-violet-100 text-violet-950" :
    core.publicStatus === "coming_soon" ? "bg-amber-100 text-amber-950" :
    core.isAvailable ? "bg-emerald-100 text-emerald-900" : "bg-slate-200 text-slate-800";
  return <span className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-black uppercase ${tone}`}>{yarboCoreStatus(core)}</span>;
}
