import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import ProductConfiguration from "../components/customer-paths/purchase/ProductConfiguration";
import YarboPackageGroupSelector from "../components/customer-paths/purchase/YarboPackageGroupSelector";
import { YARBO_PACKAGE_GROUPS, groupYarboPackages, inferYarboPackageGroup } from "../lib/catalog/yarbo";
import { productBuildIsComplete, resolveBuildSelection } from "../lib/catalog/selection";
import { yarboCoreCanBeSelected } from "../lib/catalog/yarbo-core";
import { resolveEquipmentCatalogPricing } from "../lib/checkout/equipment-pricing";
import type { CatalogPackage, ProductBuildSelection } from "../lib/catalog/types";
import { checkoutCatalog, checkoutRequest, during, publicProduct } from "./helpers/yarbo-preorder-fixture";

const selection: ProductBuildSelection = {
  variantId: "y40", packageId: "yarbo-pro-snow", purchaseMode: "complete-system",
  includeBaseProduct: false, optionQuantities: {},
};
const configuration = (product = publicProduct()) => renderToStaticMarkup(<ProductConfiguration
  product={product} selection={selection} onSelectVariant={() => {}} onSelectPackage={() => {}}
  onSelectPurchaseMode={() => {}} onToggleBaseProduct={() => {}} onChangeOptionQuantity={() => {}} />);
const selector = (selectedGroup: "mower-pro" | "core-utility") => renderToStaticMarkup(
  <YarboPackageGroupSelector groups={YARBO_PACKAGE_GROUPS} selectedGroup={selectedGroup} onSelectGroup={() => {}} />
);
const button = (html: string, label: string) => html.match(/<button\b[\s\S]*?<\/button>/g)?.find(item => item.includes(label)) ?? "";

test("customer package categories are exactly Mower Pro Packages and Core + Utility", () => {
  assert.deepEqual(YARBO_PACKAGE_GROUPS.map(({ key, label }) => ({ key, label })), [
    { key: "mower-pro", label: "Mower Pro Packages" }, { key: "core-utility", label: "Core + Utility" },
  ]);
  const html = selector("mower-pro");
  assert.equal((html.match(/<button\b/g) ?? []).length, 2);
  assert.doesNotMatch(html, /Mower Packages|Standard Mower|All Packages|mowing/);
});

test("module identity determines categories, without a Standard Mower inference bucket", () => {
  const product = publicProduct();
  const pro = product.packages.find(p => p.slug === "yarbo-pro-snow")!;
  const leaf = product.packages.find(p => p.slug === "yarbo-leaf-blower")!;
  assert.equal(inferYarboPackageGroup({ ...pro, name: "Utility name" }), "mower-pro");
  assert.equal(inferYarboPackageGroup({ ...leaf, name: "Mower Pro name" }), "core-utility");
  const standard = { ...leaf, items: [{ ...leaf.items[0], option: { ...leaf.items[0].option!, slug: "yarbo-mower-module" } }] };
  assert.equal(inferYarboPackageGroup(standard), "core-utility");
});

test("discontinued Standard Mower remains excluded for both catalog component representations", () => {
  const product = publicProduct();
  const leaf = product.packages.find(p => p.slug === "yarbo-leaf-blower")!;
  const standardOption: CatalogPackage = { ...leaf, id: "legacy-option", items: [{ ...leaf.items[0], option: { ...leaf.items[0].option!, slug: "yarbo-mower-module" } }] };
  const standardComponent: CatalogPackage = { ...leaf, id: "legacy-component", items: [{ ...leaf.items[0], option: null, component: { id: "old-module", kind: "option", name: "Standard Mower", slug: "yarbo-mower-module", isAvailable: false } }] };
  const ids = groupYarboPackages([...product.packages, standardOption, standardComponent]).flatMap(g => g.packages.map(p => p.id));
  assert.deepEqual(ids.sort(), product.packages.map(p => p.id).sort());
});

test("complete-system builder defaults to Mower Pro and immediately renders the utility control", () => {
  const html = configuration();
  assert.match(button(html, "Mower Pro Packages"), /aria-pressed="true"/);
  assert.match(button(html, "Core + Utility"), /aria-pressed="false"/);
  assert.match(button(html, "Core + Utility"), /View packages/);
  assert.match(html, /Yarbo Lawn Mower|Lawn Mower Pro/);
  assert.doesNotMatch(html, /Mower Packages|All Packages/);
});

