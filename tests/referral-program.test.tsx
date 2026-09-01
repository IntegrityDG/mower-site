import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parseCheckoutRequest } from "../lib/checkout/request-schema";
import { privateReferralRecord, referralRewardForProduct } from "../lib/checkout/referral-rewards";
import type { CheckoutRequest, OrderPriceSnapshot } from "../lib/checkout/types";

const request = {
  requestId: "00000000-0000-4000-8000-000000000001",
  paymentMethod: "card",
  selection: { productId: "00000000-0000-4000-8000-000000000002", variantId: null, purchaseMode: "standard", packageId: null, options: [], includeBaseProduct: false },
  customer: { name: "Buyer", email: "buyer@example.com", phone: null },
  referral: { referrerName: " Referral Person ", referrerEmail: "REFERRER@EXAMPLE.COM" },
  shippingAddress: { line1: "1 Main St", line2: null, city: "Austin", state: "TX", postalCode: "78701", country: "US" },
};

test("checkout accepts only a complete referral identity", () => {
  const parsed = parseCheckoutRequest(request);
  assert.deepEqual(parsed.referral, { referrerName: "Referral Person", referrerEmail: "referrer@example.com" });
  assert.throws(() => parseCheckoutRequest({ ...request, referral: { referrerName: "Person", referrerEmail: "" } }));
  assert.throws(() => parseCheckoutRequest({ ...request, referral: { referrerName: "Person", referrerEmail: "person@example.com", rewardAmount: 1000 } }));
});

test("official referral amounts are derived from server product data", () => {
  assert.deepEqual(referralRewardForProduct({ id: "1", slug: "lymow-one-plus", name: "Lymow One Plus" }), { brand: "Lymow", baseRewardCents: 5000, higherTierRewardCents: 7500 });
  assert.deepEqual(referralRewardForProduct({ id: "2", slug: "yarbo", name: "Yarbo" }), { brand: "Yarbo", baseRewardCents: 10000, higherTierRewardCents: 15000 });
  assert.deepEqual(referralRewardForProduct({ id: "3", slug: "pandag-g1", name: "Pandag G1" }), { brand: "Pandag", baseRewardCents: 75000, higherTierRewardCents: 100000 });
  assert.throws(() => referralRewardForProduct({ id: "4", slug: "unknown", name: "Unknown" }));
});

test("private record starts pending and does not auto-apply a reward", () => {
  const snapshot = { product: { id: request.selection.productId, slug: "yarbo", name: "Yarbo" } } as OrderPriceSnapshot;
  const record = privateReferralRecord("order-id", parseCheckoutRequest(request) as CheckoutRequest, snapshot);
  assert.equal(record?.base_reward_cents, 10000);
  assert.equal(record?.higher_tier_reward_cents, 15000);
  assert.equal(record?.status, "pending");
  assert.equal("applied_reward_cents" in (record ?? {}), false);
});

test("public terms state manual verification and contain only approved rewards", () => {
  const page = readFileSync("app/referral-program/page.tsx", "utf8");
  assert.match(page, /IDS manually verifies each purchase/);
  assert.match(page, /not an automatic payout trigger/);
  for (const amount of ["$50", "$75", "$100", "$150", "$750", "$1,000"]) assert.match(page, new RegExp(amount.replace("$", "\\$")));
  assert.doesNotMatch(page, /Facebook Messenger/i);
});
