import Link from "next/link";

import CatalogHeader from "@/components/equipment/CatalogHeader";

export default function PandagProjectQuoteReceivedPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <CatalogHeader salesMode="quote_only" />
      <main className="px-5 py-20 sm:px-8">
        <section className="mx-auto max-w-3xl rounded-[2rem] border border-emerald-200 bg-white p-8 text-center shadow-xl sm:p-12">
          <p className="text-sm font-black uppercase tracking-[0.22em] text-emerald-700">Request Received</p>
          <h1 className="mt-4 text-4xl font-black tracking-tight">Your Pandag project request was received.</h1>
          <p className="mt-6 text-lg leading-8 text-slate-600">
            Integrity Distribution Systems will review the property, mowing conditions, charging strategy, access requirements, and operating goals. A final model recommendation and project pricing will follow that review.
          </p>
          <Link href="/equipment/pandag-g1" className="mt-8 inline-flex rounded-2xl bg-emerald-600 px-7 py-4 font-black text-white hover:bg-emerald-700">
            Return to Pandag G1
          </Link>
        </section>
      </main>
    </div>
  );
}
