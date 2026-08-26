"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  HOMEPAGE_ROTATION_DOT_LIMIT,
  nextBusinessIndex,
  previousBusinessIndex,
  scheduleSpotlightRotation,
  selectInitialBusinessIndex,
} from "@/lib/featured-businesses/homepage-rotation";
import type { FeaturedBusiness } from "@/lib/featured-businesses/types";
import BusinessCard, { INDEPENDENT_BUSINESS_DISCLAIMER } from "./BusinessCard";
import styles from "./HomeBusinessSpotlight.module.css";

export default function HomeBusinessSpotlight() {
  const [businesses, setBusinesses] = useState<FeaturedBusiness[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [rotationEpoch, setRotationEpoch] = useState(0);
  const [isPointerInside, setIsPointerInside] = useState(false);
  const [isFocusInside, setIsFocusInside] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/featured-businesses?homepageRotation=true", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((value) => {
        if (controller.signal.aborted) return;
        const loaded = Array.isArray(value?.businesses)
          ? (value.businesses as FeaturedBusiness[])
          : [];
        setBusinesses(loaded);
        setCurrentIndex(selectInitialBusinessIndex(loaded.length));
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const move = useCallback((direction: "previous" | "next") => {
    setCurrentIndex((index) => direction === "previous"
      ? previousBusinessIndex(index, businesses.length)
      : nextBusinessIndex(index, businesses.length));
    setRotationEpoch((epoch) => epoch + 1);
  }, [businesses.length]);

  useEffect(() => {
    if (businesses.length < 2 || isPointerInside || isFocusInside) return;
    return scheduleSpotlightRotation(() => {
      setCurrentIndex((index) => nextBusinessIndex(index, businesses.length));
      setRotationEpoch((epoch) => epoch + 1);
    });
  }, [businesses.length, isFocusInside, isPointerInside, rotationEpoch]);

  const business = businesses[currentIndex] ?? null;
  if (!business) return null;
  const hasRotation = businesses.length > 1;

  return (
    <section aria-labelledby="business-spotlight-heading" className="bg-slate-100 px-5 py-10 md:px-10 md:py-14">
      <div className="mx-auto max-w-5xl">
        <p className="text-sm font-black uppercase tracking-[.2em] text-emerald-700">Community Spotlight</p>
        <h2 id="business-spotlight-heading" className="mt-2 text-3xl font-black tracking-tight text-slate-950 md:text-4xl">
          Supporting Small Business Spotlight
        </h2>
        <div className="mt-7 grid items-start gap-5 md:grid-cols-[minmax(0,3fr)_minmax(14rem,1fr)] md:gap-6">
          <div>
            <div
              onPointerEnter={() => setIsPointerInside(true)}
              onPointerLeave={() => setIsPointerInside(false)}
              onFocus={() => setIsFocusInside(true)}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setIsFocusInside(false);
              }}
            >
              <div key={business.id} className={styles.businessTransition}>
                <BusinessCard business={business} source="homepage" compact />
              </div>
              {hasRotation ? (
                <div className="mt-4 flex min-h-11 items-center justify-between gap-3">
                  <button type="button" aria-label="Show previous featured business" onClick={() => move("previous")} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-black text-slate-900 hover:border-emerald-600 hover:text-emerald-700">
                    Previous
                  </button>
                  {businesses.length <= HOMEPAGE_ROTATION_DOT_LIMIT ? (
                    <div className="flex flex-wrap items-center justify-center gap-2" aria-hidden="true">
                      {businesses.map((item, index) => (
                        <span key={item.id} className={`h-2.5 w-2.5 rounded-full ${index === currentIndex ? "bg-emerald-700" : "bg-slate-300"}`} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm font-bold text-slate-600">{currentIndex + 1} of {businesses.length}</p>
                  )}
                  <button type="button" aria-label="Show next featured business" onClick={() => move("next")} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-black text-slate-900 hover:border-emerald-600 hover:text-emerald-700">
                    Next
                  </button>
                </div>
              ) : null}
            </div>
            <p className="mt-5 text-xs leading-5 text-slate-500">{INDEPENDENT_BUSINESS_DISCLAIMER}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/featured-businesses" className="inline-flex min-h-11 items-center rounded-xl bg-slate-950 px-6 py-3 text-center font-black text-white hover:bg-emerald-700">
                Discover Featured Businesses
              </Link>
              <Link href="/featured-businesses/request" className="inline-flex min-h-11 items-center rounded-xl bg-emerald-700 px-6 py-3 text-center font-black text-white hover:bg-emerald-800">
                Request to be a Featured Business
              </Link>
            </div>
          </div>
          <aside aria-labelledby="dealer-tech-promo-heading" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 md:p-5">
            <h3 id="dealer-tech-promo-heading" className="text-lg font-black leading-tight text-slate-950">Dealer &amp; Tech Community Resources</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              A private U.S.-based network for robotic mower dealers and repair technicians to connect, find brand support, and share professional resources.
            </p>
            <Link href="/dealer-tech-resources" target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-emerald-700 px-4 py-3 text-center text-sm font-black text-white hover:bg-emerald-800">
              Open Dealer &amp; Tech Portal
            </Link>
          </aside>
        </div>
      </div>
    </section>
  );
}
