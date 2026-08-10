import assert from "node:assert/strict";
import test from "node:test";
import { achTransition, wireTransition } from "../lib/checkout/bank-payment-transitions";
import { canTransitionAttempt } from "../lib/checkout/status-transitions";
import { reconcileAchIntent, reconcileAchSession } from "../lib/stripe/ach-webhook-policy";
import { reconcileWireIntent, reconcileWireSession } from "../lib/stripe/wire-webhook-policy";

const record={orderId:"order",attemptId:"attempt",totalCents:262478,currency:"usd" as const};
const metadata={order_id:"order",attempt_id:"attempt",payment_method:"ach_debit"};

test("ACH never fulfills while authorization or processing is pending",()=>{
  assert.equal(achTransition("awaiting_customer_action").fulfillmentStatus,"not_ready");
  assert.equal(achTransition("processing").fulfillmentStatus,"not_ready");
  assert.deepEqual(achTransition("paid"),{orderStatus:"confirmed",paymentStatus:"paid",fulfillmentStatus:"pending",attemptStatus:"succeeded"});
  assert.equal(achTransition("failed").attemptStatus,"failed");
  assert.equal(achTransition("expired").attemptStatus,"expired");
  assert.equal(achTransition("refund").paymentStatus,"refunded");
  assert.equal(achTransition("dispute").paymentStatus,"disputed");
});

test("ACH reconciles processing, success, failure, and mismatches",()=>{
  const base={livemode:false,paymentMethodTypes:["us_bank_account"],metadata,currency:"usd",amount:262478};
  assert.equal(reconcileAchIntent({...base,status:"requires_action"},record),"awaiting_customer_action");
  assert.equal(reconcileAchIntent({...base,status:"processing"},record),"processing");
  assert.equal(reconcileAchIntent({...base,status:"succeeded"},record),"paid");
  assert.equal(reconcileAchIntent({...base,status:"requires_payment_method"},record),"failed");
  assert.throws(()=>reconcileAchIntent({...base,status:"succeeded",amount:1},record));
  assert.equal(reconcileAchIntent({...base,livemode:true,status:"succeeded"},record,true),"paid");
  assert.throws(()=>reconcileAchIntent({...base,livemode:true,status:"succeeded"},record,false));
  assert.throws(()=>reconcileAchIntent({...base,status:"succeeded"},record,true));
});

test("ACH Sessions require the configured Stripe mode",()=>{
  const base={livemode:false,status:"complete",mode:"payment",paymentMethodTypes:["us_bank_account"],clientReferenceId:"order",metadata,currency:"usd",amountTotal:262478,paymentStatus:"paid"};
  assert.doesNotThrow(()=>reconcileAchSession(base,record,false));
  assert.doesNotThrow(()=>reconcileAchSession({...base,livemode:true},record,true));
  assert.throws(()=>reconcileAchSession({...base,livemode:true},record,false));
  assert.throws(()=>reconcileAchSession(base,record,true));
});

test("wire requires exact success and preserves partial funding",()=>{
  assert.equal(wireTransition("awaiting_customer_funds").fulfillmentStatus,"not_ready");
  assert.equal(wireTransition("partially_funded").paymentStatus,"partially_funded");
  assert.equal(wireTransition("partially_funded").fulfillmentStatus,"not_ready");
  assert.equal(wireTransition("paid").attemptStatus,"succeeded");
  assert.equal(wireTransition("overpayment").reviewRequired,true);
  assert.equal(wireTransition("expired").attemptStatus,"expired");
  assert.equal(wireTransition("refund").paymentStatus,"refunded");
  assert.equal(wireTransition("dispute").paymentStatus,"disputed");
});

test("wire reconciles awaiting, partial, exact, overpayment, and failure",()=>{
  const base={livemode:false,paymentMethodTypes:["customer_balance"],metadata:{...metadata,payment_method:"wire_transfer"},currency:"usd",amount:262478,status:"requires_action"};
  assert.deepEqual(reconcileWireIntent({...base,amountReceived:0},record),{kind:"awaiting_customer_funds",funded:0,remaining:262478});
  assert.deepEqual(reconcileWireIntent({...base,amountReceived:100000},record),{kind:"partially_funded",funded:100000,remaining:162478});
  assert.deepEqual(reconcileWireIntent({...base,status:"succeeded",amountReceived:262478},record),{kind:"paid",funded:262478,remaining:0});
  assert.deepEqual(reconcileWireIntent({...base,status:"succeeded",amountReceived:262479},record),{kind:"overpayment",funded:262479,remaining:0});
  assert.deepEqual(reconcileWireIntent({...base,status:"canceled",amountReceived:0},record).kind,"failed");
  assert.throws(()=>reconcileWireIntent({...base,amountReceived:1,amount:1},record));
  assert.deepEqual(reconcileWireIntent({...base,livemode:true,status:"succeeded",amountReceived:262478},record,true),{kind:"paid",funded:262478,remaining:0});
  assert.throws(()=>reconcileWireIntent({...base,livemode:true,amountReceived:0},record,false));
  assert.throws(()=>reconcileWireIntent({...base,amountReceived:0},record,true));
});

test("Wire Sessions require the configured Stripe mode",()=>{
  const base={livemode:false,status:"open",mode:"payment",paymentMethodTypes:["customer_balance"],clientReferenceId:"order",metadata:{...metadata,payment_method:"wire_transfer"},currency:"usd",amountTotal:262478,paymentStatus:"unpaid"};
  assert.doesNotThrow(()=>reconcileWireSession(base,record,false));
  assert.doesNotThrow(()=>reconcileWireSession({...base,livemode:true},record,true));
  assert.throws(()=>reconcileWireSession({...base,livemode:true},record,false));
  assert.throws(()=>reconcileWireSession(base,record,true));
});

test("terminal success cannot regress under reordered events",()=>{
  assert.equal(canTransitionAttempt("succeeded","processing"),false);
  assert.equal(canTransitionAttempt("succeeded","failed"),false);
  assert.equal(canTransitionAttempt("expired","succeeded"),false);
  assert.deepEqual(achTransition("processing"),achTransition("processing"));
  assert.deepEqual(wireTransition("partially_funded"),wireTransition("partially_funded"));
});
