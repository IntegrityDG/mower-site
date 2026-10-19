"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  DEFAULT_TICKER_CONFIG,
  TICKER_MAX_SPEED,
  TICKER_MIN_SPEED,
  isSafeTickerLink,
  isTickerMessageEligible,
  validateTickerConfig,
  type PublicTickerSnapshot,
  type TickerConfig,
  type TickerMessage,
} from "@/lib/promotions/ticker";
import styles from "./SalesTicker.module.css";

type SalesTickerProps = {
  config: TickerConfig;
  serverTime?: string;
  /** Client monotonic time when this server snapshot was first mounted. */
  serverObservedAt?: number;
  nextChangeAt?: string | null;
  /** Preview stays local to the editor and never requests saved public content. */
  preview?: boolean;
};

const MAX_TIMEOUT = 2_147_000_000;

export function tickerServerNow(serverTime: string, observedAt: number, monotonicNow: number) {
  return Date.parse(serverTime) + Math.max(0, monotonicNow - observedAt);
}

/** Two equally sized groups advance by exactly one group per loop. */
export function tickerMotionLayout(sequenceWidth: number, viewportWidth: number, speed: number) {
  const safeSpeed = Number.isFinite(speed) && speed >= TICKER_MIN_SPEED && speed <= TICKER_MAX_SPEED ? speed : DEFAULT_TICKER_CONFIG.speed;
  if (!Number.isFinite(sequenceWidth) || !Number.isFinite(viewportWidth) || sequenceWidth <= 0 || viewportWidth <= 0) {
    return { repetitions: 1, distance: 0, duration: 0 };
  }
  const repetitions = Math.max(1, Math.ceil(viewportWidth / sequenceWidth) + 1);
  const distance = repetitions * sequenceWidth;
  return { repetitions, distance, duration: distance / safeSpeed };
}

function nextPreviewBoundary(messages: TickerMessage[], now: number) {
  let next = Infinity;
  for (const message of messages) {
    if (!message.active) continue;
    for (const boundary of [message.startsAt, message.endsAt]) {
      const timestamp = boundary ? Date.parse(boundary) : NaN;
      if (timestamp > now) next = Math.min(next, timestamp);
    }
  }
  return next;
}

