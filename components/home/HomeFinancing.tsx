const hearthFinancingUrl =
  "https://app.gethearth.com/requests/930af233-2a7b-4f52-a836-bd11173d6fee";

export default function HomeFinancing() {
  return (
    <section
      id="financing"
      className="relative overflow-hidden border-b border-slate-700 bg-gradient-to-br from-slate-950 via-emerald-950 to-slate-900 px-6 py-12 text-white md:px-10 md:py-24"
    >
      <div className="pointer-events-none absolute inset-0 opacity-20">
        <div className="absolute -left-32 top-0 h-96 w-96 rounded-full bg-emerald-400 blur-3xl" />
        <div className="absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-cyan-400 blur-3xl" />
      </div>
      <div className="relative z-10 mx-auto max-w-7xl">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <div className="mx-auto w-full max-w-2xl">
            <div className="overflow-hidden rounded-[2rem] border border-white/20 bg-slate-900 shadow-2xl">
              <Image src="/images/hearth-financing-background.png" alt="Integrity Distribution Systems financing through Hearth" width={1254} height={1254} className="h-auto w-full object-cover" />
            </div>
          </div>
          <div className="mx-auto w-full max-w-xl text-center lg:text-left">
            <p className="text-sm font-bold uppercase tracking-[0.28em] text-emerald-400">Flexible Financing Available</p>
            <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl md:text-5xl">Explore your financing options through Hearth.</h2>
            <p className="mt-6 text-lg leading-8 text-slate-200">Interested in an autonomous mower but prefer manageable payments? Use our secure Hearth financing link to explore potential options from participating lending partners.</p>
            <div className="mt-7 rounded-2xl border border-white/15 bg-white/10 p-5 text-left backdrop-blur">
              <p className="font-black text-white">Through the Hearth financing portal, you can:</p>
              <div className="mt-4 space-y-3 text-sm leading-6 text-slate-200">
                <p>✓ Explore potential financing options online</p><p>✓ Compare available payment choices</p><p>✓ Submit your information securely</p><p>✓ Continue shopping after checking your options</p>
              </div>
            </div>
            <a href={hearthFinancingUrl} target="_blank" rel="noopener noreferrer" className="mt-8 inline-flex w-full items-center justify-center rounded-2xl bg-emerald-500 px-8 py-5 text-center text-lg font-black text-slate-950 shadow-xl transition hover:scale-[1.02] hover:bg-emerald-400 sm:w-auto">
              Check Financing Options<span aria-hidden="true" className="ml-3 text-xl">↗</span>
            </a>
            <p className="mt-5 text-sm leading-6 text-slate-300">The financing page will open in a new tab so you can return here when finished.</p>
            <p className="mt-5 text-xs leading-5 text-slate-400">Financing is provided through participating third-party lenders. Approval, rates, terms, fees, and availability are determined by the applicable lender.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
import Image from "next/image";
