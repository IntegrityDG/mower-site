import type { PublicHomepageSlide } from "../homepage-slides/types";
import { isWithinPriceWindow } from "../pricing-program/window";

export type HomeHeroSlide = { id: string; eyebrow: string; title: string; description: string; image: string; imageAlt: string; href: string; linkLabel: string; sale: boolean; dwellSeconds?: number; startsAt?: string | null; endsAt?: string | null };
export type HomeHeroSnapshot = { slides: PublicHomepageSlide[]; serverTime: string; nextChangeAt: string | null };
const evergreen: HomeHeroSlide[] = [
  { id: "lymow-one-plus", eyebrow: "Lymow One Plus", title: "Your lawn. Your time back.", description: "Explore tracked robotic mowing and choose the configuration that fits your property.", image: "/images/featured-machines/lymow-one-plus.jpg", imageAlt: "Lymow One Plus mower on a lawn", href: "/equipment/lymow-one-plus", linkLabel: "Explore Lymow", sale: false },
  { id: "yarbo", eyebrow: "Yarbo", title: "One system. Every season.", description: "Discover modular mowing, snow clearing, blowing and trimming configurations.", image: "/images/featured-machines/yarbo-mower.jpg", imageAlt: "Yarbo equipment for lawn care, leaves and snow", href: "/equipment/yarbo", linkLabel: "Explore Yarbo", sale: false },
  { id: "pandag-g1", eyebrow: "Pandag", title: "Think beyond the backyard.", description: "Explore commercial robotic mowing and talk with IDS about your property's needs.", image: "/images/featured-machines/pandag-g1.jpg", imageAlt: "Pandag commercial robotic mower", href: "/equipment/pandag-g1", linkLabel: "Explore Pandag", sale: false },
];
/** Only Admin-published, scheduled graphics participate. No catalog inference. */
export function eligibleHomeHeroSlides(snapshot: HomeHeroSnapshot, now: number): HomeHeroSlide[] {
  const active = snapshot.slides.filter(slide => Number.isFinite(Date.parse(slide.startsAt)) && Number.isFinite(Date.parse(slide.endsAt)) &&
    isWithinPriceWindow({ startsAt: slide.startsAt, endsAt: slide.endsAt }, now))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
    .map(slide => ({ id: slide.id, eyebrow: "Current promotion", title: "", description: "", image: slide.imageUrl, imageAlt: slide.altText,
      href: slide.buttonHref ?? "", linkLabel: slide.buttonLabel ?? "View offer", sale: true, dwellSeconds: slide.dwellSeconds ?? 8, startsAt: slide.startsAt, endsAt: slide.endsAt }));
  return active.length ? active : evergreen;
}
