import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

import { SalesSpecialsBanner } from "../components/promotions/SalesSpecialsBanner";
import { createSalesSpecialsAdminHandlers } from "../lib/promotions/admin-handlers";
import { DEFAULT_SALES_SPECIALS, SALES_SPECIALS_CARTOONS, type SalesSpecialsConfig, type SalesSpecialsSlots } from "../lib/promotions/config";
import { toPublicSalesSpecials } from "../lib/promotions/public";
import { validateSalesSpecials } from "../lib/promotions/validation";

const primary: SalesSpecialsConfig = { enabled: true, cartoonKey: "yarbo", headline: "Summer Event", description: "Save while promotional inventory lasts." };
const secondary: SalesSpecialsConfig = { enabled: true, cartoonKey: "lymow", headline: "Second Event", description: "A separate second promotion." };
const slots: SalesSpecialsSlots = { primary, secondary };

test("one enabled promotion renders one full-width shared shell with one referral section", () => {
  const html = renderToStaticMarkup(<SalesSpecialsBanner promotions={[primary]} />);
  assert.match(html, /Summer Event/);
  assert.match(html, /grid-cols-1/);
  assert.doesNotMatch(html, /lg:grid-cols-2/);
  assert.match(html, new RegExp(SALES_SPECIALS_CARTOONS.yarbo!.src));
  assert.equal((html.match(/data-sales-specials-shell/g) ?? []).length, 1);
  assert.equal((html.match(/bg-gradient-to-br/g) ?? []).length, 1);
  assert.equal((html.match(/HELP A FRIEND\. HELP YOURSELF\. GET PAID\./g) ?? []).length, 1);
  assert.equal((html.match(/href="\/referral-program"/g) ?? []).length, 1);
});

