import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

const visualAssets = [
  "public/images/site/purpose-background.webp",
  "public/images/site/community-flag-background.webp",
  "public/images/site/reviews-background.webp",
  "public/images/site/ids-in-action-background.webp",
  "public/images/site/hearth-financing.webp",
];

test("approved site visuals are optimized WebP assets", () => {
  for (const path of visualAssets) {
    const bytes = readFileSync(path);
    assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF", path);
    assert.equal(bytes.subarray(8, 12).toString("ascii"), "WEBP", path);
    assert.ok(statSync(path).size > 50_000, `${path} should not be an empty placeholder`);
    assert.ok(statSync(path).size < 1_000_000, `${path} should remain web-sized`);
  }
});

test("purpose and community backgrounds are assigned to their intended sections", () => {
  const css = source("app/globals.css");
  assert.match(css, /\.ids-purpose-background[\s\S]*purpose-background\.webp/);
  assert.match(css, /\.ids-community-background[\s\S]*community-flag-background\.webp/);
  assert.match(source("components/home/DesktopHomepage.tsx"), /ids-purpose-background/);
  assert.match(source("components/mobile/MobileHomepage.tsx"), /ids-purpose-background/);
  assert.match(source("components/featured-businesses/HomeBusinessSpotlight.tsx"), /ids-community-background/);
  assert.match(source("app/featured-businesses/page.tsx"), /ids-community-background/);
});

test("reviews and IDS in Action use the approved responsive page backgrounds", () => {
  const css = source("app/globals.css");
  assert.match(css, /\.ids-reviews-background[\s\S]*reviews-background\.webp/);
  assert.match(css, /\.ids-action-background[\s\S]*ids-in-action-background\.webp/);
  assert.match(source("app/reviews/page.tsx"), /ids-reviews-background/);
  assert.match(source("components/reviews/HomeReviews.tsx"), /ids-reviews-background/);
  assert.match(source("app/ids-in-action/page.tsx"), /ids-action-background/);
});

test("Hearth poster remains paired with semantic financing actions and disclosures", () => {
  const financing = source("components/home/HomeFinancing.tsx");
  assert.match(financing, /\/images\/site\/hearth-financing\.webp/);
  assert.doesNotMatch(financing, /hearth-financing-background\.png/);
  assert.match(financing, /View the Hearth financing poster at full size/);
  assert.match(financing, />\s*Check Financing Options/);
  assert.match(financing, /href="tel:\+15126075977"/);
  assert.match(financing, /\(512\) 607-5977/);
  assert.match(financing, /Integrity Distribution Systems is not a lender/);
});
