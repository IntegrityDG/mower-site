"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import ScheduleDemoModal from "@/components/demo-scheduling/ScheduleDemoModal";
import type { IdsActionEntry } from "@/lib/ids-action/types";

const loader = ({ src }: { src: string }) => src;

export default function IdsActionCarousel() {
  const [entries, setEntries] = useState<IdsActionEntry[]>([]);
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const transitionTimer = useRef<number | null>(null);

  useEffect(() => {
    fetch("/api/ids-in-action?featured=true&limit=8")
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (payload) setEntries((payload.entries ?? []).filter((entry: IdsActionEntry) => entry.media.length));
      })
      .catch(() => {});
  }, []);

  const advance = useCallback((delta: number) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setIndex((current) => (current + delta + entries.length) % entries.length);
      return;
    }
    setVisible(false);
    if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current);
    transitionTimer.current = window.setTimeout(() => {
      setIndex((current) => (current + delta + entries.length) % entries.length);
      setVisible(true);
      transitionTimer.current = null;
    }, 250);
  }, [entries.length]);

  useEffect(() => {
    if (entries.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => advance(1), 3000);
    return () => window.clearInterval(timer);
  }, [advance, entries.length]);

  useEffect(() => () => {
    if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current);
  }, []);

  if (!entries.length) return null;
  const entry = entries[index];
  const photo = entry.media[0];

  return (
    <section aria-label="IDS in Action" className="min-w-0 overflow-x-hidden bg-white px-4 py-12 sm:px-6 sm:py-20 md:px-10">
      <div className="mx-auto min-w-0 max-w-5xl text-center">
        <p className="text-sm font-black uppercase tracking-[.25em] text-emerald-700">IDS IN ACTION</p>
        <h2 className="mt-3 text-3xl font-black md:text-5xl">Real machines. Real properties. Real-world autonomous lawn care.</h2>
        <div className="relative mx-auto mt-8 aspect-[16/9] w-full max-w-[560px] overflow-hidden rounded-[2rem] bg-slate-900 shadow-xl">
          <Image loader={loader} unoptimized src={photo.mediaUrl} alt={photo.altText || entry.title} fill sizes="(min-width: 768px) 560px, calc(100vw - 2rem)" className={`object-cover transition-opacity duration-500 ${visible ? "opacity-100" : "opacity-0"}`} />
          <div className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/90 to-transparent px-5 pb-5 pt-14 text-left text-white transition-opacity duration-500 sm:px-6 sm:pt-16 ${visible ? "opacity-100" : "opacity-0"}`}>
            <p className="text-lg font-black sm:text-xl">{entry.title}</p>
            <p className="mt-1 text-sm text-slate-200">{entry.category}{entry.location ? ` · ${entry.location}` : ""}</p>
          </div>
          {entries.length > 1 && <>
            <button type="button" aria-label="Previous IDS in Action photo" onClick={() => advance(-1)} className="absolute left-2 top-1/2 h-11 w-11 -translate-y-1/2 rounded-full bg-slate-950/75 text-2xl text-white sm:left-4">‹</button>
            <button type="button" aria-label="Next IDS in Action photo" onClick={() => advance(1)} className="absolute right-2 top-1/2 h-11 w-11 -translate-y-1/2 rounded-full bg-slate-950/75 text-2xl text-white sm:right-4">›</button>
          </>}
        </div>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row sm:flex-wrap">
          <Link href="/ids-in-action" className="inline-flex min-h-14 w-full items-center justify-center rounded-2xl bg-emerald-600 px-7 py-4 text-center font-black text-white hover:bg-emerald-700 sm:w-auto">VIEW ALL IDS IN ACTION</Link>
          <ScheduleDemoModal source="ids_in_action" triggerClassName="inline-flex min-h-14 w-full items-center justify-center rounded-2xl border border-emerald-700 px-7 py-4 font-black text-emerald-800 hover:bg-emerald-50 sm:w-auto" />
        </div>
      </div>
    </section>
  );
}
