"use client";

import { useState, useSyncExternalStore } from "react";
import DesktopHomepage from "@/components/home/DesktopHomepage";
import MobileHomepage from "@/components/mobile/MobileHomepage";
import type { PublicTickerSnapshot } from "@/lib/promotions/ticker";

const mobileQuery = "(max-width: 767px)";
const subscribeToMobile = (callback: () => void) => {
  const query = window.matchMedia(mobileQuery);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
};
const getMobileSnapshot = () => window.matchMedia(mobileQuery).matches;
const getServerSnapshot = () => false;

export default function Homepage({ tickerSnapshot }: { tickerSnapshot: PublicTickerSnapshot }) {
  const [tickerObservedAt] = useState(() => performance.now());
  const isMobile = useSyncExternalStore(subscribeToMobile, getMobileSnapshot, getServerSnapshot);
  return isMobile ? <MobileHomepage tickerSnapshot={tickerSnapshot} tickerObservedAt={tickerObservedAt} /> : <DesktopHomepage tickerSnapshot={tickerSnapshot} tickerObservedAt={tickerObservedAt} />;
}
