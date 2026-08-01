import assert from "node:assert/strict";
import test from "node:test";
import { BANK_PAYMENT_DISCOUNT_BPS, BASIS_POINTS_DENOMINATOR, resolvePaymentAdjustments } from "../lib/checkout/payment-pricing";
import { parseCheckoutRequest } from "../lib/checkout/request-schema";

test("uses one reviewed bank discount policy", () => {
  assert.equal(BANK_PAYMENT_DISCOUNT_BPS, 275);
  assert.equal(BASIS_POINTS_DENOMINATOR, 10_000);
});

test("prices the controlled subtotal for all canonical methods", () => {
  assert.deepEqual(resolvePaymentAdjustments(269_900, "card"), { subtotalCents:269_900,discountCents:0,feeCents:0,shippingCents:0,taxCents:0,totalCents:269_900,discountPolicy:"none" });
  for (const method of ["ach_debit","wire_transfer"] as const) assert.deepEqual(resolvePaymentAdjustments(269_900, method), { subtotalCents:269_900,discountCents:7_422,feeCents:0,shippingCents:0,taxCents:0,totalCents:262_478,discountPolicy:"bank-payment-275bps-v1" });
});

test("uses JavaScript Math.round and safe integer guards", () => {
  assert.equal(resolvePaymentAdjustments(200,"ach_debit").discountCents,6);
  assert.equal(resolvePaymentAdjustments(1,"wire_transfer").discountCents,0);
  assert.throws(()=>resolvePaymentAdjustments(-1,"card"));
  assert.throws(()=>resolvePaymentAdjustments(Number.MAX_SAFE_INTEGER+1,"card"));
});

test("rejects browser monetary fields and ambiguous ach", () => {
  const request={requestId:"11111111-1111-4111-8111-111111111111",paymentMethod:"ach_debit",selection:{productId:"22222222-2222-4222-8222-222222222222",variantId:null,purchaseMode:"standard",packageId:null,options:[],includeBaseProduct:true},customer:{name:"Test",email:"test@example.com",phone:null},shippingAddress:{line1:"1 Main",line2:null,city:"Austin",state:"TX",postalCode:"78701",country:"US"}};
  assert.equal(parseCheckoutRequest(request).paymentMethod,"ach_debit");
  assert.throws(()=>parseCheckoutRequest({...request,totalCents:1}));
  assert.throws(()=>parseCheckoutRequest({...request,paymentMethod:"ach"}));
});
