import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { parseCheckoutRequest } from "../lib/checkout/request-schema";
import type { CheckoutRequest } from "../lib/checkout/types";
import { checkoutDisplayName, validateCheckoutEligibility, type CheckoutCatalog } from "../lib/checkout/eligibility";
import { canTransitionAttempt, transitionCheckoutState } from "../lib/checkout/status-transitions";
import { PAYMENT_SECURITY_NOTICE, PAYMENT_SECURITY_POLICY_ID, PAYMENT_SECURITY_POLICY_VERSION, STRIPE_CUSTOMER_PROFILE_REUSE_POLICY } from "../lib/checkout/payment-security-policy";

const ids = Array.from({ length: 20 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
const price = { public_status: "active", regular_price_cents: 100_00, sale_price_cents: null, sale_starts_at: null, sale_ends_at: null };
const baseRequest: CheckoutRequest = { requestId: ids[0], paymentMethod: "card", selection: { productId: ids[1], variantId: null, purchaseMode: "individual-equipment", packageId: null, options: [], includeBaseProduct: true }, customer: { name: "Test Customer", email: "test@example.com", phone: null }, shippingAddress: { line1: "1 Test St", line2: null, city: "Test", state: "TX", postalCode: "75001", country: "US" } };
const expectReject = (fn: () => unknown, match?: RegExp) => match ? assert.throws(fn, match) : assert.throws(fn);

parseCheckoutRequest(baseRequest);
for (const forbidden of ["price", "total", "fee", "discount", "tax", "shipping", "salesMode", "stripePriceId", "hearth"]) expectReject(() => parseCheckoutRequest({ ...baseRequest, [forbidden]: 1 }), /unknown/i);
expectReject(() => parseCheckoutRequest({ ...baseRequest, requestId: "bad" }), /UUID/i);
expectReject(() => parseCheckoutRequest({ ...baseRequest, selection: { ...baseRequest.selection, options: [{ optionId: ids[2], quantity: 1 }, { optionId: ids[2], quantity: 1 }] } }), /Duplicate/i);
expectReject(() => parseCheckoutRequest({ ...baseRequest, selection: { ...baseRequest.selection, options: [{ optionId: ids[2], quantity: 11 }] } }), /quantity/i);
expectReject(() => parseCheckoutRequest({ ...baseRequest, shippingAddress: { ...baseRequest.shippingAddress, country: "CA" } }), /US/i);

const product = (slug: string, brand: string) => ({ ...price, id: ids[1], slug, brand, name: slug });
const option = (id: string, slug: string) => ({ ...price, id, product_id: ids[1], option_slug: slug, name: slug === "yarbo-leaf-blower-module" ? "Leaf Blower Module" : slug, description: null, minimum_quantity: 0, maximum_quantity: 1 });
const variant = (id: string, slug: string, amount: number) => ({ ...price, id, product_id: ids[1], variant_slug: slug, name: slug, description: null, sku: null, regular_price_cents: amount });
const catalogPackage = (id: string, slug: string) => ({ ...price, id, product_id: ids[1], package_slug: slug, package_name: slug, description: null });
const catalog = (overrides: Partial<CheckoutCatalog>): CheckoutCatalog => ({ product: product("yarbo", "Yarbo"), variants: [], options: [], packages: [], variantOptions: [], packageItems: [], ...overrides });
const request = (selection: Partial<CheckoutRequest["selection"]>) => parseCheckoutRequest({ ...baseRequest, selection: { ...baseRequest.selection, ...selection } });

expectReject(() => validateCheckoutEligibility(request({}), catalog({ product: product("pandag-g1", "Pandag") })), /quote-only/i);
expectReject(() => validateCheckoutEligibility(request({}), catalog({ product: product("forged", "Pandag") })), /quote-only/i);
expectReject(() => validateCheckoutEligibility(request({ options: [{ optionId: ids[3], quantity: 1 }] }), catalog({ options: [{ ...option(ids[3], "yarbo-mower-module"), product_id: ids[19] }] })), /another product/i);

for (const [slug, amount, chargerSlug] of [["lymow-one-plus-5a", 269900, "lymow-5a-charger"], ["lymow-one-plus-10a", 284900, "lymow-10a-charger"]] as const) {
  const v = variant(ids[2], slug, amount); const charger = option(ids[3], chargerSlug);
  const lymow = catalog({ product: product("lymow-one-plus", "Lymow"), variants: [v], options: [charger], variantOptions: [{ id: ids[4], variant_id: v.id, option_id: charger.id, relationship_type: "defines_variant" }] });
  const eligible = validateCheckoutEligibility(request({ variantId: v.id, purchaseMode: "standard", includeBaseProduct: false }), lymow);
  assert.equal(eligible.variant?.regular_price_cents, amount); assert.equal(eligible.selectedOptions.length, 0);
  expectReject(() => validateCheckoutEligibility(request({ variantId: v.id, purchaseMode: "standard", includeBaseProduct: false, options: [{ optionId: charger.id, quantity: 1 }] }), lymow), /included/i);
}
const lymowVariant = variant(ids[2], "lymow-one-plus-5a", 269900);
const lymowCharger = option(ids[3], "lymow-5a-charger");
const lymowRelationship = { id: ids[4], variant_id: lymowVariant.id, option_id: lymowCharger.id, relationship_type: "defines_variant" };
const validLymowRequest = request({ variantId: lymowVariant.id, purchaseMode: "standard", includeBaseProduct: false });
const validLymowCatalog = { product: product("lymow-one-plus", "Lymow"), variants: [lymowVariant], options: [lymowCharger], packages: [], variantOptions: [lymowRelationship], packageItems: [] } satisfies CheckoutCatalog;
assert.doesNotThrow(() => validateCheckoutEligibility(validLymowRequest, { ...validLymowCatalog, options: [lymowCharger, { ...option(ids[9], "inactive-sibling-option"), public_status: "hidden" }] }));
assert.doesNotThrow(() => validateCheckoutEligibility(validLymowRequest, { ...validLymowCatalog, variants: [lymowVariant, { ...variant(ids[10], "inactive-sibling-variant", 1), public_status: "hidden" }] }));
assert.doesNotThrow(() => validateCheckoutEligibility(validLymowRequest, { ...validLymowCatalog, packages: [{ ...catalogPackage(ids[11], "inactive-sibling-package"), public_status: "hidden" }] }));
expectReject(() => validateCheckoutEligibility(validLymowRequest, { ...validLymowCatalog, variants: [{ ...lymowVariant, public_status: "hidden" }] }), /selected variant is not active/i);
expectReject(() => validateCheckoutEligibility(validLymowRequest, { ...validLymowCatalog, options: [{ ...lymowCharger, public_status: "hidden" }] }), /required Lymow charger is not active/i);
expectReject(() => validateCheckoutEligibility(request({ variantId: lymowVariant.id, purchaseMode: "standard", includeBaseProduct: false, packageId: ids[12] }), { ...validLymowCatalog, packages: [catalogPackage(ids[12], "forged-lymow-package")] }), /Lymow package checkout is unavailable/i);
const crossedVariant = variant(ids[2], "lymow-one-plus-5a", 269900);
expectReject(() => validateCheckoutEligibility(request({ variantId: crossedVariant.id, purchaseMode: "standard", includeBaseProduct: false }), catalog({ product: product("lymow-one-plus", "Lymow"), variants: [crossedVariant], options: [option(ids[3], "lymow-10a-charger")], variantOptions: [{ id: ids[4], variant_id: crossedVariant.id, option_id: ids[3], relationship_type: "defines_variant" }] })), /relationship/i);

const modules = [option(ids[3], "yarbo-mower-module"), option(ids[4], "yarbo-lawn-mower-pro-module"), option(ids[5], "yarbo-leaf-blower-module")];
const individual = validateCheckoutEligibility(request({ includeBaseProduct: false, options: [{ optionId: ids[3], quantity: 1 }, { optionId: ids[4], quantity: 1 }] }), catalog({ options: modules }));
assert.match(individual.moduleOnlyWarning ?? "", /Core is not included/); assert.equal(individual.selectedOptions.length, 2);
expectReject(() => validateCheckoutEligibility(request({ includeBaseProduct: false, options: [{ optionId: ids[3], quantity: 1 }] }), catalog({ options: [{ ...modules[0], public_status: "hidden" }] })), /selected option is not active/i);
assert.equal(checkoutDisplayName(modules[2]), "Blower Module");
for (const hidden of ["yarbo-plow-module", "yarbo-tow-hitch"]) expectReject(() => validateCheckoutEligibility(request({ includeBaseProduct: false, options: [{ optionId: ids[6], quantity: 1 }] }), catalog({ options: [option(ids[6], hidden)] })), /not available/i);
const pkg = catalogPackage(ids[7], "yarbo-package");
const pkgCatalog = catalog({ options: modules, packages: [pkg], packageItems: [{ id: ids[8], package_id: pkg.id, option_id: modules[0].id, quantity: 1, included_in_package_price: true }] });
const pkgEligible = validateCheckoutEligibility(request({ purchaseMode: "complete-system", packageId: pkg.id, includeBaseProduct: false }), pkgCatalog);
assert.equal(pkgEligible.packageItems?.length, 1);
expectReject(() => validateCheckoutEligibility(request({ purchaseMode: "complete-system", packageId: pkg.id, includeBaseProduct: false }), { ...pkgCatalog, packages: [{ ...pkg, public_status: "hidden" }] }), /selected package is not active/i);
expectReject(() => validateCheckoutEligibility(request({ purchaseMode: "complete-system", packageId: pkg.id, includeBaseProduct: false }), { ...pkgCatalog, options: [{ ...modules[0], public_status: "hidden" }, ...modules.slice(1)] }), /required component.*not active/i);
expectReject(() => validateCheckoutEligibility(request({ purchaseMode: "complete-system", packageId: pkg.id, includeBaseProduct: false, options: [{ optionId: modules[0].id, quantity: 1 }] }), pkgCatalog), /standalone/i);

const state = { orderStatus: "confirmed", paymentStatus: "paid", fulfillmentStatus: "pending", refundedCents: 0, totalCents: 1000 } as const;
assert.deepEqual(transitionCheckoutState(state, state), state);
expectReject(() => transitionCheckoutState(state, { ...state, paymentStatus: "unpaid", fulfillmentStatus: "not_ready" }), /transition/i);
expectReject(() => transitionCheckoutState({ ...state, orderStatus: "checkout_pending", paymentStatus: "unpaid", fulfillmentStatus: "not_ready" }, { ...state, orderStatus: "checkout_pending", paymentStatus: "unpaid", fulfillmentStatus: "pending" }), /Fulfillment/i);
assert.equal(transitionCheckoutState(state, { ...state, paymentStatus: "partially_refunded", refundedCents: 500 }).refundedCents, 500);
assert.equal(transitionCheckoutState(state, { ...state, paymentStatus: "refunded", fulfillmentStatus: "canceled", refundedCents: 1000 }).paymentStatus, "refunded");
assert.equal(canTransitionAttempt("expired", "open"), false); assert.equal(canTransitionAttempt("open", "open"), true);

const migrationPath = path.join(process.cwd(), "supabase/migrations/20260727034240_create_private_checkout_foundation.sql");
const sql = fs.readFileSync(migrationPath, "utf8");
assert.match(sql, /create schema if not exists checkout_private/i);
for (const table of ["customers", "orders", "order_items", "payment_attempts", "stripe_webhook_events"]) { assert.match(sql, new RegExp(`create table checkout_private\\.${table}`)); assert.match(sql, new RegExp(`alter table checkout_private\\.${table} enable row level security`)); assert.match(sql, new RegExp(`alter table checkout_private\\.${table} force row level security`)); }
assert.match(sql, /revoke all on schema checkout_private from public, anon, authenticated/i);
assert.doesNotMatch(sql, /create policy/i); assert.doesNotMatch(sql, /(?:insert|update|delete)\s+(?:into\s+)?public\.catalog_/i); assert.doesNotMatch(sql, /(?:insert|update|delete).*quote_requests/i); assert.doesNotMatch(sql, /pandag/i);
assert.match(sql, /unique\s*\(order_id,\s*id\)/i);
assert.match(sql, /foreign key\s*\(order_id,\s*parent_order_item_id\)\s*references checkout_private\.order_items\s*\(order_id,\s*id\)\s*on delete restrict/i);
assert.match(sql, /customer_id uuid not null references checkout_private\.customers\s*\(id\)\s*on delete restrict/i);
assert.match(sql, /order_id uuid not null references checkout_private\.orders\s*\(id\)\s*on delete restrict/gi);
assert.doesNotMatch(sql, /on delete cascade/i);
assert.doesNotMatch(sql, /grant[^;]*delete/i); assert.doesNotMatch(sql, /grant[^;]*all tables/i); assert.doesNotMatch(sql, /grant[^;]*sequences/i);
for (const table of ["customers", "orders", "order_items", "payment_attempts", "stripe_webhook_events"]) assert.match(sql, new RegExp(`grant select, insert, update on table checkout_private\\.${table} to service_role`, "i"));
assert.match(sql, /create table checkout_private\.customers/i); assert.match(sql, /stripe_customer_id text unique/i); assert.match(sql, /identity_verified_at timestamptz/i);
assert.match(sql, /create index checkout_customers_normalized_email_idx\s+on checkout_private\.customers \(normalized_email\)/i);
assert.doesNotMatch(sql, /unique\s*\(normalized_email\)|normalized_email\s+text\s+unique/i);
const attemptsSql = sql.match(/create table checkout_private\.payment_attempts\s*\(([\s\S]*?)\n\);/i)?.[1] ?? "";
assert.doesNotMatch(attemptsSql, /stripe_customer_id/i);

assert.equal(PAYMENT_SECURITY_POLICY_ID, "ids-stripe-payment-security-v1");
assert.equal(PAYMENT_SECURITY_POLICY_VERSION, "1.0");
assert.equal(PAYMENT_SECURITY_NOTICE.length, 467); assert.ok(PAYMENT_SECURITY_NOTICE.length <= 1200);
assert.equal(crypto.createHash("sha256").update(PAYMENT_SECURITY_NOTICE).digest("hex"), "7c067547572e8216b4e3ad5b7926ae30e0c6ef11f205811bfa45c729f58eea9a");
const docs = fs.readFileSync(path.join(process.cwd(), "docs/stripe-checkout-foundation.md"), "utf8");
assert.match(docs, /PAYMENT_SECURITY_NOTICE/); assert.doesNotMatch(docs, /Payment Security Notice:/);
assert.match(docs, /zyualbcbjchuhajyrpvw/); assert.match(docs, /20260727034240/); assert.match(docs, /applied successfully/i); assert.doesNotMatch(docs, /\bunapplied\b|awaiting approval|must receive separate approval/i);
assert.equal(STRIPE_CUSTOMER_PROFILE_REUSE_POLICY.emailMatchMeaning, "possible_duplicate_only");
assert.equal(STRIPE_CUSTOMER_PROFILE_REUSE_POLICY.reuseRequires, "verified_identity");
assert.equal(STRIPE_CUSTOMER_PROFILE_REUSE_POLICY.automaticEmailMerge, "prohibited");
assert.match(docs, /typed email is only a possible-duplicate signal/i); assert.match(docs, /Automatic merging by email is prohibited/i);
assert.equal(fs.existsSync(path.join(process.cwd(), "app/api/checkout/customer/route.ts")), false);

const executableDefinitions = [
  sql,
  ...["types.ts", "order-repository.ts", "pricing-resolver.ts", "eligibility.ts", "request-schema.ts"].map((file) => fs.readFileSync(path.join(process.cwd(), "lib/checkout", file), "utf8")),
].join("\n");
assert.doesNotMatch(executableDefinitions, /\b(?:card_number|card_last4|last4|card_brand|cvc|cvv|exp_month|exp_year|expiration|card_fingerprint|payment_fingerprint|account_number|bank_last4|routing_number|bank_name|payment_method_id|paymentmethod_id|reusable_token|mandate_details|complete_stripe_webhook_payload)\b/i);

const safeSnapshot = { currency: "usd", subtotalCents: 1000, discountCents: 0, feeCents: 0, shippingCents: 0, taxCents: 0, totalCents: 1000 };
assert.equal(safeSnapshot.totalCents, safeSnapshot.subtotalCents); assert.equal(JSON.stringify(safeSnapshot).includes("cost"), false); assert.ok(Object.values(safeSnapshot).filter((value) => typeof value === "number").every(Number.isSafeInteger));
console.log("Checkout foundation validation assertions passed.");
