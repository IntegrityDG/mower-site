import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import Acreage, { metadata as acreageMetadata } from "../app/robot-mowers/large-acreage/page";
import Terrain, { metadata as terrainMetadata } from "../app/robot-mowers/hills-rough-terrain/page";
import WireFree, { metadata as wireFreeMetadata } from "../app/robot-mowers/wire-free/page";
import Financing, { metadata as financingMetadata } from "../app/robot-mower-financing/page";
import Hub from "../app/robot-mowers/page";
import Commercial from "../app/commercial-robot-mowers/page";
import sitemap from "../app/sitemap";
import robots from "../app/robots";
import { PRE_BATCH_THREE_PATHS, PROPERTY_SEO_CASES } from "./fixtures/property-seo";
import { BATCH_FIVE_SITEMAP_PATHS } from "./fixtures/guide-seo";
import { REGIONAL_SEO_CASES } from "./fixtures/regional-seo";
import { assertPageBody, attributes, SEO_ORIGIN, textFromHtml } from "./helpers/regional-seo-assertions";

const components = [Acreage, Terrain, WireFree, Financing];
const metadata = [acreageMetadata, terrainMetadata, wireFreeMetadata, financingMetadata];

PROPERTY_SEO_CASES.forEach((expected, index) => {
  test(`${expected.path} renders substantial server content, one H1, required links and breadcrumbs`, () => {
    const html = renderToStaticMarkup(components[index]());
    const result = assertPageBody(html, expected);
    assert.ok(result.words >= 750 && result.words <= 1250, `${expected.path}: ${result.words} visible words`);
    assert.doesNotMatch(readFileSync(`app${expected.path}/page.tsx`, "utf8"), /["']use client["']/);
    assert.doesNotMatch(html, /<form\b|<input\b|<button\b/);
  });
  test(`${expected.path} has its exact static title, description, canonical and indexable robots`, () => {
    const actual = metadata[index];
    assert.equal(actual.title, expected.title);
    assert.equal(actual.description, expected.description);
    assert.ok(expected.description.length >= 140 && expected.description.length <= 165);
    assert.equal(actual.alternates?.canonical, `${SEO_ORIGIN}${expected.path}`);
    assert.deepEqual(actual.robots, { index: true, follow: true });
  });
});

test("Batch 3 metadata is unique across the new guides and previous authority pages", () => {
  const sources = PRE_BATCH_THREE_PATHS.map((path) => path.startsWith("/equipment/") && path !== "/equipment/accessories"
    ? "app/equipment/[slug]/page.tsx" : path === "/reviews" ? "app/reviews/layout.tsx" : `app${path === "/" ? "" : path}/page.tsx`)
    .map((file) => readFileSync(file, "utf8")).join("\n");
  assert.equal(new Set(metadata.map((entry) => entry.title)).size, 4);
  assert.equal(new Set(metadata.map((entry) => entry.description)).size, 4);
  for (const expected of PROPERTY_SEO_CASES) {
    assert.ok(!sources.includes(expected.title));
    assert.ok(!sources.includes(expected.description));
  }
});

test("sitemap contains exactly 33 approved URLs, preserving the Batch 3 baseline", () => {
  assert.equal(PRE_BATCH_THREE_PATHS.length, 23);
  const urls = sitemap().map((entry) => entry.url);
  assert.equal(urls.length, 33);
  assert.equal(new Set(urls).size, 33);
  assert.deepEqual(urls.sort(), BATCH_FIVE_SITEMAP_PATHS.map((path) => new URL(path, SEO_ORIGIN).href).sort());
  for (const url of urls) assert.doesNotMatch(url, /[?#]|\/admin|\/login|\/member|\/received|\/checkout|\/project-quote/);
});

test("the existing robots policy allows all four guides and retains private exclusions", () => {
  const policy = robots();
  const rule = Array.isArray(policy.rules) ? policy.rules[0] : policy.rules;
  assert.equal(rule.allow, "/");
  const exclusions = typeof rule.disallow === "string" ? [rule.disallow] : rule.disallow ?? [];
  for (const { path } of PROPERTY_SEO_CASES) assert.ok(!exclusions.some((prefix) => path.startsWith(prefix)));
  assert.ok(exclusions.includes("/admin/"));
  assert.ok(exclusions.includes("/checkout/"));
});

test("the existing hubs render contextual links while retaining their Batch 2 headings and trails", () => {
  const hub = renderToStaticMarkup(Hub());
  const commercial = renderToStaticMarkup(Commercial());
  assertPageBody(hub, REGIONAL_SEO_CASES[0]);
  assertPageBody(commercial, REGIONAL_SEO_CASES[1]);
  const links = (html: string) => [...html.matchAll(/<a\b[^>]*>/g)].map((match) => attributes(match[0]).href);
  for (const expected of PROPERTY_SEO_CASES) assert.ok(links(hub).includes(expected.path));
  for (const path of ["/robot-mowers/large-acreage", "/robot-mowers/hills-rough-terrain", "/robot-mower-financing"]) assert.ok(links(commercial).includes(path));
});

test("financing uses the existing provider and purchase resources without invented offers", () => {
  const html = renderToStaticMarkup(Financing());
  const text = textFromHtml(html);
  assert.match(text, /does not make lending decisions or guarantee approval/);
  assert.match(text, /not prepaid service charges/);
  assert.match(text, /Remote Support subscription is handled separately/);
  assert.doesNotMatch(text, /\b\d+(?:\.\d+)?\s*%|\$\d|guaranteed approval|zero-interest/i);
  const existingProvider = readFileSync("components/home/HomeFinancing.tsx", "utf8");
  assert.ok(existingProvider.includes("https://app.gethearth.com/requests/930af233-2a7b-4f52-a836-bd11173d6fee"));
});

test("the four topics have original long paragraphs", () => {
  const paragraphs = components.map((component) => new Set([...renderToStaticMarkup(component()).matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)]
    .map((match) => textFromHtml(match[1])).filter((text) => text.split(/\s+/).length > 20)));
  for (let i = 0; i < paragraphs.length; i++) for (let j = i + 1; j < paragraphs.length; j++) {
    assert.equal([...paragraphs[i]].filter((text) => paragraphs[j].has(text)).length, 0);
  }
});
