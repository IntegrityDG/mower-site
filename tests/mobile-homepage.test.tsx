import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const mobile = readFileSync(new URL("../components/mobile/MobileHomepage.tsx", import.meta.url), "utf8");
const navigation = readFileSync(new URL("../components/home/HomepageNavigation.tsx", import.meta.url), "utf8");
const desktop = readFileSync(new URL("../components/home/Homepage.tsx", import.meta.url), "utf8");
const desktopHome = readFileSync(new URL("../components/home/DesktopHomepage.tsx", import.meta.url), "utf8");
const financing = readFileSync(new URL("../components/home/HomeFinancing.tsx", import.meta.url), "utf8");

test("both layouts use the same visible navigation and scheduled hero", () => {
  for (const layout of [mobile, desktopHome]) {
    assert.match(layout, /<HomepageNavigation activeView=\{view\} onSelect=\{selectView\}/);
    assert.doesNotMatch(layout, /HomeNavigation open=|menuOpen|<SalesTicker/);
    const home = layout.slice(layout.indexOf('view === "home"'), layout.indexOf('view !== "home"'));
    assert.match(home, /<HomePromotionHero initialSnapshot=\{heroSnapshot\} serverObservedAt=\{heroObservedAt\} onBuild=\{\(\) => selectView\("build"\)\} \/>\{children\}<HomeSalesSpecial \/><HomePriceMatch \/><HomeBusinessSpotlight \/>/);
    assert.doesNotMatch(home, /EquipmentCatalog|NationwidePurchaseFlow|HomeFinancing|HomeReviews|IdsActionCarousel|HomepageContactSection/);
  }
});

test("service dropdown retains the existing scheduler destination, and FooterActions keeps its scheduler", () => {
  const action = readFileSync(new URL("../components/demo-scheduling/ScheduleDemoModal.tsx", import.meta.url), "utf8");
  const footer = readFileSync(new URL("../components/footer/FooterActions.tsx", import.meta.url), "utf8");
  assert.match(navigation, /href="\/services-scheduling\?service=demo&source=contact_ids#services-top"/);
  assert.match(action, /encodeURIComponent\(source\)/);
  assert.match(footer, /<ScheduleDemoModal source="contact_ids"/);
});

test("selected views mount the existing builder, machines, financing, reviews, featured IDS Action, and contact components", () => {
  for (const expected of ['view === "build".*NationwidePurchaseFlow', 'view === "machines".*EquipmentCatalog', 'view === "financing".*HomeFinancing', 'view === "reviews".*HomeReviews', 'view === "ids-action".*IdsActionCarousel', 'view === "contact".*HomepageContactSection']) assert.match(mobile, new RegExp(expected));
  const machinesBranch = mobile.match(/view === "machines"[\s\S]*?<EquipmentCatalog featuredBrands \/><\/div>/)?.[0] ?? "";
  assert.ok(machinesBranch);
  assert.doesNotMatch(machinesBranch, /HomeBusinessSpotlight/);
  assert.match(mobile, /← Back to Home/);
  assert.match(mobile, /selectView\("home"\)/);
  assert.match(navigation, /onSelect\(view\)/);
});

test("mobile machines view owns one section-level scheduler above the catalog", () => {
  assert.equal((mobile.match(/ScheduleDemoModal source="featured_machines"/g) ?? []).length, 1);
  assert.ok(mobile.indexOf('ScheduleDemoModal source="featured_machines"') < mobile.indexOf("<EquipmentCatalog featuredBrands />", mobile.indexOf('ScheduleDemoModal source="featured_machines"')));
});

test("shared financing preserves Hearth content, link, artwork, and disclaimer", () => {
  assert.match(financing, /app\.gethearth\.com\/requests\/930af233-2a7b-4f52-a836-bd11173d6fee/);
  assert.match(financing, /images\/site\/hearth-financing\.webp/);
  assert.match(financing, /Check Financing Options/);
  assert.match(financing, /\(512\) 607-5977/);
  assert.match(financing, /participating third-party lenders/);
});

test("responsive boundary selects one homepage below or above 768", () => {
  assert.match(desktop, /max-width: 767px/);
  assert.match(desktop, /isMobile \? \(\s*<MobileHomepage [^>]+>\{children\}<\/MobileHomepage>\s*\) : \(\s*<DesktopHomepage [^>]+>\{children\}<\/DesktopHomepage>/);
  assert.match(mobile, /md:hidden/);
  assert.doesNotMatch(desktopHome, /className="hidden min-h-screen/);
});

test("desktop internal selections mount only their requested existing component", () => {
  for (const expected of ['view === "build".*NationwidePurchaseFlow', 'view === "machines".*EquipmentCatalog', 'view === "financing".*HomeFinancing', 'view === "reviews".*HomeReviews', 'view === "ids-action".*IdsActionCarousel', 'view === "contact".*HomepageContactSection']) assert.match(desktopHome, new RegExp(expected));
  assert.match(desktopHome, /view === "machines"[\s\S]*ScheduleDemoModal source="featured_machines"[\s\S]*EquipmentCatalog/);
});

test("desktop history and hash navigation support Back through homepage views", () => {
  assert.match(desktopHome, /history\.pushState\(\{ idsHomeView: next \}/);
  assert.match(desktopHome, /homeUrlForView\(window\.location, next\)/);
  assert.match(desktopHome, /homeViewFromLocation\(window\.location\)/);
  assert.match(desktopHome, /addEventListener\("popstate"/);
  assert.match(desktopHome, /window\.scrollTo/);
});
