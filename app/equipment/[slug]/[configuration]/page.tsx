import { cache } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadPublicCatalog } from "@/lib/catalog/load-public-catalog";
import { isLymowConfiguration, LYMOW_VARIANT_PAGES, lymowVariantPage, lymowVariantPath, type LymowConfiguration } from "@/lib/catalog/lymow-variant-pages";
import CatalogHeader from "@/components/equipment/CatalogHeader";
import LymowPriceDisplay from "@/components/equipment/LymowPriceDisplay";
import { lymowConfigurationFacts, lymowImages, lymowIncludedEquipment, lymowPerformanceDisclaimer } from "@/components/equipment/lymowBrochureContent";
import NationwidePurchaseFlow from "@/components/customer-paths/purchase/NationwidePurchaseFlow";
import BreadcrumbJsonLd, { EQUIPMENT_BREADCRUMB, HOME_BREADCRUMB } from "@/components/seo/BreadcrumbJsonLd";
import LymowVariantJsonLd from "@/components/seo/LymowVariantJsonLd";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string; configuration: string }> };

// One request snapshot for metadata, visible price, JSON-LD and initial builder.
const loadPage = cache(async (slug: string, configuration: string) => {
  if (slug !== "lymow-one-plus" || !isLymowConfiguration(configuration)) notFound();
  const catalog = await loadPublicCatalog();
  const product = catalog.products.find((item) => item.slug === slug);
  const page = product ? lymowVariantPage(product, configuration) : null;
  if (!page) notFound();
  return { page, catalog };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, configuration } = await params;
  const { page } = await loadPage(slug, configuration);
  return {
    title: `${page.name} | Price & Purchase | IDS`,
    description: page.description,
    alternates: { canonical: page.url },
    openGraph: { title: page.name, description: page.description, url: page.url, images: [lymowImages.hero.src] },
  };
}

export default async function LymowConfigurationPage({ params }: Props) {
  const { slug, configuration } = await params;
  const { page, catalog } = await loadPage(slug, configuration);
  const facts = lymowConfigurationFacts[page.variant.slug as keyof typeof lymowConfigurationFacts];
  return <>
    <LymowVariantJsonLd page={page} />
    <BreadcrumbJsonLd items={[HOME_BREADCRUMB, EQUIPMENT_BREADCRUMB, { name: "Lymow One Plus", path: "/equipment/lymow-one-plus" }, { name: `${LYMOW_VARIANT_PAGES[page.configuration].label} Configuration`, path: page.path }]} />
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <CatalogHeader productSlug="lymow-one-plus" isAvailable={page.canPurchase} buildHref="#purchase-configuration" />
      <main>
        <section className="bg-gradient-to-br from-slate-950 to-emerald-950 px-5 py-14 text-white sm:px-8">
          <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-2">
            <div>
              <Link href="/equipment/lymow-one-plus" className="font-bold text-emerald-300">Compare Lymow One Plus configurations</Link>
              <h1 className="mt-6 text-4xl font-black tracking-tight sm:text-5xl">{page.name}</h1>
              <p className="mt-5 text-lg leading-8 text-slate-200">{page.description}</p>
              <p className="mt-6 inline-flex rounded-full bg-white/10 px-4 py-2 text-sm font-black">{page.availabilityLabel}</p>
              {page.canPurchase && <LymowPriceDisplay variant={page.variant} className="mt-5" priceClassName="text-3xl font-black text-emerald-300" labelClassName="text-xs font-bold uppercase text-slate-300" regularClassName="font-bold text-slate-300 line-through" />}
              <p className="mt-4 text-sm leading-6 text-slate-300">The matched charger is included. Optional accessories and IDS services are priced separately. Confirm current fulfillment timing with IDS.</p>
              <p className="mt-2 text-xs text-slate-300">IDS product code: {page.sku}</p>
              {page.canPurchase ? <a href="#purchase-configuration" className="mt-6 inline-flex rounded-2xl bg-emerald-500 px-6 py-4 font-black text-slate-950">Build Your System — {LYMOW_VARIANT_PAGES[page.configuration].label}</a> : <Link href="/contact" className="mt-6 inline-flex rounded-2xl bg-white px-6 py-4 font-black text-slate-950">Contact IDS</Link>}
            </div>
            <Image {...lymowImages.hero} alt="Lymow One Plus tracked robotic mower" priority className="h-auto w-full rounded-3xl" />
          </div>
        </section>
        <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
          <nav aria-label="Lymow configuration" className="flex flex-wrap gap-3">
            {(Object.keys(LYMOW_VARIANT_PAGES) as LymowConfiguration[]).map((key) => <Link key={key} href={lymowVariantPath(key)} aria-current={key === page.configuration ? "page" : undefined} className={`rounded-xl border px-5 py-3 font-black ${key === page.configuration ? "border-emerald-700 bg-emerald-700 text-white" : "border-slate-300 bg-white text-emerald-800"}`}>{LYMOW_VARIANT_PAGES[key].label} configuration</Link>)}
          </nav>
          <section className="mt-10 grid gap-5 md:grid-cols-2" aria-label="Configuration details">
            <article className="rounded-3xl border border-slate-200 bg-white p-7"><h2 className="text-2xl font-black">Charging and mowing cadence</h2><dl className="mt-5 space-y-4"><div><dt className="font-bold">Charge time</dt><dd>{facts.chargeTime}</dd></div><div><dt className="font-bold">Estimated daily coverage</dt><dd>{facts.dailyCoverage}</dd></div></dl><p className="mt-5 leading-7 text-slate-600">{page.configuration === "5a" ? "Choose the 5A configuration when its charging cadence and estimated daily output suit your mapped mowing areas." : "Choose the 10A configuration for a shorter charging interval and higher estimated daily output from the same mower platform."} Daily coverage is an operating estimate, not a whole-property size rating.</p><p className="mt-4 text-sm leading-6 text-slate-500">{lymowPerformanceDisclaimer}</p></article>
            <article className="rounded-3xl border border-slate-200 bg-white p-7"><h2 className="text-2xl font-black">Included with this configuration</h2><ul className="mt-5 list-disc space-y-2 pl-5 text-slate-600">{lymowIncludedEquipment.map((item) => <li key={item}>{item}</li>)}</ul></article>
          </section>
          <p className="mt-8 leading-7 text-slate-600">Both configurations share the tracked drive, RTK + VSLAM navigation, and 16-inch dual-rotary cutting platform. <Link href="/equipment/lymow-one-plus" className="font-bold text-emerald-700 underline">See full features and specifications.</Link></p>
          {page.canPurchase && <section id="purchase-configuration" aria-labelledby="purchase-heading" className="mt-12 scroll-mt-6"><h2 id="purchase-heading" className="mb-3 text-3xl font-black">Build Your System — {LYMOW_VARIANT_PAGES[page.configuration].label}</h2><p className="mb-6 leading-7 text-slate-600">This purchase starts with the configuration shown above. Add eligible accessories, choose services, and review the current total before secure payment. Use the configuration links above to switch models.</p><NationwidePurchaseFlow key={page.configuration} initialCatalog={catalog} lymowConfiguration={page.configuration} /></section>}
        </div>
      </main>
    </div>
  </>;
}
