import assert from "node:assert/strict";
import test from "node:test";
import { createPackageCorePriceAdminHandlers, validatePackageCorePricePatch, type PackageCorePriceAdminRow } from "../lib/admin-pricing/package-core-prices";
import { validatePricingPatch } from "../lib/admin-pricing/validation";
import { priceFromRow } from "../lib/catalog/public-price";
import { operationalPriceCents } from "../lib/checkout/operational-price";

const id = "11111111-1111-4111-8111-111111111111";
const version = "2026-10-05T12:00:00.000Z";
const price = {
  display_msrp_price_cents: 779900, regular_price_cents: null, sale_price_cents: 739900,
  sale_starts_at: "2026-10-06T05:00:00.000Z", sale_ends_at: "2026-10-13T05:00:00.000Z",
  promotion_label: "Fall Sale", show_public_price: true, contact_for_pricing: false,
  public_status: "active", updated_at: version,
};

test("manufacturer sheet blank IDS retains the existing program policy before, during, and after Fall Sale", () => {
  const start = Date.parse(price.sale_starts_at);
  const end = Date.parse(price.sale_ends_at);
  for (const [at, program, expected, state] of [
    [start - 1, false, 779900, "upcoming"], [start, false, 739900, "active"],
    [end - 1, true, 739900, "active"], [end, false, 779900, "ended"],
    [start - 1, true, null, "upcoming"], [end, true, null, "ended"],
  ] as const) {
    const publicPrice = priceFromRow(price, at, program);
    assert.equal(publicPrice.currentPriceCents, expected);
    assert.equal(publicPrice.salePhase, state);
    assert.equal(operationalPriceCents(price, at, program), expected);
    assert.equal(publicPrice.regularPriceCents, null);
  }
});

test("each catalog and Core price source accepts editable private cost and blank IDS", () => {
  for (const kind of ["products", "variants", "packages", "options"] as const) {
    assert.deepEqual(validatePricingPatch(kind, { display_msrp_price_cents: 100, regular_price_cents: null, dealer_cost_cents: 75 }), {
      ok: true, value: { display_msrp_price_cents: 100, regular_price_cents: null, dealer_cost_cents: 75 },
    });
    assert.equal(validatePricingPatch(kind, { dealer_cost_cents: -1 }).ok, false);
    assert.equal(validatePricingPatch(kind, { dealer_cost_cents: 1.5 }).ok, false);
  }
  assert.equal(validatePackageCorePricePatch({ display_msrp_price_cents: 779900, regular_price_cents: null, dealer_cost_cents: 18000 }, price).ok, true);
  assert.equal(validatePackageCorePricePatch({ sale_ends_at: price.sale_starts_at }, price).ok, false);
});

test("private Core price edits require Admin, reject stale versions, and update only the chosen context", async () => {
  const y40 = { regular_price_cents: null, display_msrp_price_cents: 619900, dealer_cost_cents: 12000 };
  let premium = { ...price, dealer_cost_cents: 18000 };
  let writes = 0;
  const makeHandlers = (isAdmin: boolean) => createPackageCorePriceAdminHandlers({
    isAdmin: async () => isAdmin, read: async () => [], readValues: async () => premium,
    update: async (_id, patch) => {
      writes++;
      premium = { ...premium, ...patch };
      return { id, packageId: "same-logical-package", priceMode: "core_specific", regularPriceCents: premium.regular_price_cents } as PackageCorePriceAdminRow;
    },
  });
  const save = (admin: boolean, expectedUpdatedAt: string) => makeHandlers(admin).PATCH(new Request("http://local", {
    method: "PATCH", body: JSON.stringify({ dealer_cost_cents: 18100, regular_price_cents: null, expectedUpdatedAt }),
  }), { params: Promise.resolve({ id }) });
  assert.equal((await save(false, version)).status, 401);
  assert.equal((await save(true, "2026-10-04T12:00:00.000Z")).status, 409);
  assert.equal(writes, 0);
  assert.equal((await save(true, version)).status, 200);
  assert.equal(premium.dealer_cost_cents, 18100);
  assert.equal(writes, 1);
  assert.deepEqual(y40, { regular_price_cents: null, display_msrp_price_cents: 619900, dealer_cost_cents: 12000 });
});
