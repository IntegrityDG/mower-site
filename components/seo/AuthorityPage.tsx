import Link from "next/link";
import type { ReactNode } from "react";
import CatalogHeader from "@/components/equipment/CatalogHeader";
import BreadcrumbJsonLd, { type BreadcrumbItem } from "@/components/seo/BreadcrumbJsonLd";

export function ArticleLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="font-bold text-emerald-800 underline decoration-emerald-600 underline-offset-4 hover:text-emerald-950">{children}</Link>;
}

export function AuthoritySection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-8">
    <h2 className="text-2xl font-black tracking-tight sm:text-3xl">{title}</h2>
    <div className="mt-5 space-y-4 leading-8 text-slate-700">{children}</div>
  </section>;
}

export default function AuthorityPage({ eyebrow, title, intro, breadcrumbs, children, cta }: {
  eyebrow: string;
  title: string;
  intro: ReactNode;
  breadcrumbs: readonly BreadcrumbItem[];
  children: ReactNode;
  cta: { title: string; text: string; href: string; label: string };
}) {
  return <div className="min-h-screen bg-slate-50 text-slate-950">
    <CatalogHeader />
    <main>
      <BreadcrumbJsonLd items={breadcrumbs} />
      <section className="bg-gradient-to-br from-slate-950 to-emerald-950 px-5 py-12 text-white sm:px-8 sm:py-16">
        <div className="mx-auto max-w-5xl">
          <nav aria-label="Breadcrumb" className="mb-8 text-sm text-slate-200">
            <ol className="flex flex-wrap gap-x-3 gap-y-2">
              {breadcrumbs.map((item, index) => <li key={item.path} className="flex items-center gap-3">
                {index > 0 && <span aria-hidden="true">/</span>}
                {index === breadcrumbs.length - 1 ? <span aria-current="page">{item.name}</span> : <Link href={item.path} className="underline underline-offset-4">{item.name}</Link>}
              </li>)}
            </ol>
          </nav>
          <p className="text-sm font-black uppercase tracking-[0.2em] text-emerald-300">{eyebrow}</p>
          <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl lg:text-6xl">{title}</h1>
          <div className="mt-6 max-w-4xl space-y-4 text-lg leading-8 text-slate-200">{intro}</div>
        </div>
      </section>
      <div className="mx-auto max-w-5xl space-y-7 px-5 py-10 sm:px-8 sm:py-14">{children}
        <section className="rounded-2xl bg-slate-950 p-5 text-white sm:p-8">
          <h2 className="text-2xl font-black">{cta.title}</h2>
          <p className="mt-4 leading-8 text-slate-200">{cta.text}</p>
          <Link href={cta.href} className="mt-6 inline-flex min-h-12 items-center justify-center rounded-xl bg-emerald-400 px-5 py-3 text-center font-black text-slate-950 hover:bg-emerald-300">{cta.label}</Link>
        </section>
      </div>
    </main>
  </div>;
}
