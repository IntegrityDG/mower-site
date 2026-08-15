import Link from "next/link";
import type { CatalogSalesMode } from "@/lib/catalog/types";

export default function CatalogHeader({
  salesMode = "self_service",
  productSlug,
  isAvailable = true,
}: {
  salesMode?: CatalogSalesMode;
  productSlug?: string;
  isAvailable?: boolean;
}) {
  const quoteOnly = salesMode === "quote_only";
  const buildHref = productSlug
    ? `/?product=${encodeURIComponent(productSlug)}#location-and-customer-path`
    : "/#location-and-customer-path";
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:gap-5 sm:px-8">
        <Link href="/" className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Integrity Distribution Systems" className="h-10 w-auto sm:h-12" />
          <span className="hidden text-sm font-black uppercase tracking-[0.16em] text-slate-950 sm:block">
            Integrity Distribution Systems
          </span>
        </Link>
        <nav className="flex min-w-0 items-center gap-2 text-sm font-bold sm:gap-4">
          <Link href="/equipment" className="hidden text-emerald-700 hover:text-emerald-600 sm:inline">Equipment</Link>
          {isAvailable ? <Link href={quoteOnly ? "/pandag/project-quote" : buildHref} className="whitespace-nowrap rounded-xl bg-slate-950 px-3 py-3 text-xs text-white hover:bg-emerald-700 sm:px-4 sm:text-sm">
              {quoteOnly ? "Request Pricing & Information" : "Build Your System"}
            </Link> : <span className="whitespace-nowrap rounded-xl bg-amber-100 px-3 py-3 text-xs font-black text-amber-950 sm:px-4 sm:text-sm">Unavailable</span>}
        </nav>
      </div>
    </header>
  );
}