export default function SalesTicker({ config, serverTime, serverObservedAt, nextChangeAt = null, preview = false }: SalesTickerProps) {
  const [initialTime] = useState(() => serverTime ?? new Date().toISOString());
  const incoming = useMemo<PublicTickerSnapshot>(() => ({ ticker: config, serverTime: serverTime ?? initialTime, nextChangeAt }), [config, serverTime, initialTime, nextChangeAt]);
  const [remote, setRemote] = useState<{ source: TickerConfig; snapshot: PublicTickerSnapshot; observedAt: number } | null>(null);
  const snapshot = !preview && remote?.source === config ? remote.snapshot : incoming;
  const observedAt = !preview && remote?.source === config ? remote.observedAt : serverObservedAt;
  const [clock, setClock] = useState<{ source: PublicTickerSnapshot; now: number } | null>(null);
  const now = clock?.source === snapshot ? clock.now : Date.parse(snapshot.serverTime);
  const visibleConfig = snapshot.ticker;
  const messages = useMemo(() => visibleConfig.messages.filter((message) => isTickerMessageEligible(message, now)), [visibleConfig, now]);
  const sequenceKey = JSON.stringify(messages.map(({ id, message, link }) => [id, message, link]));
  const viewport = useRef<HTMLDivElement>(null);
  const sequence = useRef<HTMLDivElement>(null);
  const [measurement, setMeasurement] = useState({ key: "", width: 0, viewport: 0 });
  const [paused, setPaused] = useState(false);
  const layout = tickerMotionLayout(measurement.width, measurement.viewport, visibleConfig.speed);
  const ready = measurement.key === sequenceKey && layout.distance > 0;

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let requestPending = false;
    const controller = new AbortController();
    const boundary = snapshot.nextChangeAt ? Date.parse(snapshot.nextChangeAt) : Infinity;
    const observation = observedAt ?? performance.now();
    const currentServerTime = () => tickerServerNow(snapshot.serverTime, observation, performance.now());

    const refresh = async () => {
      if (disposed || requestPending) return;
      requestPending = true;
      // Expired claims disappear immediately even when the boundary read fails.
      setClock({ source: snapshot, now: currentServerTime() });
      try {
        const response = await fetch("/api/sales-specials/ticker", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Ticker refresh unavailable");
        const payload: PublicTickerSnapshot = await response.json();
        const parsed = validateTickerConfig(payload.ticker);
        if (!parsed.ok || !Number.isFinite(Date.parse(payload.serverTime)) || (payload.nextChangeAt !== null && !Number.isFinite(Date.parse(payload.nextChangeAt)))) throw new Error("Invalid ticker snapshot");
        if (!disposed) setRemote({ source: config, snapshot: { ticker: parsed.value, serverTime: payload.serverTime, nextChangeAt: payload.nextChangeAt }, observedAt: performance.now() });
      } catch {
        if (!disposed) timer = setTimeout(refresh, 30_000);
      } finally {
        requestPending = false;
      }
    };
    const schedule = () => {
      const timestamp = currentServerTime();
      const next = preview ? nextPreviewBoundary(config.messages, timestamp) : boundary;
      if (!Number.isFinite(next)) return;
      timer = setTimeout(() => {
        if (preview) {
          setClock({ source: snapshot, now: currentServerTime() });
          schedule();
        } else if (currentServerTime() >= next) {
          void refresh();
        } else {
          schedule();
        }
      }, Math.min(MAX_TIMEOUT, Math.max(50, next - timestamp + 20)));
    };
    const onVisibilityChange = () => {
      if (!preview && document.visibilityState === "visible" && currentServerTime() >= boundary) {
        clearTimeout(timer);
        void refresh();
      }
    };
    schedule();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      disposed = true;
      clearTimeout(timer);
      controller.abort();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [config, snapshot, observedAt, preview]);

  useEffect(() => {
    const viewportElement = viewport.current;
    const sequenceElement = sequence.current;
    if (!viewportElement || !sequenceElement) return;
    let disposed = false;
    const measure = () => {
      if (disposed) return;
      const width = sequenceElement.getBoundingClientRect().width;
      const viewportWidth = viewportElement.getBoundingClientRect().width;
      setMeasurement((previous) => previous.key === sequenceKey && previous.width === width && previous.viewport === viewportWidth ? previous : { key: sequenceKey, width, viewport: viewportWidth });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(viewportElement);
    observer.observe(sequenceElement);
    void document.fonts?.ready.then(measure);
    return () => { disposed = true; observer.disconnect(); };
  }, [sequenceKey, visibleConfig.enabled]);

  if (!visibleConfig.enabled || messages.length === 0) return null;

  const safeColor = (value: string, fallback: string) => /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  const style = {
    backgroundColor: safeColor(visibleConfig.backgroundColor, DEFAULT_TICKER_CONFIG.backgroundColor),
    color: safeColor(visibleConfig.textColor, DEFAULT_TICKER_CONFIG.textColor),
    "--ticker-accent": safeColor(visibleConfig.accentColor, DEFAULT_TICKER_CONFIG.accentColor),
    "--ticker-duration": `${layout.duration}s`,
  } as CSSProperties;

  const renderSequence = (duplicate: boolean, key: string) => (
    <div key={key} ref={duplicate ? undefined : sequence} className={`${styles.sequence} ${duplicate ? styles.repeat : ""}`} aria-hidden={duplicate || undefined} data-ticker-sequence={duplicate ? "copy" : "primary"}>
      {messages.map((message) => (
        <span key={message.id} className={styles.item}>
          {message.link && isSafeTickerLink(message.link) ? (
            <a href={message.link} className={styles.link} tabIndex={duplicate ? -1 : undefined} onFocus={duplicate ? undefined : (event) => {
              if (visibleConfig.pauseOnHover || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
                event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" });
              }
            }} onPointerDown={duplicate ? (event) => event.preventDefault() : undefined}>{message.message}</a>
          ) : <span>{message.message}</span>}
          <span className={styles.separator} aria-hidden="true">&bull;</span>
        </span>
      ))}
    </div>
  );
  const repetitions = ready ? layout.repetitions : 1;

  return (
    <div className={styles.ticker} style={style} role="region" aria-label="Homepage sales promotions" data-sales-ticker data-ready={ready} data-paused={paused} data-pause-on-hover={visibleConfig.pauseOnHover}>
      <div className={styles.viewport} ref={viewport} tabIndex={0} role="group" aria-label="Scrollable sales promotions" onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget) && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) event.currentTarget.scrollLeft = 0;
      }}>
        <div className={styles.track}>
          <div className={styles.group}>
            {renderSequence(false, "primary")}
            {Array.from({ length: repetitions - 1 }, (_, index) => renderSequence(true, `fill-${index}`))}
          </div>
          <div className={`${styles.group} ${styles.clone}`} aria-hidden="true">
            {Array.from({ length: repetitions }, (_, index) => renderSequence(true, `clone-${index}`))}
          </div>
        </div>
      </div>
      <button type="button" className={styles.pause} aria-label={paused ? "Resume sales ticker" : "Pause sales ticker"} aria-pressed={paused} onClick={() => setPaused((value) => !value)}>
        <span aria-hidden="true">{paused ? "\u25b6" : "\u23f8"}</span>
      </button>
    </div>
  );
}
