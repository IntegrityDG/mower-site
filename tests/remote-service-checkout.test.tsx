import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import OptionalServices from "../components/customer-paths/purchase/OptionalServices";
import { addOptionalServices, EMPTY_OPTIONAL_SERVICES, parseOptionalServices } from "../lib/checkout/optional-services";
import { checkoutRequestFingerprint } from "../lib/checkout/idempotency";
import { parseCheckoutRequest } from "../lib/checkout/request-schema";
import { buildCardCheckoutSession } from "../lib/stripe/checkout-session";
import { buildAchCheckoutSession } from "../lib/stripe/ach-checkout-session";
import type { CheckoutRequest, OrderPriceSnapshot } from "../lib/checkout/types";

const productId = randomUUID();
const base: OrderPriceSnapshot = { currency: "usd", product: { id: productId, slug: "lymow-one-plus", name: "Lymow" }, variant: null, purchaseMode: "standard", chargeableItems: [{ itemType: "product", sourceId: productId, sku: null, name: "Lymow", description: null, quantity: 1, unitAmountCents: 269900, extendedAmountCents: 269900, includedInPackagePrice: false, parentSourceId: null }], includedPackageComponents: [], subtotalCents: 269900, discountCents: 0, feeCents: 0, shippingCents: 0, taxCents: 0, totalCents: 269900, paymentMethod: "card", pricedAt: "2026-09-09T00:00:00Z", catalogSources: [], warnings: [], safeMetadata: { phase: "4B2B", discountPolicy: "none" } };
const request: CheckoutRequest = { requestId: randomUUID(), paymentMethod: "card", selection: { productId, variantId: null, purchaseMode: "standard", packageId: null, options: [], includeBaseProduct: true }, customer: { name: "Synthetic buyer", email: "synthetic@example.invalid", phone: "5551234567" }, shippingAddress: { line1: "Synthetic street", line2: null, city: "Synthetic town", state: "MO", postalCode: "63967", country: "US" }, referral: null };
const selected = { install: true, setup: true, remoteSupport: true, acceptedSupportTerms: true };
const sessionInput = { orderId: randomUUID(), attemptId: randomUUID(), publicReference: "IDS-SYNTHETIC", customerEmail: "synthetic@example.invalid", appBaseUrl: "https://example.invalid", signingSecret: "synthetic-test-only".repeat(3), returnPath: "/equipment/lymow-one-plus", cancelExpiresAt: 1_800_000 };

test("Optional Services has exactly Install, Setup and Remote Support with separate $0-at-checkout terms", () => {
  const html = renderToStaticMarkup(<OptionalServices value={EMPTY_OPTIONAL_SERVICES} onChange={() => {}} supportAvailable eligibleCheckout />);
  assert.equal((html.match(/type="checkbox"/g) ?? []).length, 3);
  assert.ok(html.indexOf(">Install<") < html.indexOf(">Setup<"));
  assert.ok(html.indexOf(">Setup<") < html.indexOf(">Remote Support<"));
  assert.match(html, /not free services/);
});
test("Install and Setup preserve all equipment amounts and add zero at checkout", () => {
  const value = addOptionalServices(base, { ...request, optionalServices: { ...selected, remoteSupport: false, acceptedSupportTerms: false } }, false);
  assert.equal(value.totalCents, base.totalCents); assert.deepEqual(value.chargeableItems, base.chargeableItems);
  assert.equal(value.optionalServices?.setup, true);
});
for (const method of ["card", "ach_debit"] as const) test(`${method} collects the full $100 support line and saves a reusable method without changing equipment discounts`, () => {
  const discount = method === "card" ? 0 : 7422;
  const equipment = { ...base, paymentMethod: method, discountCents: discount, totalCents: base.totalCents - discount };
  const value = addOptionalServices(equipment, { ...request, paymentMethod: method, optionalServices: selected }, true);
  assert.equal(value.totalCents, equipment.totalCents + 10000); assert.equal(value.discountCents, discount);
  const session = method === "card" ? buildCardCheckoutSession({ ...sessionInput, snapshot: value }) : buildAchCheckoutSession({ ...sessionInput, snapshot: value });
  const lines = session.line_items!.map(line => (line.price_data!.unit_amount ?? 0) * (line.quantity ?? 1));
  assert.equal(lines.at(-1), 10000); assert.equal(lines.reduce((a, b) => a + b, 0), value.totalCents);
  assert.equal(session.payment_intent_data?.setup_future_usage, "off_session");
  assert.equal(session.metadata?.order_id, sessionInput.orderId); assert.equal(session.metadata?.ids_service, undefined);
  assert.match((session.custom_text!.submit as { message: string }).message, /10 days after payment confirmation/);
});
test("absent or unselected services preserve old checkout fingerprints and Stripe payment authorization behavior", () => {
  assert.equal(checkoutRequestFingerprint(request), checkoutRequestFingerprint({ ...request, optionalServices: EMPTY_OPTIONAL_SERVICES }));
  assert.notEqual(checkoutRequestFingerprint(request), checkoutRequestFingerprint({ ...request, optionalServices: selected }));
  assert.strictEqual(addOptionalServices(base, request, false), base);
  assert.equal(buildCardCheckoutSession({ ...sessionInput, snapshot: base }).payment_intent_data?.setup_future_usage, undefined);
});
test("server validation rejects free-price injection, missing consent, disabled support and accessory/wire subscription claims", () => {
  assert.deepEqual(parseCheckoutRequest({ ...request, optionalServices: selected }).optionalServices, selected);
  for (const value of [{ ...selected, price: 0 }, { ...selected, acceptedSupportTerms: false }, { ...selected, remoteSupport: "true" }, { remoteSupport: true }]) assert.throws(() => parseOptionalServices(value));
  const input = { ...request, optionalServices: selected };
  assert.throws(() => addOptionalServices(base, input, false));
  assert.throws(() => addOptionalServices({ ...base, purchaseMode: "accessories" }, input, true));
  assert.throws(() => addOptionalServices({ ...base, paymentMethod: "wire_transfer" }, input, true));
});
