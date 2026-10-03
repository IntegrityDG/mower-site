import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import RobotMowers, { metadata as hubMetadata } from "../app/robot-mowers/page";
import Commercial, { metadata as commercialMetadata } from "../app/commercial-robot-mowers/page";
import Missouri, { metadata as missouriMetadata } from "../app/robot-mowers/missouri/page";
import Illinois, { metadata as illinoisMetadata } from "../app/robot-mowers/southern-illinois/page";
import Arkansas, { metadata as arkansasMetadata } from "../app/robot-mowers/northeast-arkansas/page";
import Kentucky, { metadata as kentuckyMetadata } from "../app/robot-mowers/western-kentucky/page";
import Tennessee, { metadata as tennesseeMetadata } from "../app/robot-mowers/western-tennessee/page";
import sitemap from "../app/sitemap";
import robots from "../app/robots";
import { EXISTING_SITEMAP_PATHS, REGIONAL_SEO_CASES } from "./fixtures/regional-seo";
import { APPROVED_SEO_PATHS } from "./fixtures/property-seo";
import { assertPageBody, SEO_ORIGIN, textFromHtml } from "./helpers/regional-seo-assertions";

const components = [RobotMowers, Commercial, Missouri, Illinois, Arkansas, Kentucky, Tennessee];
const metadata = [hubMetadata, commercialMetadata, missouriMetadata, illinoisMetadata, arkansasMetadata, kentuckyMetadata, tennesseeMetadata];

REGIONAL_SEO_CASES.forEach((expected, index) => {
  test(`${expected.path} renders substantial server content, one H1, links and breadcrumbs`, () => {
    assertPageBody(renderToStaticMarkup(components[index]()), expected);
    const source = readFileSync(`app${expected.path}/page.tsx`, "utf8");
    assert.doesNotMatch(source, /["']use client["']/);
  });
  test(`${expected.path} has exact static indexable metadata and its own canonical`, () => {
    const actual = metadata[index];
    assert.equal(actual.title, expected.title);
    assert.equal(actual.description, expected.description);
    assert.ok(expected.description.length >= 140 && expected.description.length <= 165);
    assert.equal(actual.alternates?.canonical, `${SEO_ORIGIN}${expected.path}`);
    assert.deepEqual(actual.robots, { index: true, follow: true });
  });
});

test("seven new titles and descriptions are unique across existing indexable pages", () => {
  const existingSources = EXISTING_SITEMAP_PATHS.map((path) => path.startsWith("/equipment/") && path !== "/equipment/accessories"
    ? "app/equipment/[slug]/page.tsx" : path === "/reviews" ? "app/reviews/layout.tsx" : `app${path === "/" ? "" : path}/page.tsx`)
    .map((file) => readFileSync(file, "utf8")).join("\n");
  assert.equal(new Set(metadata.map((entry) => entry.title)).size, 7);
  assert.equal(new Set(metadata.map((entry) => entry.description)).size, 7);
  for (const expected of REGIONAL_SEO_CASES) {
    assert.ok(!existingSources.includes(expected.title), expected.path);
    assert.ok(!existingSources.includes(expected.description), expected.path);
  }
});

test("sitemap preserves Batch 1 and Batch 2 and adds only the four approved Batch 3 guides", () => {
  const urls = sitemap().map((entry) => entry.url);
  const paths = APPROVED_SEO_PATHS;
  assert.equal(urls.length, 27);
  assert.equal(new Set(urls).size, 27);
  assert.deepEqual(urls.sort(), paths.map((path) => new URL(path, SEO_ORIGIN).href).sort());
  for (const url of urls) assert.doesNotMatch(url, /[?#]|\/admin|\/login|\/member|\/received|\/checkout|\/project-quote/);
});

test("robots allow the new public pages without changing the existing private exclusions", () => {
  const policy = robots();
  const rule = Array.isArray(policy.rules) ? policy.rules[0] : policy.rules;
  assert.equal(rule.allow, "/");
  const exclusions = typeof rule.disallow === "string" ? [rule.disallow] : rule.disallow ?? [];
  for (const { path } of REGIONAL_SEO_CASES) assert.ok(!exclusions.some((prefix) => path.startsWith(prefix)));
  assert.ok(exclusions.includes("/admin/"));
  assert.ok(exclusions.includes("/checkout/"));
});

test("homepage variants and equipment introduce the authority architecture contextually", () => {
  for (const file of ["components/home/DesktopHomepage.tsx", "components/mobile/MobileHomepage.tsx", "app/equipment/page.tsx"]) {
    assert.match(readFileSync(file, "utf8"), /href="\/robot-mowers"/);
  }
});

test("regional copy has distinct paragraphs rather than region-name substitutions", () => {
  const paragraphSets = components.slice(2).map((component) => {
    const html = renderToStaticMarkup(component());
    return new Set([...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map((match) => textFromHtml(match[1])).filter((text) => text.split(/\s+/).length > 20));
  });
  for (let i = 0; i < paragraphSets.length; i++) for (let j = i + 1; j < paragraphSets.length; j++) {
    const shared = [...paragraphSets[i]].filter((paragraph) => paragraphSets[j].has(paragraph));
    assert.equal(shared.length, 0, `Regions ${i} and ${j} share long paragraphs`);
  }
});
