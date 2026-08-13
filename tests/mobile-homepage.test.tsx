import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const mobile = readFileSync(new URL("../components/mobile/MobileHomepage.tsx", import.meta.url), "utf8");
const navigation = readFileSync(new URL("../components/mobile/MobileHomeNavigation.tsx", import.meta.url), "utf8");
const desktop = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const financing = readFileSync(new URL("../components/home/HomeFinancing.tsx", import.meta.url), "utf8");

test("mobile header exposes an accessible hamburger and mobile-only sticky layout", () => {
  assert.match(mobile, /sticky top-0 z-50/);
  assert.match(mobile, />Integrity Distribution Systems<\/p>/);
  assert.match(mobile, />Autonomous Lawn Care Solutions<\/p>/);
  assert.match(mobile, /aria-label="Open navigation"/);
  assert.match(mobile, /aria-expanded=\{menuOpen\}/);
  assert.match(mobile, /aria-controls="mobile-navigation"/);
  assert.match(mobile, /md:hidden/);
});

test("drawer supports open, close, backdrop, Escape, focus containment, and scroll lock", () => {
  assert.match(mobile, /setMenuOpen\(true\)/);
  assert.match(navigation, /if \(!open\) return null/);
  assert.match(navigation, /aria-modal="true"/);
  assert.match(navigation, /event\.key === "Escape"/);
  assert.match(navigation, /document\.body\.style\.overflow = "hidden"/);
  assert.match(navigation, /previousFocus\.current\?\.focus/);
  assert.match(navigation, /absolute inset-0 bg-slate-950\/70/);
});

test("drawer contains every requested destination and correct route links", () => {
  for (const label of ["HOME", "BUILD YOUR SYSTEM", "OUR MACHINES", "ACCESSORIES &amp; PARTS", "FINANCING OPTIONS", "CUSTOMER REVIEWS", "CONTACT IDS", "REFERRAL PROGRAM"]) assert.match(navigation, new RegExp(label));
  assert.match(navigation, /href="\/equipment\/accessories"/);
  assert.match(navigation, /href="\/referral-program"/);
});

test("compact home keeps its existing flow and adds the business spotlight after price match", () => {
  const homeBranch = mobile.slice(mobile.indexOf('view === "home"'), mobile.indexOf('view !== "home"'));
  assert.match(homeBranch, /MobileHero/);
  assert.match(homeBranch, /BUILD YOUR SYSTEM/);
  assert.match(homeBranch, /HomeSalesSpecial/);
  assert.match(homeBranch, /HomePriceMatch/);
  assert.match(homeBranch, /HomeSalesSpecial \/><HomePriceMatch \/><HomeBusinessSpotlight \/>/);
  assert.doesNotMatch(homeBranch, /HomeReviews|EquipmentCatalog|NationwidePurchaseFlow/);
});

test("selected views mount the existing builder, machines, financing, reviews, and contact components", () => {
  for (const expected of ['view === "build".*NationwidePurchaseFlow', 'view === "machines".*EquipmentCatalog', 'view === "financing".*HomeFinancing', 'view === "reviews".*HomeReviews', 'view === "contact".*HomepageContactSection']) assert.match(mobile, new RegExp(expected));
  const machinesBranch = mobile.match(/view === "machines"[\s\S]*?<EquipmentCatalog \/><\/div>/)?.[0] ?? "";
  assert.doesNotMatch(machinesBranch, /HomeBusinessSpotlight/);
  assert.match(mobile, /← Back to Home/);
  assert.match(mobile, /selectView\("home"\)/);
  assert.match(mobile, /selectView\("build"\)/);
  assert.match(navigation, /onSelect\(view\)/);
});

test("shared financing preserves Hearth content, link, artwork, and disclaimer", () => {
  assert.match(financing, /app\.gethearth\.com\/requests\/930af233-2a7b-4f52-a836-bd11173d6fee/);
  assert.match(financing, /hearth-financing-background\.png/);
  assert.match(financing, /participating third-party lenders/);
});

test("responsive boundary selects mobile below 768 and preserves desktop order", () => {
  assert.match(desktop, /max-width: 767px/);
  const markers = ["{/* HERO */}", "{/* FEATURED EQUIPMENT */}", "<HomeSalesSpecial />", "{/* PRICE MATCH */}", "<HomeReviews />", "{/* HEARTH FINANCING */}", 'id="location-and-customer-path"', "<HomepageContactSection />", "{/* FOOTER */}"];
  let previous = -1;
  for (const marker of markers) { const position = desktop.indexOf(marker); assert.ok(position > previous, `${marker} remains in desktop order`); previous = position; }
});
