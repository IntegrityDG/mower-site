import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { REGIONAL_SEO_CASES, EXISTING_SITEMAP_PATHS } from "../tests/fixtures/regional-seo";
import { assertRawPage, attributes, jsonLdFromHtml, SEO_ORIGIN } from "../tests/helpers/regional-seo-assertions";

const origin = process.argv[2] ?? "http://127.0.0.1:3100";
const output = process.argv[3];
const report: Record<string, unknown> = { origin, verifiedAt: new Date().toISOString(), pages: [] };
const pages: Record<string, unknown>[] = [];

async function fetchPage(path: string) {
  const response = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(60000) });
  assert.equal(response.status, 200, `${path}: HTTP status`);
  assert.equal(new URL(response.url).pathname, path, `${path}: no unexpected redirect`);
  return { response, html: await response.text() };
}

async function main() {
  for (const expected of REGIONAL_SEO_CASES) {
    const { response, html } = await fetchPage(expected.path);
    const body = assertRawPage(html, expected, response.headers);
    pages.push({ ...expected, ...body, canonical: `${SEO_ORIGIN}${expected.path}`, status: response.status });
    console.log(`PASS ${expected.path}: HTTP 200, metadata, canonical, H1, schema, ${body.words} visible words, links`);
  }
  report.pages = pages;

  const { html: sitemap } = await fetchPage("/sitemap.xml");
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.equal(locations.length, 23);
  assert.equal(new Set(locations).size, 23);
  assert.deepEqual(locations.sort(), [...EXISTING_SITEMAP_PATHS, ...REGIONAL_SEO_CASES.map((entry) => entry.path)].map((path) => new URL(path, SEO_ORIGIN).href).sort());
  report.sitemap = { status: 200, before: 16, after: 23, locations };
  console.log("PASS sitemap: exactly 23 approved apex URLs; all existing 16 preserved");

  const { html: robots } = await fetchPage("/robots.txt");
  assert.match(robots, /Allow: \/\s/);
  for (const expected of REGIONAL_SEO_CASES) {
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
  for (const path of EXISTING_SITEMAP_PATHS) {
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
    existing.push({ path, status: response.status, schemas: schemas.map((entity) => entity["@type"]) });
  }
  report.existingRoutes = existing;
  console.log("PASS existing routes: all 16 return HTTP 200; identity, Product, Service and Breadcrumb schema preserved");
  if (output) {
    mkdirSync(output, { recursive: true });
    writeFileSync(`${output}/verification.json`, JSON.stringify(report, null, 2));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
