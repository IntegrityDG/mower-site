import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import * as runtime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import Link from "next/link";
import HomepageExplore from "../components/home/HomepageExplore";
import * as heroData from "../lib/promotions/home-hero";
import type { HomeHeroSnapshot } from "../lib/promotions/home-hero";
import { loadInstallationModule as load } from "./helpers/installation-module";

const links = {
  "/equipment": "Browse robotic mower equipment",
  "/equipment/yarbo": "Yarbo",
  "/equipment/lymow-one-plus": "Lymow One Plus",
  "/robot-mowers": "Robotic mowers by property type",
  "/commercial-robot-mowers": "Commercial robotic mowing guide",
  "/robot-mower-guides": "Mower comparisons and planning guides",
  "/service": "Service and repair options",
  "/reviews": "Customer reviews",
  "/ids-in-action": "See IDS in action",
  "/robot-mowers/missouri": "Missouri",
  "/robot-mowers/southern-illinois": "Southern Illinois",
  "/robot-mowers/northeast-arkansas": "Northeast Arkansas",
  "/robot-mowers/western-kentucky": "Western Kentucky",
  "/robot-mowers/western-tennessee": "Western Tennessee",
};

const start = "2026-11-20T06:00:00Z";
const end = "2026-11-21T06:00:00Z";
const evergreen = { slides: [], serverTime: start, nextChangeAt: null };
const active = {
  serverTime: start,
  nextChangeAt: end,
  slides: [{ id: "active", imageUrl: "/api/homepage-slides/active/image", altText: "Scheduled artwork", buttonLabel: "See offer", buttonHref: "/equipment/yarbo", startsAt: start, endsAt: end, sortOrder: 1, dwellSeconds: 8 }],
};
type Wrapper = React.ComponentType<{ heroSnapshot: HomeHeroSnapshot; children: React.ReactNode }>;

function publicHome(snapshot: HomeHeroSnapshot, mobile = false) {
  const common = { react: React, "react/jsx-runtime": runtime, "next/link": Link };
  const hero = load<{ default: React.ComponentType }>("components/home/HomePromotionHero.tsx", {
    ...common, "@/lib/promotions/home-hero": heroData, "./HomePromotionHero.module.css": { title: "slide-title" },
  }).default;
  const components: Record<string, unknown> = {
    ...common, "@/components/home/HomePromotionHero": hero, "@/lib/homepage-navigation": {},
  };
  for (const path of ["footer/FooterActions", "home/HomepageNavigation", "contact/HomepageContactSection", "customer-paths/purchase/NationwidePurchaseFlow", "demo-scheduling/ScheduleDemoModal", "equipment/EquipmentCatalog", "featured-businesses/HomeBusinessSpotlight", "ids-action/IdsActionCarousel", "home/HomeFinancing", "promotions/HomePriceMatch", "promotions/HomeSalesSpecial", "reviews/HomeReviews"]) {
    components[`@/components/${path}`] = () => null;
  }
  const DesktopHomepage = load<{ default: Wrapper }>("components/home/DesktopHomepage.tsx", components).default;
  const MobileHomepage = load<{ default: Wrapper }>("components/mobile/MobileHomepage.tsx", components).default;
  if (mobile) {
    return Promise.resolve(renderToStaticMarkup(<MobileHomepage heroSnapshot={snapshot}><HomepageExplore /></MobileHomepage>));
  }
  const { default: Page } = load<{ default: () => Promise<React.ReactNode> }>("app/page.tsx", {
    ...common, "@/components/home/Homepage": DesktopHomepage, "@/components/home/HomepageExplore": HomepageExplore,
    "next/server": { connection: async () => {} }, "@/lib/homepage-slides/server": { readPublicHomepageSlides: async () => snapshot },
  });
  return Page().then(renderToStaticMarkup);
}

for (const [label, snapshot] of [["evergreen", evergreen], ["scheduled promotion", active]] as const) {
  for (const mobile of [false, true]) {
    test(`homepage ${mobile ? "mobile layout" : "server response"}: ${label} keeps one visible H1 and contextual HTML links`, async () => {
      const html = await publicHome(snapshot, mobile);
      assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
      assert.match(html, /<h1 id="homepage-mower-heading"[^>]*>Robotic Mower Sales &amp; Regional Service<\/h1>/);
      assert.match(html, /<main>[\s\S]*id="homepage-mower-heading"[\s\S]*<\/main>/);
      assert.doesNotMatch(html, /class="hidden min-h-screen/);
      const explore = html.match(/<section\b[^>]*aria-labelledby="homepage-mower-heading"[\s\S]*?<\/section>/)?.[0];
      assert.ok(explore);
      const found = Object.fromEntries([...explore.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map(([, href, text]) => [href, text]));
      assert.deepEqual(found, links);
      assert.match(explore, /sells robotic mowers nationwide\. Demos, installation, setup and hands-on service are regional only\./);
      assert.match(explore, /Remote Support is available nationwide to eligible customers\./);
      assert.doesNotMatch(explore, /Kansas|Pandag/);
      assert.match(html, />Build Your System /);
      if (label === "scheduled promotion") assert.match(html, /alt="Scheduled artwork"/);
      else assert.match(html, /<p class="slide-title">Your lawn\. Your time back\.<\/p>/);
    });
  }
}

test("equipment shopping page gives a direct path to the acreage, terrain and drive comparisons", async () => {
  const { default: Page } = load<{ default: () => Promise<React.ReactNode> }>("app/equipment/page.tsx", {
    "react/jsx-runtime": runtime, "next/link": Link,
    "@/components/equipment/CatalogHeader": () => null, "@/components/equipment/EquipmentCatalog": () => null,
    "@/lib/accessories/server": { readAccessoryCatalog: async () => [] },
    "@/lib/catalog/load-public-catalog": { loadPublicCatalog: async () => ({}) },
  });
  const html = renderToStaticMarkup(await Page());
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  for (const href of ["/robot-mowers", "/robot-mowers/large-acreage", "/robot-mowers/hills-rough-terrain", "/robot-mower-guides/tracked-vs-wheeled"]) {
    assert.ok(html.includes(`href="${href}"`), href);
  }
});
