import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import Hub, { metadata as hubMetadata } from "../app/robot-mower-guides/page";
import Internet, { metadata as internetMetadata } from "../app/robot-mower-guides/do-robot-mowers-need-internet/page";
import Navigation, { metadata as navigationMetadata } from "../app/robot-mower-guides/rtk-gps-vslam-vision/page";
import ZeroTurn, { metadata as zeroTurnMetadata } from "../app/robot-mower-guides/robot-mower-vs-zero-turn/page";
import Roi, { metadata as roiMetadata } from "../app/robot-mower-guides/commercial-roi-labor-planning/page";
import Tracked, { metadata as trackedMetadata } from "../app/robot-mower-guides/tracked-vs-wheeled/page";
import RobotMowers from "../app/robot-mowers/page";
import Commercial from "../app/commercial-robot-mowers/page";
import WireFree from "../app/robot-mowers/wire-free/page";
import Terrain from "../app/robot-mowers/hills-rough-terrain/page";
import Acreage from "../app/robot-mowers/large-acreage/page";
import Financing from "../app/robot-mower-financing/page";
import sitemap from "../app/sitemap";
import robots from "../app/robots";
import { GUIDE_SEO_CASES, BATCH_FIVE_SITEMAP_PATHS } from "./fixtures/guide-seo";
import { APPROVED_SEO_PATHS, PROPERTY_SEO_CASES } from "./fixtures/property-seo";
import { REGIONAL_SEO_CASES } from "./fixtures/regional-seo";
import { assertPageBody, attributes, jsonLdFromHtml, SEO_ORIGIN, textFromHtml } from "./helpers/regional-seo-assertions";

const components = [Hub, Internet, Navigation, ZeroTurn, Roi, Tracked];
const metadata = [hubMetadata, internetMetadata, navigationMetadata, zeroTurnMetadata, roiMetadata, trackedMetadata];
const hrefs = (html: string) => [...html.matchAll(/<a\b[^>]*>/g)].map((match) => attributes(match[0]).href);

