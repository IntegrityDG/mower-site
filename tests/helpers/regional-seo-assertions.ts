import assert from "node:assert/strict";

export type SeoPageExpectation = {
  path: string; breadcrumb: readonly string[]; title: string; description: string;
  h1: string; text: string; links: readonly string[];
  breadcrumbPaths?: readonly string[];
  minWords?: number;
};

export const SEO_ORIGIN = "https://integrityautomowers.com";

export function decodeHtml(value: string) {
  return value.replace(/&(?:amp|#38);/g, "&").replace(/&(?:quot|#34);/g, '"')
    .replace(/&(?:apos|#x27|#39);/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

export function textFromHtml(html: string) {
  return decodeHtml(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ").trim();
}

export function attributes(tag: string) {
  return Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map((match) => [match[1], decodeHtml(match[2])]));
}

export function jsonLdFromHtml(html: string): Record<string, unknown>[] {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
    .filter((match) => attributes(match[1]).type === "application/ld+json")
    .flatMap((match) => {
      const parsed = JSON.parse(match[2]);
      assert.equal(parsed["@context"], "https://schema.org");
      return parsed["@graph"] ?? [parsed];
    });
}

export function assertPageBody(html: string, expected: SeoPageExpectation) {
  const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)];
  assert.equal(h1s.length, 1, `${expected.path}: exactly one H1`);
  assert.equal(textFromHtml(h1s[0][1]), expected.h1);
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1];
  assert.ok(main, `${expected.path}: semantic main`);
  const bodyText = textFromHtml(main);
  assert.ok(bodyText.includes(expected.text), `${expected.path}: distinctive visible content`);
  const words = bodyText.split(/\s+/).length;
  assert.ok(words >= (expected.minWords ?? 650), `${expected.path}: substantial visible content (${words} words)`);
  const hrefs = [...main.matchAll(/<a\b[^>]*>/g)].map((match) => attributes(match[0]).href);
  for (const href of expected.links) assert.ok(hrefs.includes(href), `${expected.path}: server-rendered link ${href}`);
  const breadcrumbs = jsonLdFromHtml(html).filter((entity) => entity["@type"] === "BreadcrumbList");
  assert.equal(breadcrumbs.length, 1, `${expected.path}: one BreadcrumbList`);
  const paths = expected.breadcrumbPaths ?? (expected.breadcrumb.length === 3 ? ["/", "/robot-mowers", expected.path] : ["/", expected.path]);
  assert.deepEqual(breadcrumbs[0].itemListElement, expected.breadcrumb.map((name, index) => ({
    "@type": "ListItem", position: index + 1, name,
    item: index === 0 ? SEO_ORIGIN : `${SEO_ORIGIN}${paths[index]}`,
  })));
  return { words, links: [...new Set(hrefs)], breadcrumb: expected.breadcrumb.join(" → ") };
}

export function assertRawPage(html: string, expected: SeoPageExpectation, headers?: Headers) {
  const head = html.match(/<head>([\s\S]*?)<\/head>/)?.[1];
  assert.ok(head, `${expected.path}: initial head metadata`);
  const titles = [...head.matchAll(/<title>([\s\S]*?)<\/title>/g)];
  assert.equal(titles.length, 1);
  assert.equal(decodeHtml(titles[0][1]), expected.title);
  const meta = [...html.matchAll(/<meta\b[^>]*>/g)].map((match) => attributes(match[0]));
  const descriptions = meta.filter((entry) => entry.name === "description");
  assert.equal(descriptions.length, 1);
  assert.equal(descriptions[0].content, expected.description);
  const headMeta = [...head.matchAll(/<meta\b[^>]*>/g)].map((match) => attributes(match[0]));
  assert.equal(headMeta.find((entry) => entry.name === "description")?.content, expected.description);
  const canonicals = [...html.matchAll(/<link\b[^>]*>/g)].map((match) => attributes(match[0])).filter((entry) => entry.rel === "canonical");
  assert.equal(canonicals.length, 1);
  assert.equal(canonicals[0].href, `${SEO_ORIGIN}${expected.path}`);
  const robots = meta.filter((entry) => ["robots", "googlebot", "bingbot"].includes(entry.name));
  for (const entry of robots) assert.doesNotMatch(entry.content, /noindex|none/i);
  assert.doesNotMatch(headers?.get("x-robots-tag") ?? "", /noindex|none/i);
  const schemas = jsonLdFromHtml(html);
  for (const type of ["Organization", "WebSite"]) assert.equal(schemas.filter((entity) => entity["@type"] === type).length, 1);
  assert.deepEqual(schemas.map((entity) => entity["@type"]).sort(), ["BreadcrumbList", "Organization", "WebSite"]);
  return assertPageBody(html, expected);
}
