import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import nextConfig from "../next.config";
import sitemap from "../app/sitemap";
import robots from "../app/robots";
import {
  IDS_CANONICAL_HOST,
  IDS_CANONICAL_ORIGIN,
  IDS_WWW_HOST,
  idsSiteOrigin,
} from "../lib/site-origin";

test("www permanently redirects every path to the apex without an apex loop", async () => {
  const redirects = await nextConfig.redirects?.();
  assert.ok(Array.isArray(redirects));
  const rule = redirects.find((candidate) =>
    candidate.has?.some((condition) =>
      condition.type === "host" && condition.value === IDS_WWW_HOST));
  assert.ok(rule);
  assert.equal(rule.source, "/:path*");
  assert.equal(rule.destination, `${IDS_CANONICAL_ORIGIN}/:path*`);
  assert.equal(rule.permanent, true);
  assert.ok(!rule.has?.some((condition) => condition.value === IDS_CANONICAL_HOST));
  assert.ok(!rule.destination.includes("?"), "Next preserves the original query string when the destination does not replace it.");
});

test("production site URL accepts only the canonical apex origin", () => {
  assert.equal(idsSiteOrigin("http://localhost:3000", { NODE_ENV: "production" }), IDS_CANONICAL_ORIGIN);
  assert.equal(idsSiteOrigin("http://localhost:3000", { NODE_ENV: "production", IDS_SITE_URL: IDS_CANONICAL_ORIGIN }), IDS_CANONICAL_ORIGIN);
  assert.throws(() => idsSiteOrigin("http://localhost:3000", { NODE_ENV: "production", IDS_SITE_URL: `https://${IDS_WWW_HOST}` }), /must use https:\/\/integrityautomowers\.com/);
  assert.throws(() => idsSiteOrigin("http://localhost:3000", { NODE_ENV: "production", IDS_SITE_URL: "https://mower-site.vercel.app" }), /must use https:\/\/integrityautomowers\.com/);
  assert.equal(idsSiteOrigin("http://127.0.0.1:3000", { NODE_ENV: "development" }), "http://127.0.0.1:3000");
});

test("canonical metadata, sitemap and robots use only the apex production origin", () => {
  const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const homepage = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(layout, /metadataBase: new URL\(IDS_CANONICAL_ORIGIN\)/);
  assert.doesNotMatch(layout, /alternates: \{ canonical:/);
  assert.match(homepage, /alternates: \{ canonical: "\/" \}/);
  assert.match(homepage, /openGraph: \{ url: "\/" \}/);
  const entries = sitemap();
  assert.ok(entries.length > 0);
  assert.ok(entries.every((entry) => new URL(entry.url).origin === IDS_CANONICAL_ORIGIN));
  const policy = robots();
  assert.equal(policy.host, IDS_CANONICAL_ORIGIN);
  assert.equal(policy.sitemap, `${IDS_CANONICAL_ORIGIN}/sitemap.xml`);
});

test("active application code contains no www IDS production URL", () => {
  for (const file of [
    "app/layout.tsx",
    "app/sitemap.ts",
    "app/robots.ts",
    "lib/dealer-network/api.ts",
    "lib/demo-scheduling/notifications.ts",
    "lib/service/warranty-pdf.ts",
    "lib/stripe/config-values.ts",
  ]) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /https:\/\/www\.integrityautomowers\.com/);
  }
});
