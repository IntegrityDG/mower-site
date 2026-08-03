import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { purchaseProgressSteps } from "../components/customer-paths/purchase/NationwidePurchaseFlow";
import ProductPageSections from "../components/equipment/ProductPageSections";
import QuoteOnlyNotice from "../components/equipment/QuoteOnlyNotice";
import type { CatalogPageSection } from "../lib/catalog/types";

test("quote-only notice renders the required Pandag language and existing request route", () => {
  const html = renderToStaticMarkup(<QuoteOnlyNotice />);

  assert.match(html, /Pricing &amp; Project Review/);
  assert.match(html, /IDS project review/);
  assert.match(html, /not available for online purchase or payment/);
  assert.match(html, /Request Pricing &amp; Information/);
  assert.match(html, /href="\/pandag\/project-quote"/);
  assert.doesNotMatch(html, /Build Your System/);
  assert.doesNotMatch(html, /checkout/i);
});

test("purchase flow exposes the approved five progress steps", () => {
  const labels: string[] = purchaseProgressSteps.map((step) => step.label);

  assert.deepEqual(labels, [
    "Build Your System",
    "Review System",
    "Pricing & Financing",
    "Delivery & Contact",
    "Checkout",
  ]);

  assert.equal(labels.length, 5);
  assert.ok(!labels.includes("Browse Equipment"));
  assert.ok(!labels.includes("Select Equipment"));
  assert.ok(!labels.includes("Availability"));
  assert.ok(!labels.includes("Request"));
});

test("product sections render in sort order as escaped text with paragraph breaks", () => {
  const sections: CatalogPageSection[] = [
    {
      id: "second",
      heading: "Second",
      bodyContent: "Final model selection remains subject to IDS project review.",
      mediaUrl: null,
      buttonLabel: null,
      buttonUrl: null,
      sortOrder: 20,
    },
    {
      id: "first",
      heading: "<First>",
      bodyContent: "Paragraph one.\n\n<script>alert('unsafe')</script>",
      mediaUrl: null,
      buttonLabel: null,
      buttonUrl: null,
      sortOrder: 10,
    },
  ];

  const html = renderToStaticMarkup(<ProductPageSections sections={sections} />);

  assert.ok(html.indexOf("&lt;First&gt;") < html.indexOf("Second"));
  assert.match(html, /whitespace-pre-line/);
  assert.match(html, /Paragraph one\.\n\n&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /IDS project review/);
});
