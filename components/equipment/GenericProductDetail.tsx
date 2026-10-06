import Image from "next/image";
import Link from "next/link";
import { managedProductStartingPrice } from "@/lib/catalog/starting-price";
import { packageComponentKey, packageComponentName } from "@/lib/catalog/package-components";
import { priceLabel } from "@/lib/catalog/pricing";
import { isQuoteOnlyProduct } from "@/lib/catalog/sales-mode";
import type { CatalogProduct } from "@/lib/catalog/types";
import CatalogHeader from "./CatalogHeader";
import ProductPageSections from "./ProductPageSections";
import QuoteOnlyNotice from "./QuoteOnlyNotice";

export default function GenericProductDetail({ product }: { product: CatalogProduct }) {
  const quoteOnly = isQuoteOnlyProduct(product);
  const buildHref = `/?product=${encodeURIComponent(product.slug)}#location-and-customer-path`;
  return <div className="min-h-screen bg-slate-50 text-slate-950">
    <CatalogHeader salesMode={product.salesMode} productSlug={product.slug} quoteHref="/contact" isAvailable={product.isAvailable}/>
    <main>
      <section className="bg-gradient-to-br from-slate-950 to-emerald-950 px-5 py-14 text-white sm:px-8">
        <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-2">
          <div><Link href="/equipment" className="text-sm font-bold text-emerald-300">Back to equipment catalog</Link>
            <p className="mt-8 text-sm font-black uppercase tracking-[0.22em] text-emerald-400">{product.brand}</p>
            <h1 className="mt-3 break-words text-4xl font-black tracking-tight sm:text-6xl">{product.name}</h1>
            {!product.isAvailable && <p className="mt-4 w-fit rounded-full bg-amber-100 px-4 py-2 font-black text-amber-950">Unavailable</p>}
            {(product.page?.heroSubheading ?? product.fullDescription ?? product.homepageSummary) && <p className="mt-6 whitespace-pre-line text-lg leading-8 text-slate-200">{product.page?.heroSubheading ?? product.fullDescription ?? product.homepageSummary}</p>}
            {quoteOnly ? <QuoteOnlyNotice className="mt-7" productName={product.name} requestHref="/contact" isAvailable={product.isAvailable}/> : product.isAvailable ? <>
              <p className="mt-7 text-xs font-bold uppercase tracking-[0.16em] text-emerald-300">{product.hasManagedPackages ? "Starting at" : "Price"}</p>
              <p className="mt-2 text-3xl font-black">{priceLabel(managedProductStartingPrice(product) ?? product)}</p>
              <Link href={buildHref} className="mt-7 inline-flex rounded-2xl bg-emerald-500 px-7 py-4 font-black text-slate-950">Build Your System</Link>
            </> : null}
          </div>
          <div className="relative min-h-80 overflow-hidden rounded-[2rem] bg-white/95">
            <Image src={product.imageUrl} alt={product.imageAlt} fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-contain p-8" unoptimized={/^https?:\/\//i.test(product.imageUrl)}/>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
        {product.customerGuidance && <p className="rounded-2xl border bg-white p-6 leading-7 text-slate-600">{product.customerGuidance}</p>}
        <ProductPageSections sections={product.page?.sections ?? []}/>
        {product.packages.length > 0 && <section aria-labelledby="catalog-packages-title"><h2 id="catalog-packages-title" className="text-3xl font-black">Available packages</h2><div className="mt-5 grid gap-5 md:grid-cols-2">
          {product.packages.map(pkg => <article key={pkg.id} className="min-w-0 rounded-3xl border border-slate-200 bg-white p-6"><h3 className="break-words text-2xl font-black">{pkg.name}</h3>{pkg.description && <p className="mt-3 leading-7 text-slate-600">{pkg.description}</p>}<ul className="mt-4 space-y-2 text-sm font-semibold">{pkg.items.map(item => <li key={packageComponentKey(item)}>{item.quantity} × {packageComponentName(item)}</li>)}</ul>{!pkg.isAvailable ? <p className="mt-4 font-black text-amber-800">Unavailable</p> : !quoteOnly ? <p className="mt-4 text-xl font-black text-emerald-800">{priceLabel(pkg)}</p> : null}</article>)}
        </div></section>}
      </section>
    </main>
  </div>;
}
