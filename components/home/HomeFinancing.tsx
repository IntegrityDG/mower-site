import Image from "next/image";

const hearthFinancingUrl =
  "https://app.gethearth.com/requests/930af233-2a7b-4f52-a836-bd11173d6fee";

export default function HomeFinancing() {
  return (
    <section
      id="financing"
      className="relative overflow-hidden border-b border-slate-700 bg-gradient-to-br from-slate-950 via-emerald-950 to-slate-900 px-0 py-10 text-white sm:px-6 md:px-10 md:py-20"
    >
      <div className="pointer-events-none absolute inset-0 opacity-20">
        <div className="absolute -left-32 top-0 h-96 w-96 rounded-full bg-emerald-400 blur-3xl" />
        <div className="absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-cyan-400 blur-3xl" />
      </div>
      <div className="relative z-10 mx-auto max-w-7xl">
        <a href="/images/site/hearth-financing.webp" target="_blank" rel="noopener noreferrer" aria-label="View the Hearth financing poster at full size" className="block overflow-hidden border-y border-white/20 bg-slate-950 shadow-2xl sm:rounded-[2rem] sm:border">
          <Image src="/images/site/hearth-financing.webp" alt="Integrity Distribution Systems flexible financing through Hearth" width={1536} height={1024} sizes="(min-width: 1280px) 80rem, 100vw" loading="eager" className="h-auto w-full object-contain" />
        </a>
        <div className="mx-auto mt-8 max-w-4xl px-4 text-center sm:px-0">
          <p className="mb-5 text-xs font-bold uppercase tracking-[0.12em] text-emerald-300 sm:hidden">Tap the financing image to view it full size</p>
          <a href={hearthFinancingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-14 w-full items-center justify-center rounded-2xl bg-emerald-400 px-8 py-4 text-center text-lg font-black text-slate-950 shadow-xl transition hover:bg-emerald-300 sm:w-auto">
            Check Financing Options<span aria-hidden="true" className="ml-3 text-xl">↗</span>
          </a>
          <p className="mt-5 text-sm leading-6 text-slate-200">The secure Hearth financing page opens in a new tab. For personal assistance, contact <strong>Hearth Concierge Service</strong> at <a href="tel:+15126075977" className="font-black text-white underline decoration-emerald-400 underline-offset-4">(512) 607-5977</a>.</p>
          <p className="mt-4 text-xs leading-5 text-slate-400">Financing is provided through participating third-party lenders. Approval, rates, terms, fees, and availability are determined by the applicable lender. Integrity Distribution Systems is not a lender and does not determine financing terms.</p>
        </div>
      </div>
    </section>
  );
}
