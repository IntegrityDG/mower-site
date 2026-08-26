import type { FeaturedBusiness } from "./types";

export const HOMEPAGE_ROTATION_INTERVAL_MS = 7_000;
export const HOMEPAGE_ROTATION_DOT_LIMIT = 10;

export function selectInitialBusinessIndex(businessCount: number, random: () => number = Math.random) {
  if (businessCount <= 0) return 0;
  return Math.min(businessCount - 1, Math.floor(random() * businessCount));
}

export function nextBusinessIndex(currentIndex: number, businessCount: number) {
  return businessCount <= 0 ? 0 : (currentIndex + 1) % businessCount;
}

export function previousBusinessIndex(currentIndex: number, businessCount: number) {
  return businessCount <= 0 ? 0 : (currentIndex - 1 + businessCount) % businessCount;
}

export function isActivePublicBusiness(business: FeaturedBusiness, now = Date.now()) {
  if (!business.isPublic || business.isArchived || !business.listingExpiresAt) return false;
  const expiration = Date.parse(business.listingExpiresAt);
  return Number.isFinite(expiration) && expiration > now;
}

export function scheduleSpotlightRotation(
  callback: () => void,
  delay = HOMEPAGE_ROTATION_INTERVAL_MS,
  schedule: (callback: () => void, delay: number) => ReturnType<typeof setTimeout> = setTimeout,
  cancel: (timer: ReturnType<typeof setTimeout>) => void = clearTimeout,
) {
  const timer = schedule(callback, delay);
  return () => cancel(timer);
}
