import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { eligibleHomeHeroSlides, type HomeHeroSnapshot } from "../lib/promotions/home-hero";
const start = "2026-11-18T06:00:00Z";
const end = "2026-11-19T06:00:00Z";
const snapshot: HomeHeroSnapshot = { serverTime: start, nextChangeAt: end, slides: [
  { id: "approved", imageUrl: "/api/homepage-slides/approved/image", altText: "Owner-designed promotional graphic with complete offer terms", buttonLabel: "View details", buttonHref: "/equipment/yarbo", startsAt: start, endsAt: end, sortOrder: 1, dwellSeconds: 12 },
] };
test("scheduled owner artwork starts inclusively and disappears at exclusive cutoff", () => {
  assert.equal(eligibleHomeHeroSlides(snapshot, Date.parse(start) - 1).some(slide => slide.sale), false);
  const active = eligibleHomeHeroSlides(snapshot, Date.parse(start));
  assert.equal(active.length, 1); assert.equal(active[0].image, snapshot.slides[0].imageUrl);
  assert.equal(active[0].imageAlt, snapshot.slides[0].altText); assert.equal(active[0].dwellSeconds, 12);
  assert.equal(eligibleHomeHeroSlides(snapshot, Date.parse(end) - 1)[0].id, "approved");
  assert.equal(eligibleHomeHeroSlides(snapshot, Date.parse(end)).some(slide => slide.sale), false);
});
test("cached expired offers fail closed to approved evergreen photography even if refresh fails", () => {
  const slides = eligibleHomeHeroSlides(snapshot, Date.parse(end) + 365 * 86400000);
  assert.equal(slides.length, 3); assert.ok(slides.every(slide => !slide.sale && slide.image.startsWith("/images/featured-machines/")));
});
test("ordering is deterministic and disabled/draft content is not inferred from catalog/ticker", () => {
  const rows = [snapshot.slides[0], { ...snapshot.slides[0], id: "first", sortOrder: 0 }, { ...snapshot.slides[0], id: "future", startsAt: end, endsAt: "2026-11-20T06:00:00Z" }];
  assert.deepEqual(eligibleHomeHeroSlides({ ...snapshot, slides: rows }, Date.parse(start)).map(slide => slide.id), ["first", "approved"]);
  assert.equal(eligibleHomeHeroSlides({ ...snapshot, slides: [] }, Date.parse(start)).some(slide => slide.sale), false);
});
test("invalid or reversed dates cannot publish a creative", () => {
  for (const patch of [{ startsAt: "invalid" }, { endsAt: "invalid" }, { startsAt: end, endsAt: start }]) {
    assert.equal(eligibleHomeHeroSlides({ ...snapshot, slides: [{ ...snapshot.slides[0], ...patch }] }, Date.parse(start)).some(slide => slide.sale), false);
  }
});
test("hero controls, motion preferences, responsive artwork and existing boards remain integrated", () => {
  const hero = readFileSync("components/home/HomePromotionHero.tsx", "utf8");
  const css = readFileSync("components/home/HomePromotionHero.module.css", "utf8");
  assert.match(hero, /prefers-reduced-motion: reduce/); assert.match(hero, /Pause slideshow/);
  assert.match(hero, /data-rotation-control/); assert.match(hero, /dwellSeconds \* 1000/);
  assert.match(hero, /visibilitychange/); assert.match(hero, /nextChangeAt/);
  assert.doesNotMatch(hero, /wheel|preventDefault|touchmove/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  for (const file of ["components/home/DesktopHomepage.tsx", "components/mobile/MobileHomepage.tsx"]) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /HomePromotionHero/); assert.match(source, /HomepageNavigation/);
    assert.match(source, /HomeSalesSpecial/); assert.match(source, /HomeBusinessSpotlight/);
    assert.doesNotMatch(source, /<SalesTicker/);
  }
});

test("scheduled artwork stays whole on desktop and uses intrinsic full-width sizing on phones", () => {
  const hero = readFileSync("components/home/HomePromotionHero.tsx", "utf8");
  const css = readFileSync("components/home/HomePromotionHero.module.css", "utf8");
  const desktopArtwork = css.slice(css.indexOf(".artworkStage {"), css.lastIndexOf("@media"));
  const mobileArtwork = css.slice(css.lastIndexOf("@media"));
  assert.match(css, /\.hero\.creative \{ min-height:0/);
  assert.match(desktopArtwork, /width:100%; aspect-ratio:2\/1; max-height:80svh/);
  assert.match(desktopArtwork, /\.artworkStage \.artwork \{ object-fit:contain/);
  assert.match(desktopArtwork, /\.artworkBackdrop \{[^}]*background-size:cover; filter:blur/);
  assert.match(hero, /backdrop-\$\{item.id\}[^]*?aria-hidden="true"[^]*?backgroundImage:/);
  assert.match(mobileArtwork, /max-width:767px/);
  assert.match(mobileArtwork, /\.artworkStage \{ height:auto; aspect-ratio:auto; max-height:none/);
  assert.match(mobileArtwork, /\.artworkBackdrop \{ display:none/);
  assert.match(mobileArtwork, /:not\(\[aria-hidden\]\) \{ position:relative; inset:auto; height:auto/);
});
