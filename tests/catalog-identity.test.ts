import assert from "node:assert/strict";
import test from "node:test";
import { validateCatalogValues } from "../lib/catalog-management/validation";

test("creating an offering accepts its slug while metadata edits preserve existing URLs", () => {
  assert.equal(validateCatalogValues("products", { name: "New product", slug: "new-product", brand: "Test", category: "battery" }, true).slug, "new-product");
  assert.throws(() => validateCatalogValues("products", { slug: "changed-url" }), /URLs are preserved/);
  assert.throws(() => validateCatalogValues("packages", { package_slug: "changed-url" }), /URLs are preserved/);
  assert.equal(validateCatalogValues("packages", { package_name: "Renamed package" }).package_name, "Renamed package");
});

test("catalog media accepts explicit HTTPS or site paths and rejects ambiguous protocol-relative URLs", () => {
  assert.equal(validateCatalogValues("products", { image_url: "https://media.example/image.webp" }).image_url, "https://media.example/image.webp");
  assert.equal(validateCatalogValues("products", { image_url: "/products/image.webp" }).image_url, "/products/image.webp");
  assert.throws(() => validateCatalogValues("products", { image_url: "//media.example/image.webp" }), /HTTPS URL/);
});
