import Link from "next/link";
import { SALES_SPECIALS_CARTOONS, type SalesSpecialsConfig } from "@/lib/promotions/config";

function SalesSpecialsCard({ promotion, headingId, compact, headlineClassName }: { promotion: SalesSpecialsConfig; headingId: string; compact: boolean; headlineClassName: string }) {
  const cartoon = SALES_SPECIALS_CARTOONS[promotion.cartoonKey];
  const showsAllMachines = promotion.cartoonKey === "all";
  const layout = compact ? "grid items-center gap-8" : `grid items-center gap-9 ${cartoon ? showsAllMachines ? "lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-12" : "md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] md:gap-12" : ""}`;
  return <article aria-labelledby={headingId} className="relative h-full overflow-hidden rounded-[2rem] border border-emerald-500/30 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 px-7 py-10 text-white shadow-2xl shadow-slate-900/15 sm:px-10 md:py-14">
    <div aria-hidden="true" className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-400/15 blur-3xl" />
    <div className={`relative ${layout}`}>
      {cartoon && <div className="flex justify-center">
        {/* Local, server-allowlisted transparent product artwork. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cartoon.src} alt={cartoon.alt} className={`h-auto w-full object-contain drop-shadow-2xl ${showsAllMachines ? "max-h-80 max-w-2xl" : "max-h-72 max-w-lg"}`} />
      </div>}
      <div className={compact ? "text-center" : cartoon ? "text-center md:text-left" : "mx-auto max-w-5xl text-center"}>
        <p className="text-sm font-black uppercase tracking-[0.28em] text-emerald-400">Sales &amp; Specials</p>
        <h2 id={headingId} className={`${headlineClassName} mt-4 font-bold uppercase leading-[1.05] tracking-tight ${compact ? "text-3xl sm:text-4xl" : "text-4xl sm:text-5xl lg:text-6xl"}`}>{promotion.headline}</h2>
        <p className={`mt-6 text-lg leading-8 text-slate-200 sm:text-xl ${!compact && !cartoon ? "mx-auto max-w-3xl" : ""}`}>{promotion.description}</p>
        <div className={`mt-7 border-t border-white/15 pt-6 ${!compact && !cartoon ? "mx-auto max-w-3xl" : ""}`}><h3 className="text-lg font-black tracking-tight text-white sm:text-xl">HELP A FRIEND. HELP YOURSELF. GET PAID.</h3><p className="mt-2 text-sm leading-6 text-slate-300 sm:text-base">Refer friends, family, or neighbors to Integrity Distribution Systems and make yourself some money with the IDS Referral Program!</p><Link href="/referral-program" className="mt-4 inline-flex rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-emerald-400">Explore Our Referral Program →</Link></div>
      </div>
    </div>
  </article>;
}

export function SalesSpecialsBanner({ promotions, headlineClassName = "" }: { promotions: SalesSpecialsConfig[]; headlineClassName?: string }) {
  const visible = promotions.filter((promotion) => promotion.enabled && promotion.headline.trim() && promotion.description.trim()).slice(0, 2);
  if (visible.length === 0) return null;
  const compact = visible.length === 2;
  return <section aria-label="Sales & Specials" className="bg-slate-100 px-6 py-16 md:px-10 md:py-20"><div className={`mx-auto grid max-w-7xl gap-7 ${compact ? "lg:grid-cols-2" : "grid-cols-1"}`}>{visible.map((promotion, index) => <SalesSpecialsCard key={index} promotion={promotion} headingId={`sales-specials-heading-${index === 0 ? "primary" : "secondary"}`} compact={compact} headlineClassName={headlineClassName} />)}</div></section>;
}
