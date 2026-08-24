import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  HOME_VIEWS,
  homeUrlForView,
  homeViewFromHash,
  homeViewFromLocation,
} from "../lib/homepage-navigation";

const source = (path: string) => readFileSync(path, "utf8");

test("legacy purchase URLs resolve build without losing product preselection", () => {
  for (const product of ["yarbo", "lymow-one-plus"]) {
    const url = new URL(`https://ids.test/?product=${product}#location-and-customer-path`);
    assert.equal(homeViewFromLocation(url), "build");
    assert.equal(url.searchParams.get("product"), product);
    assert.equal(url.hash, "#location-and-customer-path");
  }
  assert.equal(homeViewFromHash("#location-and-customer-path"), "build");
});

test("direct desktop and mobile hashes share one safe view mapping", () => {
  for (const view of HOME_VIEWS) {
    assert.equal(homeViewFromHash(view === "home" ? "" : `#${view}`), view);
  }
  assert.equal(homeViewFromHash("#unknown-view"), "home");
  assert.equal(homeViewFromHash("#home"), "home");
});

test("canonical navigation hashes preserve the current query string", () => {
  const location = new URL("https://ids.test/?product=yarbo#location-and-customer-path");
  assert.equal(homeUrlForView(location, "build"), "/?product=yarbo#build");
  assert.equal(homeUrlForView(location, "machines"), "/?product=yarbo#machines");
  assert.equal(homeUrlForView(location, "home"), "/?product=yarbo");
  assert.doesNotMatch(homeUrlForView(location, "build"), /location-and-customer-path/);
});

test("desktop and mobile initialize and restore popstate from the shared URL source", () => {
  for (const path of ["components/home/DesktopHomepage.tsx", "components/mobile/MobileHomepage.tsx"]) {
    const homepage = source(path);
    assert.match(homepage, /setView\(homeViewFromLocation\(window\.location\)\)/);
    assert.match(homepage, /const onPopState = \(\) =>/);
    assert.doesNotMatch(homepage, /event\.state\?\.ids(?:Desktop|Mobile)View/);
    assert.match(homepage, /homeUrlForView\(window\.location, next\)/);
  }
});

test("existing public purchase links retain the compatible legacy anchor", () => {
  for (const path of [
    "components/equipment/CatalogHeader.tsx",
    "components/equipment/ProductBuildCta.tsx",
    "components/equipment/AccessoryCatalog.tsx",
    "app/equipment/[slug]/page.tsx",
  ]) {
    assert.match(source(path), /#location-and-customer-path/);
  }
});
