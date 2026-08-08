import {
  SALES_SPECIALS_CARTOONS,
  type SalesSpecialsConfig,
} from "@/lib/promotions/config";
import Link from "next/link";

export function SalesSpecialsBanner({
  promotion,
  headlineClassName = "",
}: {
  promotion: SalesSpecialsConfig | null;
  headlineClassName?: string;
}) {
  if (!promotion?.enabled || !promotion.headline.trim() || !promotion.description.trim()) return null;
  const cartoon = SALES_SPECIALS_CARTOONS[promotion.cartoonKey];
  const showsAllMachines = promotion.cartoonKey === "all";

  return (
    <section aria-labelledby="sales-specials-heading" className="bg-slate-100 px-6 py-16 md:px-10 md:py-20">
      <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] border border-emerald-500/30 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 px-7 py-10 text-white shadow-2xl shadow-slate-900/15 sm:px-10 md:py-14">
        <div aria-hidden="true" className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-400/15 blur-3xl" />
        <div className={`relative grid items-center gap-9 ${cartoon ? showsAllMachines ? "lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-12" : "md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] md:gap-12" : ""}`}>
          {cartoon && (
            <div className="flex justify-center">
              {/* Local, server-allowlisted transparent product artwork. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cartoon.src} alt={cartoon.alt} className={`h-auto w-full object-contain drop-shadow-2xl ${showsAllMachines ? "max-h-80 max-w-2xl" : "max-h-72 max-w-lg"}`} />
            </div>
          )}
          <div className={cartoon ? "text-center md:text-left" : "mx-auto max-w-5xl text-center"}>
            <p className="text-sm font-black uppercase tracking-[0.28em] text-emerald-400">Sales &amp; Specials</p>
            <h2 id="sales-specials-heading" className={`${headlineClassName} mt-4 text-4xl font-bold uppercase leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl`}>
              {promotion.headline}
            </h2>
            <p className={`mt-6 text-lg leading-8 text-slate-200 sm:text-xl ${cartoon ? "" : "mx-auto max-w-3xl"}`}>
              {promotion.description}
            </p>
            <div className={`mt-7 border-t border-white/15 pt-6 ${cartoon ? "" : "mx-auto max-w-3xl"}`}>
              <h3 className="text-lg font-black tracking-tight text-white sm:text-xl">
                HELP A FRIEND. HELP YOURSELF. GET PAID.
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-300 sm:text-base">
                Refer friends, family, or neighbors to Integrity Distribution Systems and make yourself some money with the IDS Referral Program!
              </p>
              <Link href="/referral-program" className="mt-4 inline-flex rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-emerald-400">
                Explore Our Referral Program →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
