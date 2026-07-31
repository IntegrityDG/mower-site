import Link from "next/link";

export default function QuoteOnlyNotice({ className = "" }: { className?: string }) {
  return (
    <aside
      className={`${className} rounded-3xl border border-emerald-300 bg-emerald-950/80 p-6 shadow-lg`}
      aria-labelledby="quote-only-heading"
    >
      <h2 id="quote-only-heading" className="text-2xl font-black text-white">
        Pricing &amp; Project Review
      </h2>
      <p className="mt-3 leading-7 text-emerald-50">
        Contact us to find out the IDS LOW Everyday Price. Pandag G1 requires IDS
        project review and is not available for online purchase or payment.
      </p>
      <Link
        href="/pandag/project-quote"
        className="mt-5 inline-flex rounded-2xl bg-emerald-400 px-6 py-3 text-center font-black text-slate-950 hover:bg-emerald-300"
      >
        Request Pricing &amp; Information
      </Link>
    </aside>
  );
}
