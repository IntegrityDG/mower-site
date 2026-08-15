"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import BusinessCard, { INDEPENDENT_BUSINESS_DISCLAIMER } from "./BusinessCard";
import type { FeaturedBusiness } from "@/lib/featured-businesses/types";

export default function HomeBusinessSpotlight() {
  const [business, setBusiness] = useState<FeaturedBusiness | null>(null);
  useEffect(() => {
    fetch("/api/featured-businesses?featured=true")
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => setBusiness(v?.businesses?.[0] ?? null))
      .catch(() => {});
  }, []);
  if (!business) return null;
  return (
    <section
      aria-labelledby="business-spotlight-heading"
      className="bg-slate-100 px-5 py-10 md:px-10 md:py-14"
    >
      <div className="mx-auto max-w-5xl">
        <p className="text-sm font-black uppercase tracking-[.2em] text-emerald-700">
          Community Spotlight
        </p>
        <h2
          id="business-spotlight-heading"
          className="mt-2 text-3xl font-black tracking-tight text-slate-950 md:text-4xl"
        >
          Supporting Small Business Spotlight
        </h2>
        <div className="mt-7 grid items-start gap-5 md:grid-cols-[minmax(0,3fr)_minmax(14rem,1fr)] md:gap-6">
          <div>
            <BusinessCard business={business} source="homepage" compact />
            <p className="mt-5 text-xs leading-5 text-slate-500">
              {INDEPENDENT_BUSINESS_DISCLAIMER}
            </p>
            <Link
              href="/featured-businesses"
              className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-slate-950 px-6 py-3 text-center font-black text-white hover:bg-emerald-700"
            >
              Discover Featured Businesses
            </Link>
          </div>
          <aside
            aria-labelledby="dealer-tech-promo-heading"
            className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 md:p-5"
          >
            <h3
              id="dealer-tech-promo-heading"
              className="text-lg font-black leading-tight text-slate-950"
            >
              Dealer &amp; Tech Community Resources
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              A private U.S.-based network for robotic mower dealers and repair
              technicians to connect, find brand support, and share professional
              resources.
            </p>
            <Link
              href="/dealer-tech-resources"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-emerald-700 px-4 py-3 text-center text-sm font-black text-white hover:bg-emerald-800"
            >
              Open Dealer &amp; Tech Portal
            </Link>
          </aside>
        </div>
      </div>
    </section>
  );
}
