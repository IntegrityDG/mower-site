import assert from "node:assert/strict";
import test from "node:test";

import {
  checkoutEndpoint,
  checkoutSubmissionKind,
} from "../lib/checkout/handoff";

const lymow = {
  slug: "lymow-one-plus",
  brand: "Lymow",
  salesMode: "self_service" as const,
};

test("routes eligible payment methods to their checkout endpoints", () => {
  assert.equal(checkoutSubmissionKind(lymow, "pay-in-full"), "card");
  assert.equal(checkoutSubmissionKind(lymow, "ach"), "ach_debit");
  assert.equal(checkoutSubmissionKind(lymow, "wire"), "wire_transfer");
  assert.equal(checkoutEndpoint("card"), "/api/checkout/session");
  assert.equal(checkoutEndpoint("ach_debit"), "/api/checkout/ach/session");
  assert.equal(
    checkoutEndpoint("wire_transfer"),
    "/api/checkout/wire/session"
  );
});

test("keeps financing, quote-only products, and unpriced configurations in the request flow", () => {
  assert.equal(checkoutSubmissionKind(lymow, "hearth-financing"), "quote");
  assert.equal(checkoutSubmissionKind(lymow, "pay-in-full", true), "quote");
  assert.equal(
    checkoutSubmissionKind(
      { slug: "pandag-g1", brand: "Pandag", salesMode: "quote_only" },
      "pay-in-full"
    ),
    "quote"
  );
});
