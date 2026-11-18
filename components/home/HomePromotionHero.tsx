"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { eligibleHomeHeroSlides, type HomeHeroSnapshot } from "@/lib/promotions/home-hero";
import styles from "./HomePromotionHero.module.css";

export default function HomePromotionHero({ initialSnapshot, onBuild, serverObservedAt }: { initialSnapshot: HomeHeroSnapshot; onBuild: () => void; serverObservedAt?: number }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [now, setNow] = useState(() => Date.parse(initialSnapshot.serverTime));
  const clock = useRef({ time: Date.parse(initialSnapshot.serverTime), observed: 0 });
  const [selectedId, setSelectedId] = useState(initialSnapshot.slides[0]?.id ?? "");
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [interacting, setInteracting] = useState(false);
  const [visible, setVisible] = useState(true);
  const slides = useMemo(() => eligibleHomeHeroSlides(snapshot, now), [snapshot, now]);
  const nextSlideId = slides[(Math.max(0, slides.findIndex(item => item.id === selectedId)) + 1) % slides.length].id;
  const index = Math.max(0, slides.findIndex(slide => slide.id === selectedId));
  const slide = slides[index];
  const dwellSeconds = Math.max(4, Math.min(30, slide.dwellSeconds ?? 8));
  const rotating = !paused && !reducedMotion && !interacting && visible;
  useEffect(() => {
    clock.current = { time: Date.parse(initialSnapshot.serverTime), observed: serverObservedAt ?? performance.now() };
    setNow(clock.current.time + Math.max(0, performance.now() - clock.current.observed));
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const motion = () => setReducedMotion(query.matches);
    motion(); query.addEventListener("change", motion);
    return () => query.removeEventListener("change", motion);
  }, [initialSnapshot.serverTime, serverObservedAt]);
  useEffect(() => {
    const controller = new AbortController(); let busy = false;
    const updateClock = () => setNow(clock.current.time + Math.max(0, performance.now() - clock.current.observed));
    const refresh = async () => {
      updateClock(); if (busy) return; busy = true;
      try {
        const response = await fetch("/api/homepage-slides", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Slide refresh unavailable");
        const next: HomeHeroSnapshot = await response.json();
        if (!Array.isArray(next.slides) || !Number.isFinite(Date.parse(next.serverTime))) throw new Error("Invalid slide snapshot");
        if (!controller.signal.aborted) {
          clock.current = { time: Date.parse(next.serverTime), observed: performance.now() };
          setSnapshot(next); setNow(clock.current.time);
        }
      } catch { /* Expired slides are still removed by the local server-relative clock. */ }
      finally { busy = false; }
    };
    void refresh();
    const onVisibility = () => { setVisible(!document.hidden); if (!document.hidden) void refresh(); };
    const onFocus = () => void refresh();
    const tick = window.setInterval(updateClock, 1000);
    const poll = window.setInterval(() => void refresh(), 60000);
    const boundary = snapshot.nextChangeAt ? Date.parse(snapshot.nextChangeAt) - (clock.current.time + Math.max(0, performance.now() - clock.current.observed)) : NaN;
    const timeout = Number.isFinite(boundary) && boundary > 0 ? window.setTimeout(() => void refresh(), Math.min(boundary + 25, 2147483000)) : undefined;
    document.addEventListener("visibilitychange", onVisibility); window.addEventListener("focus", onFocus);
    return () => { controller.abort(); window.clearInterval(tick); window.clearInterval(poll); if (timeout !== undefined) window.clearTimeout(timeout); document.removeEventListener("visibilitychange", onVisibility); window.removeEventListener("focus", onFocus); };
  }, [snapshot.nextChangeAt]);
  useEffect(() => {
    if (!rotating || slides.length < 2) return;
    const timer = window.setTimeout(() => setSelectedId(nextSlideId), dwellSeconds * 1000);
    return () => window.clearTimeout(timer);
  }, [rotating, nextSlideId, slides.length, dwellSeconds]);
  const choose = (next: number) => { setPaused(true); setSelectedId(slides[(next + slides.length) % slides.length].id); };
  return <section className={`${styles.hero} ${slide.sale ? styles.creative : ""}`} aria-label="Featured equipment and current offers" aria-roledescription="carousel"
    onMouseEnter={() => setInteracting(true)} onMouseLeave={() => setInteracting(false)}
    onFocusCapture={event => { if (!(event.target as HTMLElement).closest("[data-rotation-control]")) setPaused(true); }}>
    <div className={slide.sale ? styles.artworkStage : styles.photoStage}>
      {slide.sale && slides.map((item, i) => <div key={`backdrop-${item.id}`} aria-hidden="true"
        className={styles.artworkBackdrop} style={{ backgroundImage: `url(${JSON.stringify(item.image)})`, opacity: i === index ? 1 : 0 }} />)}
      {slides.map((item, i) =>
        // eslint-disable-next-line @next/next/no-img-element -- existing local photos or Admin-uploaded creative with responsive sizing
        <img key={item.id} src={item.image} alt={i === index && item.sale ? item.imageAlt : ""}
          aria-hidden={i !== index ? true : undefined} className={`${styles.image} ${item.sale ? styles.artwork : ""}`}
          style={{ opacity: i === index ? 1 : 0 }} fetchPriority={i === 0 ? "high" : "auto"} />
      )}
    </div>
    {!slide.sale && <div className={styles.shade} />}
    <div className={styles.content}>
      {!slide.sale ? <div aria-live={rotating ? "off" : "polite"} aria-atomic="true">
        <p className={styles.eyebrow}>{slide.eyebrow}</p>
        <h1 className={styles.title}>{slide.title}</h1>
        <p className={styles.description}>{slide.description}</p>
      </div> : <h1 className="sr-only">Integrity Distribution Systems equipment and current promotions</h1>}
      {slide.sale && <p className="sr-only" aria-live={rotating ? "off" : "polite"}>Slide {index + 1} of {slides.length}: {slide.imageAlt}</p>}
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={onBuild}>Build Your System <span aria-hidden="true">&nbsp;↗</span></button>
        {slide.href && <Link href={slide.href} className={styles.secondary}>{slide.linkLabel}</Link>}
      </div>
      {slides.length > 1 && <div className={styles.controls} aria-label="Slideshow controls">
        <button type="button" className={styles.control} aria-label="Previous slide" onClick={() => choose(index - 1)}>←</button>
        <button type="button" className={styles.control} aria-label="Next slide" onClick={() => choose(index + 1)}>→</button>
        {!reducedMotion && <button type="button" data-rotation-control className={styles.control} aria-label={paused ? "Play slideshow" : "Pause slideshow"} onClick={() => setPaused(value => !value)}>{paused ? "▶" : "Ⅱ"}</button>}
        {slides.map((item, i) => <button key={item.id} type="button" className={styles.control} aria-label={`Show slide ${i + 1}: ${item.eyebrow}`} aria-pressed={i === index} onClick={() => choose(i)}>{i + 1}</button>)}
        <span className={styles.counter}>{String(index + 1).padStart(2,"0")} / {String(slides.length).padStart(2,"0")}</span>
      </div>}
    </div>
  </section>;
}
