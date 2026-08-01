import assert from "node:assert/strict";
import test from "node:test";
import { buildWireCheckoutSession } from "../lib/stripe/wire-checkout-session";
import { paymentMethodIsServerEnabled } from "../lib/checkout/payment-method-availability";
import type { OrderPriceSnapshot } from "../lib/checkout/types";

const snapshot:OrderPriceSnapshot={currency:"usd",product:{id:"p",slug:"lymow-one-plus",name:"Lymow"},variant:null,purchaseMode:"standard",chargeableItems:[{itemType:"product",sourceId:"p",sku:null,name:"Lymow",description:null,quantity:1,unitAmountCents:269900,extendedAmountCents:269900,includedInPackagePrice:false,parentSourceId:null}],includedPackageComponents:[],subtotalCents:269900,discountCents:7422,feeCents:0,shippingCents:0,taxCents:0,totalCents:262478,paymentMethod:"wire_transfer",pricedAt:new Date(0).toISOString(),catalogSources:[],warnings:[],safeMetadata:{phase:"4B2B",discountPolicy:"bank-payment-275bps-v1"}};

test("builds a wire-only Checkout Session with an explicit Customer",()=>{
  const value=buildWireCheckoutSession({snapshot,orderId:"order",attemptId:"attempt",publicReference:"IDS-X",customerEmail:null,stripeCustomerId:"cus_Test123",appBaseUrl:"https://example.com",signingSecret:"secret",returnPath:"/equipment/lymow-one-plus",cancelExpiresAt:1800000});
  assert.deepEqual(value.payment_method_types,["customer_balance"]);
  assert.equal(value.payment_method_options?.customer_balance?.funding_type,"bank_transfer");
  assert.equal(value.payment_method_options?.customer_balance?.bank_transfer?.type,"us_bank_transfer");
  assert.equal(value.customer,"cus_Test123");
  assert.equal("customer_creation" in value,false);
  assert.equal("automatic_payment_methods" in value,false);
  assert.equal((value.line_items?.[0] as {price_data:{unit_amount:number}}).price_data.unit_amount,262478);
});

test("requires a Customer and remains disabled by default",()=>{
  assert.throws(()=>buildWireCheckoutSession({snapshot,orderId:"order",attemptId:"attempt",publicReference:"IDS-X",customerEmail:null,stripeCustomerId:"",appBaseUrl:"https://example.com",signingSecret:"secret",returnPath:"/equipment/lymow-one-plus",cancelExpiresAt:1800000}));
  assert.equal(paymentMethodIsServerEnabled("wire_transfer",{}),false);
});
