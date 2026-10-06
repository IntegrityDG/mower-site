import assert from "node:assert/strict";
import test from "node:test";
import { managedCustomerPrice } from "../lib/catalog-management/public-result";
import { publicProduct } from "./helpers/yarbo-preorder-fixture";

test("catalog save confirmation uses the selected public authority and keeps package price independent", () => {
  const product = publicProduct();
  const catalog = { products: [product], generatedAt: "2026-10-05T12:00:00Z" };
  assert.equal(managedCustomerPrice("products", product.id, catalog), product.currentPriceCents);
  const pkg = product.packages[0];
  const before = managedCustomerPrice("packages", pkg.id, catalog);
  pkg.items.forEach((item) => { if (item.option) item.option.currentPriceCents = 9999999; });
  assert.equal(managedCustomerPrice("packages", pkg.id, catalog), before);
  pkg.corePrices!.find((row) => row.priceMode === "package")!.isAvailable = false;
  assert.equal(managedCustomerPrice("packages", pkg.id, catalog), null);
});

test("catalog save confirmation preserves an authoritative explicit NULL and missing public offering", () => {
  const product = publicProduct();
  const catalog = { products: [product], generatedAt: "2026-10-05T12:00:00Z" };
  product.currentPriceCents = null;
  assert.equal(managedCustomerPrice("products", product.id, catalog), null);
  assert.equal(managedCustomerPrice("products", product.id, { ...catalog, products: [] }), null);
  const core = product.variants.find((row) => row.slug === "yarbo-y40p")!;
  core.showPublicPrice = false;
  assert.equal(managedCustomerPrice("variants", core.id, catalog), null);
});
