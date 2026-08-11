import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import PurchaseMethod from "../components/customer-paths/purchase/PurchaseMethod";
import {
  checkoutEndpoint,
  checkoutSubmissionKind,
} from "../lib/checkout/handoff";

const lymow = {
  slug: "lymow-one-plus",
  brand: "Lymow",
  salesMode: "self_service" as const,
};

test("routes customer payment methods to card and ACH checkout only", () => {
  assert.equal(checkoutSubmissionKind(lymow, "pay-in-full"), "card");
  assert.equal(checkoutSubmissionKind(lymow, "ach"), "ach_debit");
  assert.equal(checkoutEndpoint("card"), "/api/checkout/session");
  assert.equal(checkoutEndpoint("ach_debit"), "/api/checkout/ach/session");
});

test("purchase method UI displays card, ACH, and Hearth without wire", () => {
  const markup = renderToStaticMarkup(
    <PurchaseMethod
      selectedMethod=""
      checkoutAvailable
      configuredTotalCents={354800}
      hearthUrl="https://example.com/hearth"
      onSelectMethod={() => undefined}
      availability={{card:true,achDebit:true,hearthFinancing:true}}
    />
  );

  assert.match(markup, />Card</);
  assert.match(markup, />ACH</);
  assert.match(markup, /Hearth/);
  assert.match(markup, /Configured total/);
  assert.match(markup, /\$3,548\.00/);
  assert.match(markup, /Save \$97\.57/);
  assert.match(markup, /2\.75% ACH discount/);
  assert.match(markup, /ACH total/);
  assert.match(markup, /\$3,450\.43/);
  assert.doesNotMatch(markup, /Card total/);
  assert.doesNotMatch(markup, /instead of/i);
  assert.match(markup, /Fulfillment stays pending until ACH payment succeeds/);
  assert.doesNotMatch(markup, /wire/i);
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
