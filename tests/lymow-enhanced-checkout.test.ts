import assert from "node:assert/strict";
import test from "node:test";
import { resolveEquipmentCatalogPricing } from "../lib/checkout/equipment-pricing";
import type { CheckoutCatalog } from "../lib/checkout/eligibility";
import { checkoutRequest, priceRow } from "./helpers/yarbo-preorder-fixture";
function fixture(amp = "5a"): CheckoutCatalog {
  const base = { ...priceRow(10000), public_status: "active" };
  return {
    product: { ...base, id: "lymow", slug: "lymow-one-plus", brand: "Lymow", name: "Lymow" },
    variants: ["5a", "10a"].map(a => ({ ...base, id: a, product_id: "lymow", variant_slug: `lymow-one-plus-${a}`, name: a, description: null, sku: a })),
    options: ["5a", "10a", "kit"].map(a => ({ ...base, id: a + "-option", product_id: "lymow", option_slug: a === "kit" ? "lymow-one-plus-enhanced-discharge-kit" : `lymow-${a}-charger`, name: a, description: null, minimum_quantity: 0, maximum_quantity: 10 })),
    packages: [{ ...base, id: "package", product_id: "lymow", package_slug: `lymow-one-plus-${amp}-enhanced-discharge`, package_name: "Enhanced", description: null, admin_managed: true }],
    packageItems: [{ id: "mower", package_id: "package", component_variant_id: amp, option_id: null, quantity: 1, included_in_package_price: true }, { id: "kit", package_id: "package", option_id: "kit-option", quantity: 1, included_in_package_price: true }],
    variantOptions: ["5a", "10a"].flatMap(a => [{ id: a, variant_id: a, option_id: a + "-option", relationship_type: "defines_variant" }, { id: a + "kit", variant_id: a, option_id: "kit-option", relationship_type: "compatible" }]),
  };
}
function request(amp = "5a") { return { ...checkoutRequest(), selection: { productId: "lymow", variantId: amp, packageId: "package", purchaseMode: "standard" as const, includeBaseProduct: false, options: [] as {optionId:string;quantity:number}[] } }; }
for (const amp of ["5a", "10a"]) test(`${amp} Enhanced charges one package with mower and kit included`, () => {
  const result = resolveEquipmentCatalogPricing(request(amp), fixture(amp));
  assert.equal(result.chargeableItems.length, 1);
  assert.equal(result.subtotalCents, 10000);
  assert.equal(result.includedPackageComponents.length, 2);
  assert.equal(result.variant?.slug, `lymow-one-plus-${amp}`);
});
const cases: [string, (c: CheckoutCatalog, r: ReturnType<typeof request>) => void][] = [
  ["wrong selected variant", (_,r) => {r.selection.variantId="10a";}],
  ["missing selected variant", (_,r) => {r.selection.variantId="";}],
  ["wrong physical variant", c => {c.packageItems[0].component_variant_id="10a";}],
  ["double mower", c => {c.packageItems[0].quantity=2;}],
  ["double kit", c => {c.packageItems[1].quantity=2;}],
  ["extra component", c => {c.packageItems.push({...c.packageItems[1],id:"extra"});}],
  ["not included", c => {c.packageItems[1].included_in_package_price=false;}],
  ["wrong kit", c => {c.options[2].option_slug="different-kit";}],
  ["inactive kit", c => {c.options[2].public_status="unavailable";}],
  ["inactive mower", c => {c.variants[0].public_status="unavailable";}],
  ["inactive charger", c => {c.options[0].public_status="unavailable";}],
  ["wrong defining charger", c => {c.variantOptions[0].option_id="10a-option";}],
  ["missing defining charger", c => {c.variantOptions.splice(0,1);}],
  ["excluded kit", c => {c.variantOptions[1].relationship_type="excluded";}],
  ["kit only compatible with other variant", c => {c.variantOptions.splice(1,1);}],
  ["charged duplicate kit", (_,r) => {r.selection.options=[{optionId:"kit-option",quantity:1}];}],
  ["charged duplicate charger", (_,r) => {r.selection.options=[{optionId:"5a-option",quantity:1}];}],
  ["double base", (_,r) => {r.selection.includeBaseProduct=true;}],
];
for (const [label,mutate] of cases) test(`Enhanced rejects ${label}`, () => {const c=fixture();const r=request();mutate(c,r);assert.throws(()=>resolveEquipmentCatalogPricing(r,c));});
