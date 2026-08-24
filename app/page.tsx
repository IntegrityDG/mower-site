"use client";

import { useSyncExternalStore } from "react";
import DesktopHomepage from "@/components/home/DesktopHomepage";
import MobileHomepage from "@/components/mobile/MobileHomepage";

const mobileQuery = "(max-width: 767px)";
const subscribeToMobile = (callback: () => void) => {
  const query = window.matchMedia(mobileQuery);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
};
const getMobileSnapshot = () => window.matchMedia(mobileQuery).matches;
const getServerSnapshot = () => false;

export default function Page() {
  const isMobile = useSyncExternalStore(subscribeToMobile, getMobileSnapshot, getServerSnapshot);
  return isMobile ? <MobileHomepage /> : <DesktopHomepage />;
}
