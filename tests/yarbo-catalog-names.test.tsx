import assert from "node:assert/strict";
import test from "node:test";
import {
  groupYarboPackages,
  isYarboModuleSlug,
  yarboOptionDisplayName,
  yarboPackageDisplayName,
} from "../lib/catalog/yarbo";
import type { CatalogOption, CatalogPackage } from "../lib/catalog/types";

const option = (slug: string, name: string) =>
  ({ id: slug, slug, name } as CatalogOption);

const catalogPackage = (
  slug: string,
  name: string,
  module: CatalogOption,
) =>
  ({
    id: slug,
    slug,
    name,
    items: [{ option: module, quantity: 1, includedInPackagePrice: true }],
  } as CatalogPackage);

test("Yarbo display helpers use catalog names without substitutions", () => {
  const leafBlower = option("yarbo-leaf-blower-module", "Leaf Blower Custom Name");
  const packageRecord = catalogPackage(
    "yarbo-lawn-leaf",
    "Leaf Blower Custom Package",
    leafBlower,
  );

  assert.equal(yarboOptionDisplayName(leafBlower), "Leaf Blower Custom Name");
  assert.equal(yarboPackageDisplayName(packageRecord), "Leaf Blower Custom Package");
});

test("Yarbo module detection retains every established module slug", () => {
  for (const slug of [
    "yarbo-mower-module",
    "yarbo-lawn-mower-pro-module",
    "yarbo-snow-blower-module",
    "yarbo-leaf-blower-module",
    "yarbo-trimmer-module",
  ]) {
    assert.equal(isYarboModuleSlug(slug), true, slug);
  }
  assert.equal(isYarboModuleSlug("yarbo-tow-hitch"), false);
});

test("Yarbo package grouping continues to remove discontinued Standard Mower packages", () => {
  const standardMower = option("yarbo-mower-module", "Standard Mower");
  const mowerPro = option("yarbo-lawn-mower-pro-module", "Mower Pro");
  const packages = [
    catalogPackage("standard-package", "Standard Package", standardMower),
    catalogPackage("pro-package", "Pro Package", mowerPro),
  ];

  const groupedPackages = groupYarboPackages(packages).flatMap(
    (group) => group.packages,
  );
  assert.deepEqual(groupedPackages.map((item) => item.id), ["pro-package"]);
});
