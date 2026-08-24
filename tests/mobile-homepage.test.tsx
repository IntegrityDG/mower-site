import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const mobile = readFileSync(new URL("../components/mobile/MobileHomepage.tsx", import.meta.url), "utf8");
const navigation = readFileSync(new URL("../components/mobile/MobileHomeNavigation.tsx", import.meta.url), "utf8");
const desktop = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const desktopHome = readFileSync(new URL("../components/home/DesktopHomepage.tsx", import.meta.url), "utf8");
const desktopNavigation = readFileSync(new URL("../components/home/DesktopHomeNavigation.tsx", import.meta.url), "utf8");
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

test("mobile drawer contains every requested destination and correct route links", () => {
  for (const label of ["HOME", "BUILD YOUR SYSTEM", "OUR MACHINES", "ACCESSORIES &amp; PARTS", "FINANCING OPTIONS", "CUSTOMER REVIEWS", "IDS IN ACTION", "CONTACT IDS", "DEALER PORTAL", "REFERRAL PROGRAM"]) assert.match(navigation, new RegExp(label));
  assert.match(navigation, /href="\/equipment\/accessories"/);
  assert.match(navigation, /href="\/dealer-tech-resources"/);
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

test("selected views mount the existing builder, machines, financing, reviews, featured IDS Action, and contact components", () => {
  for (const expected of ['view === "build".*NationwidePurchaseFlow', 'view === "machines".*EquipmentCatalog', 'view === "financing".*HomeFinancing', 'view === "reviews".*HomeReviews', 'view === "ids-action".*IdsActionCarousel', 'view === "contact".*HomepageContactSection']) assert.match(mobile, new RegExp(expected));
  const machinesBranch = mobile.match(/view === "machines"[\s\S]*?<EquipmentCatalog \/><\/div>/)?.[0] ?? "";
  assert.doesNotMatch(machinesBranch, /HomeBusinessSpotlight/);
  assert.match(mobile, /← Back to Home/);
  assert.match(mobile, /selectView\("home"\)/);
  assert.match(mobile, /selectView\("build"\)/);
  assert.match(navigation, /onSelect\(view\)/);
});

test("mobile machines view owns one section-level scheduler above the catalog", () => {
  assert.equal((mobile.match(/ScheduleDemoModal source="featured_machines"/g) ?? []).length, 1);
  assert.ok(mobile.indexOf('ScheduleDemoModal source="featured_machines"') < mobile.indexOf("<EquipmentCatalog />", mobile.indexOf('ScheduleDemoModal source="featured_machines"')));
});

test("shared financing preserves Hearth content, link, artwork, and disclaimer", () => {
  assert.match(financing, /app\.gethearth\.com\/requests\/930af233-2a7b-4f52-a836-bd11173d6fee/);
  assert.match(financing, /hearth-financing-background\.png/);
  assert.match(financing, /participating third-party lenders/);
});

test("responsive boundary selects one homepage below or above 768", () => {
  assert.match(desktop, /max-width: 767px/);
  assert.match(desktop, /isMobile \? <MobileHomepage \/> : <DesktopHomepage \/>/);
  assert.match(mobile, /md:hidden/);
  assert.match(desktopHome, /hidden min-h-screen[\s\S]*md:block/);
});

test("desktop default home is compact and ordered without mounting long-form views", () => {
  const home = desktopHome.slice(desktopHome.indexOf('view === "home"'), desktopHome.indexOf('view !== "home"'));
  for (const expected of ["DesktopHero", "BUILD YOUR SYSTEM", "HomeSalesSpecial", "HomePriceMatch", "HomeBusinessSpotlight"]) assert.match(home, new RegExp(expected));
  assert.match(home, /DesktopHero \/><section[\s\S]*HomeSalesSpecial \/><HomePriceMatch \/><HomeBusinessSpotlight \/>/);
  assert.doesNotMatch(home, /EquipmentCatalog|NationwidePurchaseFlow|HomeFinancing|HomeReviews|IdsActionCarousel|HomepageContactSection/);
});

test("desktop drawer contains all destinations and distinct Dealer Portal link", () => {
  for (const label of ["HOME", "BUILD YOUR SYSTEM", "OUR MACHINES", "ACCESSORIES &amp; PARTS", "FINANCING OPTIONS", "CUSTOMER REVIEWS", "IDS IN ACTION", "CONTACT IDS", "DEALER PORTAL", "REFERRAL PROGRAM"]) assert.match(desktopNavigation, new RegExp(label));
  assert.match(desktopNavigation, /href="\/equipment\/accessories"/);
  assert.match(desktopNavigation, /href="\/dealer-tech-resources"[\s\S]*border-2 border-emerald-600/);
  assert.match(desktopNavigation, /href="\/referral-program"/);
});

test("desktop internal selections mount only their requested existing component", () => {
  for (const expected of ['view === "build".*NationwidePurchaseFlow', 'view === "machines".*EquipmentCatalog', 'view === "financing".*HomeFinancing', 'view === "reviews".*HomeReviews', 'view === "ids-action".*IdsActionCarousel', 'view === "contact".*HomepageContactSection']) assert.match(desktopHome, new RegExp(expected));
  assert.match(desktopHome, /view === "machines"[\s\S]*ScheduleDemoModal source="featured_machines"[\s\S]*EquipmentCatalog/);
});

test("desktop drawer preserves dialog, focus, keyboard, backdrop, and scroll accessibility", () => {
  assert.match(desktopHome, /aria-label="Open desktop navigation"/);
  assert.match(desktopHome, /aria-expanded=\{menuOpen\}/);
  assert.match(desktopHome, /aria-controls="desktop-navigation"/);
  for (const token of [/role="dialog"/, /aria-modal="true"/, /aria-label="Desktop navigation"/, /event\.key === "Escape"/, /event\.key !== "Tab"/, /document\.body\.style\.overflow = "hidden"/, /previousFocus\.current\?\.focus/, /absolute inset-0 bg-slate-950\/70/]) assert.match(desktopNavigation, token);
});

test("desktop history and hash navigation support Back through homepage views", () => {
  assert.match(desktopHome, /history\.pushState\(\{ idsHomeView: next \}/);
  assert.match(desktopHome, /homeUrlForView\(window\.location, next\)/);
  assert.match(desktopHome, /homeViewFromLocation\(window\.location\)/);
  assert.match(desktopHome, /addEventListener\("popstate"/);
  assert.match(desktopHome, /window\.scrollTo/);
});

test("Intro mower image appears before Intro copy on desktop and mobile", () => {
  const desktopHero = desktopHome.slice(desktopHome.indexOf("function DesktopHero"), desktopHome.indexOf("function DesktopFooter"));
  const mobileHero = mobile.slice(mobile.indexOf("function MobileHero"), mobile.indexOf("function MobileFooter"));
  for (const hero of [desktopHero, mobileHero]) assert.ok(hero.indexOf("/images/cartoon-mowers.png") < hero.indexOf("A SMALL BUSINESS"));
});
