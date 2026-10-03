import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { REGIONAL_SEO_CASES, EXISTING_SITEMAP_PATHS } from "../tests/fixtures/regional-seo";
import { APPROVED_SEO_PATHS, PRE_BATCH_THREE_PATHS, PROPERTY_SEO_CASES } from "../tests/fixtures/property-seo";
import { assertRawPage, attributes, jsonLdFromHtml, SEO_ORIGIN } from "../tests/helpers/regional-seo-assertions";
import { BATCH_FIVE_SITEMAP_PATHS, GUIDE_SEO_CASES } from "../tests/fixtures/guide-seo";

const origin = process.argv[2] ?? "http://127.0.0.1:3100";
const output = process.argv[3];
const batchThree = process.argv.includes("--batch-three");
const batchFive = process.argv.includes("--batch-five");
const pageCases = batchFive ? GUIDE_SEO_CASES : batchThree ? PROPERTY_SEO_CASES : REGIONAL_SEO_CASES;
const report: Record<string, unknown> = { origin, verifiedAt: new Date().toISOString(), pages: [] };
const pages: Record<string, unknown>[] = [];

async function fetchPage(path: string) {
  const response = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(60000) });
  assert.equal(response.status, 200, `${path}: HTTP status`);
  assert.equal(new URL(response.url).pathname, path, `${path}: no unexpected redirect`);
  return { response, html: await response.text() };
}

async function main() {
  for (const expected of pageCases) {
    const { response, html } = await fetchPage(expected.path);
    const body = assertRawPage(html, expected, response.headers);
    pages.push({ ...expected, ...body, canonical: `${SEO_ORIGIN}${expected.path}`, status: response.status,
      indexable: true, schemas: jsonLdFromHtml(html).map((entity) => entity["@type"]) });
    console.log(`PASS ${expected.path}: HTTP 200, metadata, canonical, H1, schema, ${body.words} visible words, links`);
  }
  report.pages = pages;

  const { html: sitemap } = await fetchPage("/sitemap.xml");
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.equal(locations.length, 33);
  assert.equal(new Set(locations).size, 33);
  assert.deepEqual(locations.sort(), BATCH_FIVE_SITEMAP_PATHS.map((path) => new URL(path, SEO_ORIGIN).href).sort());
  report.sitemap = { status: 200, before: 27, after: 33, locations };
  console.log("PASS sitemap: exactly 33 approved apex URLs; all previous 27 preserved");

  const { html: robots } = await fetchPage("/robots.txt");
  assert.match(robots, /Allow: \/\s/);
  for (const expected of [...REGIONAL_SEO_CASES, ...PROPERTY_SEO_CASES, ...GUIDE_SEO_CASES]) {
    const disallowed = [...robots.matchAll(/^Disallow:\s*(\S+)/gm)].map((match) => match[1]);
    assert.ok(!disallowed.some((prefix) => expected.path.startsWith(prefix)));
  }

  // An offline checkout can verify its static authority pages independently.
  // Production verification always uses the default, complete regression pass.
  if (process.argv.includes("--new-pages-only")) {
    report.existingRoutes = "Not checked: --new-pages-only selected";
    if (output) {
      mkdirSync(output, { recursive: true });
      writeFileSync(`${output}/verification.json`, JSON.stringify(report, null, 2));
    }
    console.log("PASS new-page raw HTML, sitemap and robots verification");
    return;
  }

  const existing: Record<string, unknown>[] = [];
  const existingPaths = batchFive ? APPROVED_SEO_PATHS : batchThree ? PRE_BATCH_THREE_PATHS : EXISTING_SITEMAP_PATHS;
  for (const path of existingPaths) {
    const { response, html } = await fetchPage(path);
    assert.ok(html.includes("<main"), `${path}: meaningful route response`);
    const schemas = jsonLdFromHtml(html);
    for (const type of ["Organization", "WebSite"]) assert.equal(schemas.filter((entity) => entity["@type"] === type).length, 1, `${path}: ${type}`);
    if (["/professional-installation", "/service", "/remote-assistance"].includes(path)) {
      assert.equal(schemas.filter((entity) => entity["@type"] === "Service").length, 1);
      assert.equal(schemas.filter((entity) => entity["@type"] === "BreadcrumbList").length, 1);
    }
    if (["/equipment/lymow-one-plus", "/equipment/yarbo", "/equipment/pandag-g1"].includes(path)) {
      assert.equal(schemas.filter((entity) => entity["@type"] === "Product").length, 1);
      assert.equal(schemas.filter((entity) => entity["@type"] === "BreadcrumbList").length, 1);
    }
    if (["/", "/equipment"].includes(path)) {
      assert.ok([...html.matchAll(/<a\b[^>]*>/g)].some((match) => attributes(match[0]).href === "/robot-mowers"));
    }
    const regional = REGIONAL_SEO_CASES.find((entry) => entry.path === path);
    if (regional) assertRawPage(html, regional, response.headers);
    const property = PROPERTY_SEO_CASES.find((entry) => entry.path === path);
    if (property) assertRawPage(html, property, response.headers);
    if (batchFive) {
      const guideLinks: Record<string, readonly string[]> = {
        "/robot-mowers": [GUIDE_SEO_CASES[0].path],
        "/commercial-robot-mowers": [GUIDE_SEO_CASES[4].path],
        "/robot-mowers/wire-free": [GUIDE_SEO_CASES[1].path, GUIDE_SEO_CASES[2].path],
        "/robot-mowers/hills-rough-terrain": [GUIDE_SEO_CASES[5].path],
        "/robot-mowers/large-acreage": [GUIDE_SEO_CASES[3].path],
        "/robot-mower-financing": [GUIDE_SEO_CASES[3].path, GUIDE_SEO_CASES[4].path],
      };
      const links = [...html.matchAll(/<a\b[^>]*>/g)].map((match) => attributes(match[0]).href);
      for (const target of guideLinks[path] ?? []) assert.ok(links.includes(target), `${path}: contextual guide link ${target}`);
    }
    if (path === "/robot-mowers") {
      const links = [...html.matchAll(/<a\b[^>]*>/g)].map((match) => attributes(match[0]).href);
      for (const guide of PROPERTY_SEO_CASES) assert.ok(links.includes(guide.path), `Hub link: ${guide.path}`);
    }
    existing.push({ path, status: response.status, schemas: schemas.map((entity) => entity["@type"]) });
  }
  report.existingRoutes = existing;
  console.log(`PASS existing routes: all ${existingPaths.length} return HTTP 200; identity, Product, Service and Breadcrumb schema preserved`);
  if (output) {
    mkdirSync(output, { recursive: true });
    writeFileSync(`${output}/verification.json`, JSON.stringify(report, null, 2));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