GUIDE_SEO_CASES.forEach((expected, index) => {
  test(`${expected.path}: original server content, one H1, hub trail and topic links`, () => {
    const html = renderToStaticMarkup(components[index]());
    const body = assertPageBody(html, expected);
    if (index > 0) assert.ok(body.words <= 1400, `${body.words} words`);
    assert.ok([...html.matchAll(/<h2\b/g)].length >= 4);
    assert.doesNotMatch(readFileSync(`app${expected.path}/page.tsx`, "utf8"), /["']use client["']/);
    assert.doesNotMatch(html, /<form\b|<input\b|<button\b/);
    assert.deepEqual(jsonLdFromHtml(html).map((entry) => entry["@type"]), ["BreadcrumbList"]);
    console.log(`${expected.path}: ${body.words} visible words`);
  });
  test(`${expected.path}: exact unique metadata, canonical and indexable robots`, () => {
    const actual = metadata[index];
    assert.equal(actual.title, expected.title);
    assert.equal(actual.description, expected.description);
    assert.ok(expected.description.length >= 140 && expected.description.length <= 165);
    assert.equal(actual.alternates?.canonical, `${SEO_ORIGIN}${expected.path}`);
    assert.deepEqual(actual.robots, { index: true, follow: true });
  });
});

test("Batch 5 sitemap is exactly 33 approved routes with all prior 27 preserved", () => {
  const urls = sitemap().map((entry) => entry.url);
  assert.equal(APPROVED_SEO_PATHS.length, 27);
  assert.equal(urls.length, 33);
  assert.equal(new Set(urls).size, 33);
  assert.deepEqual(urls.sort(), BATCH_FIVE_SITEMAP_PATHS.map((path) => new URL(path, SEO_ORIGIN).href).sort());
  for (const path of APPROVED_SEO_PATHS) assert.ok(urls.includes(new URL(path, SEO_ORIGIN).href));
  for (const url of urls) assert.doesNotMatch(url, /[?#]|\/admin|\/login|\/member|\/received|\/checkout|\/project-quote/);
});

test("guide metadata stays distinct from the prior authority and product targeting", () => {
  assert.equal(new Set(metadata.map((entry) => entry.title)).size, 6);
  assert.equal(new Set(metadata.map((entry) => entry.description)).size, 6);
  const sources = APPROVED_SEO_PATHS.map((path) => path.startsWith("/equipment/") && path !== "/equipment/accessories"
    ? "app/equipment/[slug]/page.tsx" : path === "/reviews" ? "app/reviews/layout.tsx" : `app${path === "/" ? "" : path}/page.tsx`)
    .map((file) => readFileSync(file, "utf8")).join("\n");
  for (const expected of GUIDE_SEO_CASES) {
    assert.ok(!sources.includes(expected.title));
    assert.ok(!sources.includes(expected.description));
  }
});

test("small contextual inbound links are server-rendered on the six relevant authority pages", () => {
  const cases = [
    [RobotMowers, ["/robot-mower-guides"]],
    [Commercial, [GUIDE_SEO_CASES[4].path]],
    [WireFree, [GUIDE_SEO_CASES[1].path, GUIDE_SEO_CASES[2].path]],
    [Terrain, [GUIDE_SEO_CASES[5].path]],
    [Acreage, [GUIDE_SEO_CASES[3].path]],
    [Financing, [GUIDE_SEO_CASES[3].path, GUIDE_SEO_CASES[4].path]],
  ] as const;
  for (const [component, required] of cases) {
    const links = hrefs(renderToStaticMarkup(component()));
    for (const path of required) assert.ok(links.includes(path));
  }
  // The established page headings and breadcrumb targets retain their original intent.
  [RobotMowers, Commercial].forEach((page, index) => assertPageBody(renderToStaticMarkup(page()), REGIONAL_SEO_CASES[index]));
  [Acreage, Terrain, WireFree, Financing].forEach((page, index) => assertPageBody(renderToStaticMarkup(page()), PROPERTY_SEO_CASES[index]));
});

test("guides retain the existing robots exclusions and omit unverified Article authorship/dates", () => {
  const policy = robots();
  const rule = Array.isArray(policy.rules) ? policy.rules[0] : policy.rules;
  const exclusions = typeof rule.disallow === "string" ? [rule.disallow] : rule.disallow ?? [];
  assert.equal(rule.allow, "/");
  assert.ok(exclusions.includes("/admin/"));
  assert.ok(exclusions.includes("/checkout/"));
  for (const expected of GUIDE_SEO_CASES) assert.ok(!exclusions.some((prefix) => expected.path.startsWith(prefix)));
  for (const page of components) {
    const schemas = jsonLdFromHtml(renderToStaticMarkup(page()));
    assert.ok(!schemas.some((entry) => ["Article", "FAQPage", "HowTo"].includes(String(entry["@type"]))));
    assert.ok(!schemas.some((entry) => "author" in entry || "datePublished" in entry));
  }
});

test("articles have distinct long paragraphs and preserve the key claim limitations", () => {
  const html = components.slice(1).map((page) => renderToStaticMarkup(page()));
  const paragraphs = html.map((body) => new Set([...body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)]
    .map((match) => textFromHtml(match[1])).filter((text) => text.split(/\s+/).length > 20)));
  for (let i = 0; i < paragraphs.length; i++) for (let j = i + 1; j < paragraphs.length; j++) {
    assert.equal([...paragraphs[i]].filter((text) => paragraphs[j].has(text)).length, 0);
  }
  assert.match(textFromHtml(html[0]), /do not, by themselves, establish unlimited cellular data/);
  assert.match(textFromHtml(html[1]), /no universally superior navigation technology/);
  assert.match(textFromHtml(html[2]), /Neither approach automatically costs less/);
  assert.match(textFromHtml(html[3]), /not evidence of regulatory approval/);
  assert.match(textFromHtml(html[3]), /count acquisition cost twice/);
  assert.match(textFromHtml(html[4]), /Neither design is the best choice for every lawn/);
  for (const body of html) assert.doesNotMatch(textFromHtml(body), /\$\d|\b\d+(?:\.\d+)?\s*%/);
});
