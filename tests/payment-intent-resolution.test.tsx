import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";
import type { CheckoutRecord } from "../lib/checkout/order-repository";
import { IdsPaymentIntentResolutionError, resolvePaymentIntent } from "../lib/stripe/payment-intent-resolution";

const orderId = "11111111-1111-4111-8111-111111111111";
const attemptId = "22222222-2222-4222-8222-222222222222";
const record = (method: "card" | "ach_debit" = "card"): CheckoutRecord => ({ attemptId, orderId, customerId:"customer", publicReference:"IDS-1", attemptStatus:"open", paymentStatus:"unpaid", orderStatus:"draft", fulfillmentStatus:"not_ready", currency:"usd", totalCents:100, refundedCents:0, fundedAmountCents:null, amountRemainingCents:null, snapshot:{ paymentMethod:method } as CheckoutRecord["snapshot"], sessionId:"cs_1", paymentIntentId:"pi_1" });
const intent = (method: "card" | "ach_debit", status: Stripe.PaymentIntent.Status = "succeeded") => ({ id:"pi_1", status, metadata:{ order_id:orderId, attempt_id:attemptId, public_reference:"IDS-1", payment_method:method } }) as unknown as Stripe.PaymentIntent;
const session = { id:"cs_1", metadata:{ order_id:orderId, attempt_id:attemptId, public_reference:"IDS-1", payment_method:"card" } } as unknown as Stripe.Checkout.Session;

function dependencies(method: "card" | "ach_debit", options: { linked?: boolean; failLink?: boolean; sessions?: Stripe.Checkout.Session[] } = {}) {
  let linked = options.linked ?? false;
  let links = 0;
  return {
    get links(){ return links; },
    deps: {
      findByPaymentIntentId: async () => linked ? record(method) : null,
      findBySessionId: async () => record(method),
      linkByIdentity: async () => { links++; if(options.failLink) throw new Error("database unavailable"); linked=true; return record(method); },
      listSessions: async () => options.sessions ?? [],
    }
  };
}

test("card payment_intent.succeeded resolves by metadata before Session completion", async () => {
  const state=dependencies("card");
  const result=await resolvePaymentIntent(intent("card"),state.deps);
  assert.equal(result?.record.snapshot.paymentMethod,"card"); assert.equal(state.links,1);
});

test("ACH payment_intent.processing resolves by metadata and remains an ACH attempt", async () => {
  const state=dependencies("ach_debit");
  const result=await resolvePaymentIntent(intent("ach_debit","processing"),state.deps);
  assert.equal(result?.record.snapshot.paymentMethod,"ach_debit"); assert.equal(result?.record.paymentStatus,"unpaid");
});

test("a later Session delivery and duplicate PaymentIntent delivery use the existing linkage", async () => {
  const state=dependencies("card");
  await resolvePaymentIntent(intent("card"),state.deps);
  const duplicate=await resolvePaymentIntent(intent("card"),state.deps);
  assert.equal(duplicate?.record.sessionId,"cs_1"); assert.equal(state.links,1);
});

test("manual resend succeeds after a transient linking failure", async () => {
  const failing=dependencies("card",{failLink:true});
  await assert.rejects(resolvePaymentIntent(intent("card"),failing.deps),IdsPaymentIntentResolutionError);
  const retry=dependencies("card");
  assert.ok(await resolvePaymentIntent(intent("card"),retry.deps));
});

test("associated Checkout Session reconciles an older PaymentIntent without metadata", async () => {
  const state=dependencies("card",{sessions:[session]});
  const result=await resolvePaymentIntent({ ...intent("card"), metadata:{} } as Stripe.PaymentIntent,state.deps);
  assert.equal(result?.session?.id,"cs_1"); assert.equal(state.links,1);
});

test("unrelated Stripe PaymentIntents are ignored", async () => {
  const state=dependencies("card");
  assert.equal(await resolvePaymentIntent({ ...intent("card"), metadata:{} } as Stripe.PaymentIntent,state.deps),null);
});

test("IDS-owned malformed and unrecoverable events return actionable errors", async () => {
  const state=dependencies("card");
  await assert.rejects(resolvePaymentIntent({ ...intent("card"), metadata:{order_id:orderId} } as Stripe.PaymentIntent,state.deps),(error:unknown)=>error instanceof IdsPaymentIntentResolutionError && error.details.orderId===orderId);
  const unavailable=dependencies("card",{failLink:true});
  await assert.rejects(resolvePaymentIntent(intent("card"),unavailable.deps),(error:unknown)=>error instanceof IdsPaymentIntentResolutionError && error.details.paymentIntentId==="pi_1");
});
