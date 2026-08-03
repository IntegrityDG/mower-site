import Link from "next/link";
import type { CatalogSalesMode } from "@/lib/catalog/types";

export default function CatalogHeader({
  salesMode = "self_service",
  productSlug,
}: {
  salesMode?: CatalogSalesMode;
  productSlug?: string;
}) {
  const quoteOnly = salesMode === "quote_only";
  const buildHref = productSlug
    ? `/?product=${encodeURIComponent(productSlug)}#location-and-customer-path`
    : "/#location-and-customer-path";
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-5 py-4 sm:px-8">
        <Link href="/" className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Integrity Distribution Systems" className="h-12 w-auto" />
          <span className="hidden text-sm font-black uppercase tracking-[0.16em] text-slate-950 sm:block">
            Integrity Distribution Systems
          </span>
        </Link>
        <nav className="flex items-center gap-4 text-sm font-bold">
          <Link href="/equipment" className="text-emerald-700 hover:text-emerald-600">Equipment</Link>
          <Link href={quoteOnly ? "/pandag/project-quote" : buildHref} className="rounded-xl bg-slate-950 px-4 py-3 text-white hover:bg-emerald-700">
            {quoteOnly ? "Request Pricing & Information" : "Build Your System"}
          </Link>
        </nav>
      </div>
    </header>
  );
}
