"use client";

import { useState, useSyncExternalStore } from "react";
import DesktopHomepage from "@/components/home/DesktopHomepage";
import MobileHomepage from "@/components/mobile/MobileHomepage";
import type { HomeHeroSnapshot } from "@/lib/promotions/home-hero";

const mobileQuery = "(max-width: 767px)";
const subscribeToMobile = (callback: () => void) => {
  const query = window.matchMedia(mobileQuery);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
};
const getMobileSnapshot = () => window.matchMedia(mobileQuery).matches;
const getServerSnapshot = () => false;

export default function Homepage({ heroSnapshot }: { heroSnapshot: HomeHeroSnapshot }) {
  const [heroObservedAt] = useState(() => performance.now());
  const isMobile = useSyncExternalStore(subscribeToMobile, getMobileSnapshot, getServerSnapshot);
  return isMobile ? <MobileHomepage heroSnapshot={heroSnapshot} heroObservedAt={heroObservedAt} /> : <DesktopHomepage heroSnapshot={heroSnapshot} heroObservedAt={heroObservedAt} />;
}