test("selector helper copy and utility badge are visible, with non-color selected text", () => {
  const html = selector("mower-pro");
  assert.match(html, /Choose a package type/);
  assert.match(html, /More Yarbo packages are available — select a category below\./);
  assert.match(button(html, "Core + Utility"), /More options/);
  assert.match(button(html, "Mower Pro Packages"), /Selected/);
  assert.match(html, /role="group" aria-label="Yarbo package type"/);
});

test("mobile selector uses a wrapping one-column grid and full-width controls without horizontal scrolling", () => {
  const html = selector("mower-pro");
  assert.match(html, /grid min-w-0 gap-4 sm:grid-cols-2/);
  for (const label of ["Mower Pro Packages", "Core + Utility"]) {
    assert.match(button(html, label), /min-h-24 w-full min-w-0/);
    assert.doesNotMatch(button(html, label), /hidden|whitespace-nowrap|shrink-0/);
  }
  assert.doesNotMatch(html, /overflow-x|flex-nowrap/);
});

test("native buttons have pressed state, visible keyboard focus, and a distinct filled selection", () => {
  for (const selected of ["mower-pro", "core-utility"] as const) {
    const html = selector(selected);
    const selectedLabel = selected === "mower-pro" ? "Mower Pro Packages" : "Core + Utility";
    const chosen = button(html, selectedLabel);
    assert.match(chosen, /type="button" aria-pressed="true"/);
    assert.match(chosen, /bg-slate-950 text-white/);
    assert.match(chosen, /Selected/);
    assert.doesNotMatch(chosen, /yarbo-package-type-attention/);
    assert.equal((html.match(/focus-visible:outline-4/g) ?? []).length, 2);
    assert.doesNotMatch(html, /tabindex="-1"/i);
  }
});

test("inactive attention is a finite slow shadow glow, with a static reduced-motion alternative", () => {
  const html = selector("mower-pro");
  assert.match(button(html, "Core + Utility"), /yarbo-package-type-attention/);
  const css = readFileSync("app/globals.css", "utf8");
  assert.match(css, /animation: yarbo-package-type-glow 1\.2s ease-in-out 3;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.yarbo-package-type-attention\s*\{\s*animation: none;\s*box-shadow:/);
  const glow = css.match(/@keyframes yarbo-package-type-glow[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(glow, /box-shadow:/);
  assert.doesNotMatch(glow, /opacity|visibility|background/);
  assert.doesNotMatch(css, /yarbo-package-type-glow[^;]*infinite/);
});

test("utility group reaches Leaf Blower and Snow Blower Gen 2 + Leaf Blower using module relationships", () => {
  const product = publicProduct();
  product.packages.find(p => p.slug === "yarbo-leaf-blower")!.name = "Yarbo Leaf Blower";
  product.packages.find(p => p.slug === "yarbo-snow-leaf")!.name = "Yarbo Snow Blower Gen 2 + Leaf Blower";
  const groups = groupYarboPackages(product.packages);
  const utility = groups.find(g => g.key === "core-utility")!;
  assert.ok(utility.packages.some(p => p.name === "Yarbo Leaf Blower"));
  assert.ok(utility.packages.some(p => p.name === "Yarbo Snow Blower Gen 2 + Leaf Blower"));
  for (const p of groups.find(g => g.key === "mower-pro")!.packages) {
    assert.ok(p.items.some(i => i.option?.slug === "yarbo-lawn-mower-pro-module"));
  }
  assert.ok(!groups.flatMap(g => g.packages).some(p => p.slug === "yarbo-trimmer"));
});

test("category navigation keeps package objects, prices, contents, Core selection, and checkout totals intact", () => {
  const product = publicProduct();
  const before = structuredClone(product);
  const groups = groupYarboPackages(product.packages);
  for (const p of groups.flatMap(g => g.packages)) assert.equal(p, product.packages.find(original => original.id === p.id));
  assert.deepEqual(product, before);
  for (const variantId of ["y40", "y40p"]) {
    for (const p of groups.flatMap(g => g.packages)) {
      const build = { ...selection, packageId: p.id, variantId };
      assert.equal(productBuildIsComplete(product, build), true);
      assert.equal(yarboCoreCanBeSelected(product, product.variants.find(v => v.id === variantId)!, p), true);
      assert.equal(resolveBuildSelection(product, build).equipmentTotalCents,
        resolveEquipmentCatalogPricing(checkoutRequest(variantId, p.id), checkoutCatalog(), [], during).subtotalCents);
    }
  }
  const html = configuration();
  assert.equal((html.match(/name="yarbo-complete-core"/g) ?? []).length, 2);
  assert.match(html, /<input(?=[^>]*value="y40")(?=[^>]*checked)[^>]*>/);
});
