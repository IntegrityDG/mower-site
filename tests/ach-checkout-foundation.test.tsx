import assert from "node:assert/strict";
import test from "node:test";
import { buildAchCheckoutSession } from "../lib/stripe/ach-checkout-session";
import { paymentMethodIsServerEnabled } from "../lib/checkout/payment-method-availability";
import type { OrderPriceSnapshot } from "../lib/checkout/types";

const snapshot:OrderPriceSnapshot={currency:"usd",product:{id:"p",slug:"lymow-one-plus",name:"Lymow"},variant:null,purchaseMode:"standard",chargeableItems:[{itemType:"product",sourceId:"p",sku:null,name:"Lymow",description:null,quantity:1,unitAmountCents:269900,extendedAmountCents:269900,includedInPackagePrice:false,parentSourceId:null}],includedPackageComponents:[],subtotalCents:269900,discountCents:7422,feeCents:0,shippingCents:0,taxCents:0,totalCents:262478,paymentMethod:"ach_debit",pricedAt:new Date(0).toISOString(),catalogSources:[],warnings:[],safeMetadata:{phase:"4B2B",discountPolicy:"bank-payment-275bps-v1"}};

test("builds an ACH-only Checkout Session",()=>{
  const value=buildAchCheckoutSession({snapshot,orderId:"order",attemptId:"attempt",publicReference:"IDS-X",customerEmail:null,appBaseUrl:"https://example.com",signingSecret:"secret",returnPath:"/equipment/lymow-one-plus",cancelExpiresAt:1800000});
  assert.deepEqual(value.payment_method_types,["us_bank_account"]);
  assert.equal(value.mode,"payment");
  assert.equal("automatic_payment_methods" in value,false);
  assert.equal(value.line_items?.length,1);
  assert.equal((value.line_items?.[0] as {price_data:{unit_amount:number}}).price_data.unit_amount,262478);
  assert.equal(value.metadata?.payment_method,"ach_debit");
  assert.equal(value.payment_intent_data?.metadata?.payment_method,"ach_debit");
});

test("ACH remains server-disabled by default",()=>{
  assert.equal(paymentMethodIsServerEnabled("ach_debit",{}),false);
  assert.equal(paymentMethodIsServerEnabled("ach_debit",{ACH_CHECKOUT_ENABLED:"true"}),true);
});