test("two promotions share one shell and use ordered desktop columns that stack by default", () => {
  const html = renderToStaticMarkup(<SalesSpecialsBanner promotions={[primary, secondary]} />);
  assert.ok(html.indexOf("Summer Event") < html.indexOf("Second Event"));
  assert.match(html, /relative grid gap-9 lg:grid-cols-2/);
  assert.doesNotMatch(html, /(?:^|\s)grid-cols-2(?:\s|")/);
  assert.equal((html.match(/data-sales-specials-shell/g) ?? []).length, 1);
  assert.equal((html.match(/bg-gradient-to-br/g) ?? []).length, 1);
  assert.equal((html.match(/rounded-\[2rem\]/g) ?? []).length, 1);
  assert.equal((html.match(/(?:^|\s)shadow-2xl(?:\s|")/g) ?? []).length, 1);
});

test("two promotion columns have unique headings and artwork with one shared referral section", () => {
  const html = renderToStaticMarkup(<SalesSpecialsBanner promotions={[primary, secondary]} />);
  assert.match(html, /id="sales-specials-heading-primary"/);
  assert.match(html, /id="sales-specials-heading-secondary"/);
  assert.equal((html.match(/HELP A FRIEND\. HELP YOURSELF\. GET PAID\./g) ?? []).length, 1);
  assert.equal((html.match(/href="\/referral-program"/g) ?? []).length, 1);
  assert.equal((html.match(/Explore Our Referral Program/g) ?? []).length, 1);
  assert.match(html, new RegExp(SALES_SPECIALS_CARTOONS.yarbo!.src));
  assert.match(html, new RegExp(SALES_SPECIALS_CARTOONS.lymow!.src));
});

test("disabled or empty promotions render nothing", () => {
  assert.equal(renderToStaticMarkup(<SalesSpecialsBanner promotions={[]} />), "");
  assert.equal(renderToStaticMarkup(<SalesSpecialsBanner promotions={[{ ...primary, enabled: false }]} />), "");
});

test("None retains full text layout without an image", () => {
  const html = renderToStaticMarkup(<SalesSpecialsBanner promotions={[{ ...primary, cartoonKey: "none" }]} />);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /max-w-5xl/);
});

test("the complete artwork allowlist retains local assets and accessible alt text", () => {
  const expected = {
    lymow: ["/products/lymow-one-plus-thumb.PNG", "Lymow autonomous mower"],
    yarbo: ["/products/yarbo-thumb.png", "Yarbo autonomous mower"],
    pandag: ["/products/pandag-thumb.png", "Pandag commercial autonomous mower"],
    all: ["/images/cartoon-mowers.png", "Integrity Distribution Systems autonomous mower lineup"],
  } as const;
  assert.equal(SALES_SPECIALS_CARTOONS.none, null);
  for (const [key, [src, alt]] of Object.entries(expected)) {
    const html = renderToStaticMarkup(<SalesSpecialsBanner promotions={[{ ...primary, cartoonKey: key as keyof typeof expected }]} />);
    assert.match(html, new RegExp(`src="${src}"`));
    assert.match(html, new RegExp(`alt="${alt}"`));
  }
});

test("promotions validate independently", () => {
  assert.equal(validateSalesSpecials(primary).ok, true);
  assert.equal(validateSalesSpecials({ ...secondary, headline: " " }).ok, false);
  assert.equal(validateSalesSpecials(secondary).ok, true);
  for (const input of [{ ...primary, cartoonKey: "https://example.com/x" }, { ...primary, headline: "x".repeat(121) }, { ...primary, description: "x".repeat(501) }]) assert.equal(validateSalesSpecials(input).ok, false);
});

test("public projection exposes only rendering fields", () => {
  assert.deepEqual(toPublicSalesSpecials({ enabled: true, cartoon_key: "pandag", headline: "Event", description: "Details", id: "homepage", created_at: "private", admin_note: "private" }), { enabled: true, cartoonKey: "pandag", headline: "Event", description: "Details" });
});

test("admin authentication protects both reads and writes", async () => {
  const handlers = createSalesSpecialsAdminHandlers({ isAdmin: async () => false, read: async () => slots, save: async (_slot, value) => value });
  assert.equal((await handlers.GET()).status, 401);
  assert.equal((await handlers.PUT(new Request("http://local", { method: "PUT", body: JSON.stringify({ slot: "primary", promotion: primary }) }))).status, 401);
});

test("authenticated saves update only the allowlisted requested slot", async () => {
  let stored = structuredClone(slots);
  const handlers = createSalesSpecialsAdminHandlers({ isAdmin: async () => true, read: async () => stored, save: async (slot, value) => { stored = { ...stored, [slot]: value }; return value; } });
  const response = await handlers.PUT(new Request("http://local", { method: "PUT", body: JSON.stringify({ slot: "primary", promotion: { ...primary, headline: "Changed primary" } }) }));
  assert.equal(response.status, 200);
  assert.equal(stored.primary.headline, "Changed primary");
  assert.equal(stored.secondary.headline, "Second Event");
  await handlers.PUT(new Request("http://local", { method: "PUT", body: JSON.stringify({ slot: "secondary", promotion: { ...secondary, headline: "Changed secondary" } }) }));
  assert.equal(stored.primary.headline, "Changed primary");
  assert.equal(stored.secondary.headline, "Changed secondary");
  const payload = await (await handlers.GET()).json();
  assert.deepEqual(payload.promotions, stored);
});

test("arbitrary slots and raw database IDs are rejected", async () => {
  const handlers = createSalesSpecialsAdminHandlers({ isAdmin: async () => true, read: async () => slots, save: async (_slot, value) => value });
  for (const slot of ["homepage", "homepage-secondary", "other", null]) {
    const response = await handlers.PUT(new Request("http://local", { method: "PUT", body: JSON.stringify({ slot, promotion: primary }) }));
    assert.equal(response.status, 400);
  }
});

test("fixed server mapping and public API preserve primary then secondary order", () => {
  const server = readFileSync(new URL("../lib/promotions/server.ts", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/api/sales-specials/route.ts", import.meta.url), "utf8");
  assert.match(server, /primary: "homepage"/);
  assert.match(server, /secondary: "homepage-secondary"/);
  assert.match(server, /\.in\("id", \[SALES_SPECIALS_SLOT_IDS\.primary, SALES_SPECIALS_SLOT_IDS\.secondary\]\)/);
  assert.match(route, /SALES_SPECIALS_SLOTS\.map/);
  assert.match(route, /filter\(\(promotion\) => promotion\.enabled\)/);
  assert.match(route, /Response\.json\(\{ promotions/);
});

test("admin has independent editors, state, and per-slot request bodies", () => {
  const source = readFileSync(new URL("../app/admin/sales-specials/page.tsx", import.meta.url), "utf8");
  assert.match(source, /lg:grid-cols-2/);
  assert.match(source, /Promotion \{number\}/);
  assert.match(source, /JSON\.stringify\(\{ slot, promotion: promotions\[slot\] \}\)/);
  assert.match(source, /setPromotions\(\(current\) => \(\{ \.\.\.current, \[slot\]/);
});

test("migration safely adds only a disabled idempotent secondary row", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260824005623_add_secondary_homepage_sales_special.sql", import.meta.url), "utf8").toLowerCase();
  assert.match(sql, /check \(id in \('homepage', 'homepage-secondary'\)\)/);
  assert.match(sql, /values \([\s\S]*'homepage-secondary',[\s\S]*false/);
  assert.match(sql, /on conflict \(id\) do nothing/);
  assert.doesNotMatch(sql, /update[\s\S]*homepage/);
  assert.doesNotMatch(sql, /delete[\s\S]*homepage/);
});

test("a missing or malformed row falls back independently without suppressing the other slot", () => {
  const server = readFileSync(new URL("../lib/promotions/server.ts", import.meta.url), "utf8");
  assert.match(server, /primary: byId\.get\(SALES_SPECIALS_SLOT_IDS\.primary\) \?\? \{ \.\.\.DEFAULT_SALES_SPECIALS \}/);
  assert.match(server, /secondary: byId\.get\(SALES_SPECIALS_SLOT_IDS\.secondary\) \?\? \{ \.\.\.DEFAULT_SALES_SPECIALS \}/);
  assert.equal(DEFAULT_SALES_SPECIALS.enabled, false);
});

test("homepage placement remains Hero, Build, Sales & Specials, Price Match, Spotlight", () => {
  for (const file of ["../components/home/DesktopHomepage.tsx", "../components/mobile/MobileHomepage.tsx"]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    const hero = source.search(/<(?:Desktop|Mobile)Hero \/>/);
    const build = source.indexOf("BUILD YOUR SYSTEM", hero);
    const promotion = source.indexOf("<HomeSalesSpecial />");
    const priceMatch = source.indexOf("<HomePriceMatch />");
    const spotlight = source.indexOf("<HomeBusinessSpotlight />");
    assert.ok(hero >= 0 && hero < build && build < promotion && promotion < priceMatch && priceMatch < spotlight);
  }
});
