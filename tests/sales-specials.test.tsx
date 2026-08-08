import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

import { SalesSpecialsBanner } from "../components/promotions/SalesSpecialsBanner";
import { createSalesSpecialsAdminHandlers } from "../lib/promotions/admin-handlers";
import { SALES_SPECIALS_CARTOONS, type SalesSpecialsConfig } from "../lib/promotions/config";
import { toPublicSalesSpecials } from "../lib/promotions/public";
import { validateSalesSpecials } from "../lib/promotions/validation";

const valid: SalesSpecialsConfig = { enabled: true, cartoonKey: "yarbo", headline: "Summer Event", description: "Save while promotional inventory lasts." };

test("enabled promotion renders approved artwork and copy", () => { const html = renderToStaticMarkup(<SalesSpecialsBanner promotion={valid} />); assert.match(html, /Summer Event/); assert.match(html, /promotional inventory lasts/); assert.match(html, new RegExp(SALES_SPECIALS_CARTOONS.yarbo!.src)); });
test("disabled promotion renders nothing", () => assert.equal(renderToStaticMarkup(<SalesSpecialsBanner promotion={{ ...valid, enabled: false }} />), ""));
test("None uses the full text layout without an image or image container", () => { const html = renderToStaticMarkup(<SalesSpecialsBanner promotion={{ ...valid, cartoonKey: "none" }} />); assert.doesNotMatch(html, /<img/); assert.doesNotMatch(html, /Local, server-allowlisted/); assert.match(html, /max-w-5xl/); });
test("every cartoon key maps to its intended local asset and fixed alt text", () => {
  const expected = {
    lymow: { src: "/products/lymow-one-plus-thumb.PNG", alt: "Lymow autonomous mower" },
    yarbo: { src: "/products/yarbo-thumb.png", alt: "Yarbo autonomous mower" },
    pandag: { src: "/products/pandag-thumb.png", alt: "Pandag commercial autonomous mower" },
    all: { src: "/images/cartoon-mowers.png", alt: "Integrity Distribution Systems autonomous mower lineup" },
  } as const;
  for (const [key, intended] of Object.entries(expected)) {
    const cartoon = SALES_SPECIALS_CARTOONS[key as keyof typeof expected];
    assert.equal(cartoon.src, intended.src);
    assert.equal(cartoon.alt, intended.alt);
    const html = renderToStaticMarkup(<SalesSpecialsBanner promotion={{ ...valid, cartoonKey: key as keyof typeof expected }} />);
    assert.match(html, new RegExp(`src="${intended.src}"`));
    assert.match(html, new RegExp(`alt="${intended.alt}"`));
  }
  assert.match(expected.lymow.src, /^\/products\//);
  assert.match(expected.yarbo.src, /^\/products\//);
  assert.match(expected.pandag.src, /^\/products\//);
  assert.match(expected.all.src, /^\/images\//);
});
test("All Three Machines receives a wider image layout", () => { const html = renderToStaticMarkup(<SalesSpecialsBanner promotion={{ ...valid, cartoonKey: "all" }} />); assert.match(html, /max-w-2xl/); assert.match(html, /lg:grid-cols-\[minmax\(0,1\.2fr\)_minmax\(0,1fr\)\]/); });

test("validation rejects invalid cartoon and blank or oversized copy", () => {
  for (const input of [
    { ...valid, cartoonKey: "https://example.com/image.png" },
    { ...valid, headline: "   " },
    { ...valid, description: "   " },
    { ...valid, headline: "x".repeat(121) },
    { ...valid, description: "x".repeat(501) },
  ]) assert.equal(validateSalesSpecials(input).ok, false);
});

test("public projection exposes only rendering fields", () => { const result = toPublicSalesSpecials({ enabled: true, cartoon_key: "pandag", headline: "Event", description: "Details", id: "homepage", created_at: "private", admin_note: "private" }); assert.deepEqual(result, { enabled: true, cartoonKey: "pandag", headline: "Event", description: "Details" }); });

test("admin handlers reject unauthenticated requests", async () => { const handlers = createSalesSpecialsAdminHandlers({ isAdmin: async () => false, read: async () => valid, save: async (value) => value }); assert.equal((await handlers.GET()).status, 401); assert.equal((await handlers.PUT(new Request("http://local", { method: "PUT", body: JSON.stringify(valid) }))).status, 401); });
test("authenticated admin can read and update settings", async () => { let stored = valid; const handlers = createSalesSpecialsAdminHandlers({ isAdmin: async () => true, read: async () => stored, save: async (value) => (stored = value) }); assert.equal((await handlers.GET()).status, 200); const changed = { ...valid, headline: "New event" }; const response = await handlers.PUT(new Request("http://local", { method: "PUT", body: JSON.stringify(changed) })); assert.equal(response.status, 200); assert.equal(stored.headline, "New event"); });

test("homepage placement remains reviews then Sales & Specials then featured equipment", () => { const source = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8"); const reviews = source.indexOf("<HomeReviews />"); const promotion = source.indexOf("<HomeSalesSpecial />"); const featured = source.indexOf("{/* FEATURED EQUIPMENT */}"); assert.ok(reviews >= 0 && reviews < promotion && promotion < featured); });
