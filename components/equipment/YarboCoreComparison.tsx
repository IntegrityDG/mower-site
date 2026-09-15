import type { CatalogProduct, CatalogVariant } from "@/lib/catalog/types";
import { YARBO_Y40_SLUG, YARBO_Y40P_SLUG, yarboCorePrice, yarboCoreVariants } from "@/lib/catalog/yarbo-core";
import YarboCorePrice from "./YarboCorePrice";
import CoreAvailabilityBadge from "./CoreAvailabilityBadge";
import PreorderNotice from "./PreorderNotice";

const comparisonOrder = [
  "yarbo_drive_system", "yarbo_max_drive_speed", "yarbo_mowing_per_charge",
  "yarbo_daily_mowing", "yarbo_weekly_coverage", "yarbo_snow_per_charge",
  "yarbo_efficiency", "yarbo_max_climb", "yarbo_operating_noise",
];

function specifications(core: CatalogVariant) {
  return Object.values(core.specifications ?? {}).flat();
}

export default function YarboCoreComparison({ product }: { product: CatalogProduct }) {
  const cores = yarboCoreVariants(product);
  const y40 = cores.find((core) => core.slug === YARBO_Y40_SLUG);
  const y40p = cores.find((core) => core.slug === YARBO_Y40P_SLUG);
  if (!y40 || !y40p) return null;
  const y40Specs = specifications(y40);
  const y40pSpecs = specifications(y40p);

  return <section className="mt-14 rounded-[2rem] border border-emerald-200 bg-white p-5 shadow-sm sm:p-8" aria-labelledby="yarbo-core-comparison">
    <p className="text-sm font-black uppercase tracking-[0.2em] text-emerald-700">Yarbo Y-Series</p>
    <h2 id="yarbo-core-comparison" className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Choose your Core: Y40 or Y40P</h2>
    <p className="mt-4 max-w-4xl leading-7 text-slate-700">Y40 is the proven Y-Series Core. Y40P is the premium next-generation Core, with a gearbox-free dual hub motor drivetrain designed for faster movement and more work per charge. Both use the modular all-season Yarbo system.</p>
    <div className="mt-7 grid gap-4 sm:grid-cols-2">
      {cores.map((core) => <article key={core.id} className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="text-2xl font-black">{core.name}</h3><CoreAvailabilityBadge core={core} /></div>
        <p className="mt-2 text-sm leading-6 text-slate-600">{core.description}</p>
        <div className="mt-4"><YarboCorePrice core={core} price={yarboCorePrice(product, core)} /></div>
        <PreorderNotice core={core} />
      </article>)}
    </div>
    <div className="mt-7 space-y-3" role="table" aria-label="Y40 versus Y40P specifications">
      <div className="hidden rounded-xl bg-slate-950 px-4 py-3 font-black text-white sm:grid sm:grid-cols-3" role="row"><span role="columnheader">Specification</span><span role="columnheader">Y40</span><span role="columnheader">Y40P</span></div>
      {comparisonOrder.map((slug) => {
        const base = y40Specs.find((spec) => spec.slug === slug);
        const premium = y40pSpecs.find((spec) => spec.slug === slug);
        if (!base || !premium) return null;
        return <div key={slug} className="grid min-w-0 gap-2 rounded-xl border border-slate-200 p-4 sm:grid-cols-3" role="row">
          <strong role="rowheader">{base.label}</strong>
          <span role="cell"><span className="font-bold sm:hidden">Y40: </span>{base.displayValue ?? base.textValue}</span>
          <span role="cell"><span className="font-bold sm:hidden">Y40P: </span>{premium.displayValue ?? premium.textValue}</span>
        </div>;
      })}
    </div>
  </section>;
}
