/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import test from "node:test";
import * as paymentPolicy from "../lib/custom-invoices/payment-policy";
import { loadInstallationModule } from "./helpers/installation-module";

function harness() {
  const calls: { name: string; value: unknown; options?: unknown }[] = [];
  const request = { id:"11111111-1111-4111-8111-111111111111",invoice_id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",request_kind:"deposit",amount_cents:150000,currency:"usd",status:"creating",operation_key:"operation-123",allowed_payment_methods:["card","us_bank_account"],stripe_invoice_id:null as string|null,hosted_invoice_url:null as string|null };
  const detail = { invoice:{ id:request.invoice_id,invoice_number:"IDS-INV-2026-00001",status:"finalized",customer_name:"Taylor Customer",customer_email:"taylor@example.com",customer_phone:"5735550100",billing_address:{line1:"1 Main",city:"Cape",state:"MO",postalCode:"63701"},due_date:"2027-01-15",payment_terms:"deposit",deposit_amount_cents:150000,total_cents:650000,amount_paid_cents:0,stripe_customer_id:null,internal_notes:"private margin" },items:[{description:"Y40P"}],paymentRequests:[request],payments:[],refunds:[],events:[] };
  let linked=false;
  const repository = {
    readInvoice: async()=>linked?{...detail,paymentRequests:[{...request,status:"open",stripe_invoice_id:"in_test",hosted_invoice_url:"https://invoice.stripe.test/safe"}]}:detail,
    reservePaymentRequest: async(_id:string,_kind:string,methods:string[],key:string)=>{calls.push({name:"reserve",value:{methods,key}});return request;},
    linkPaymentRequest: async(...args:unknown[])=>{linked=true;calls.push({name:"link",value:args});},
    cancelPaymentRequests: async(...args:unknown[])=>{calls.push({name:"cancel",value:args});},
    readPaymentRequestByStripeInvoiceId: async()=>({id:request.id,invoice_id:request.invoice_id,amount_cents:request.amount_cents,currency:"usd",status:"open",stripe_invoice_id:"in_test"}),
    applyStripeInvoiceEvent: async(value:unknown)=>{calls.push({name:"apply",value});return "processed";},
    applyStripeRefund: async(value:unknown)=>{calls.push({name:"refund",value});return "processed";},
  };
  const provider = {
    customers:{create:async(value:unknown,options:unknown)=>{calls.push({name:"customer",value,options});return{id:"cus_test"};}},
    invoices:{create:async(value:unknown,options:unknown)=>{calls.push({name:"invoice",value,options});return{id:"in_test"};},finalizeInvoice:async(_id:string,value:unknown,options:unknown)=>{calls.push({name:"finalize",value,options});return{id:"in_test",hosted_invoice_url:"https://invoice.stripe.test/safe"};},voidInvoice:async()=>({})},
    invoiceItems:{create:async(value:unknown,options:unknown)=>{calls.push({name:"item",value,options});return{id:"ii_test"};}},
    invoicePayments:{list:async()=>({data:[{status:"paid",amount_paid:150000,payment:{payment_intent:"pi_from_invoice_payment"}}]})},
  };
  const api = loadInstallationModule<any>("lib/custom-invoices/stripe.ts",{
    "@/lib/payment-method-settings/server":{readPaymentMethodSettings:async()=>({card:true,ach_debit:true,hearth_financing:true})},
    "@/lib/stripe/config":{getStripeMode:()=>"test"},"@/lib/stripe/server":{getStripeServerClient:()=>provider},"./repository":repository,"./payment-policy":{...paymentPolicy,allowedCustomInvoiceMethods:(settings:any)=>paymentPolicy.allowedCustomInvoiceMethods(settings,{ACH_CHECKOUT_ENABLED:"true"})},
  },{ACH_CHECKOUT_ENABLED:"true"});
  return {api,provider,calls,request};
}

test("hosted payment fixture sends exact reserved cents and safe metadata",async()=>{
  const h=harness();await h.api.createHostedPaymentRequest({invoiceId:h.request.invoice_id,kind:"deposit",requestedMethods:["card","us_bank_account"],operationKey:"operation-123"},h.provider);
  const item=h.calls.find(call=>call.name==="item")! as any;assert.equal(item.value.amount,150000);assert.equal(item.value.currency,"usd");assert.deepEqual(JSON.parse(JSON.stringify(item.value.metadata)),{custom_invoice_id:h.request.invoice_id,payment_request_id:h.request.id,invoice_number:"IDS-INV-2026-00001"});assert.doesNotMatch(JSON.stringify(item.value),/private margin/);
  const invoice=h.calls.find(call=>call.name==="invoice")! as any;assert.deepEqual(Array.from(invoice.value.payment_settings.payment_method_types),["card","us_bank_account"]);assert.equal(invoice.options.idempotencyKey,"operation-123:invoice");
});

test("hosted payment fixture ignores any browser total and uses the reservation",async()=>{
  const h=harness();await h.api.createHostedPaymentRequest({invoiceId:h.request.invoice_id,kind:"deposit",requestedMethods:["card"],operationKey:"operation-123",amountCents:1},h.provider);const item=h.calls.find(call=>call.name==="item")! as any;assert.equal(item.value.amount,150000);
});

test("invoice webhook fixture reconciles exact provider fields",async()=>{
  const h=harness();const event={id:"evt_paid",type:"invoice.paid",data:{object:{id:"in_test",metadata:{custom_invoice_id:h.request.invoice_id,payment_request_id:h.request.id},amount_paid:150000,currency:"usd",livemode:false,payment_intent:"pi_test"}}};assert.equal(await h.api.handleCustomInvoiceStripeWebhook(event,false),true);const apply=h.calls.find(call=>call.name==="apply")!.value as any;assert.deepEqual(JSON.parse(JSON.stringify(apply)),{eventId:"evt_paid",eventType:"invoice.paid",stripeInvoiceId:"in_test",paymentIntentId:"pi_from_invoice_payment",amountPaid:150000,currency:"usd",livemode:false,expectedLivemode:false});
});

test("invoice webhook fixture rejects metadata substitution before recording money",async()=>{
  const h=harness();const event={id:"evt_bad",type:"invoice.paid",data:{object:{id:"in_test",metadata:{custom_invoice_id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",payment_request_id:h.request.id},amount_paid:150000,currency:"usd",livemode:false,payment_intent:"pi_test"}}};await assert.rejects(h.api.handleCustomInvoiceStripeWebhook(event,false),/metadata mismatch/);assert.ok(!h.calls.some(call=>call.name==="apply"));
});

test("refund fixture forwards cumulative Stripe evidence to the refund ledger",async()=>{
  const h=harness();const event={id:"evt_refund",type:"charge.refunded",data:{object:{id:"ch_test",payment_intent:"pi_test",amount:150000,amount_refunded:50000,currency:"usd",livemode:false}}};assert.equal(await h.api.handleCustomInvoiceStripeWebhook(event,false),true);const refund=h.calls.find(call=>call.name==="refund")!.value as any;assert.equal(refund.chargeAmount,150000);assert.equal(refund.cumulativeRefunded,50000);assert.equal(refund.paymentIntentId,"pi_test");
});

test("current Stripe invoice payments resolve the refundable PaymentIntent",async()=>{
  const h=harness();const event={id:"evt_current",type:"invoice.paid",data:{object:{id:"in_test",metadata:{custom_invoice_id:h.request.invoice_id,payment_request_id:h.request.id},amount_paid:150000,currency:"usd",livemode:false}}};assert.equal(await h.api.handleCustomInvoiceStripeWebhook(event,false,h.provider),true);const apply=h.calls.find(call=>call.name==="apply")!.value as any;assert.equal(apply.paymentIntentId,"pi_from_invoice_payment");
});

test("canceling hosted requests closes Stripe before releasing the database reservation",async()=>{
  const h=harness();await h.api.createHostedPaymentRequest({invoiceId:h.request.invoice_id,kind:"deposit",requestedMethods:["card"],operationKey:"operation-123"},h.provider);h.provider.invoices.voidInvoice=async()=>{h.calls.push({name:"void",value:null});return{} as any;};await h.api.cancelHostedPaymentRequests(h.request.invoice_id,"cancel:operation-123",h.provider);const cancel=h.calls.find(call=>call.name==="cancel");assert.ok(cancel);assert.deepEqual(cancel.value,[h.request.invoice_id,"cancel:operation-123"]);assert.ok(h.calls.findIndex(call=>call.name==="void")<h.calls.findIndex(call=>call.name==="cancel"));
});

test("an existing open request is reused without creating another Stripe invoice",async()=>{
  const h=harness();h.request.status="open";h.request.stripe_invoice_id="in_existing";h.request.hosted_invoice_url="https://invoice.stripe.test/existing";
  const result=await h.api.createHostedPaymentRequest({invoiceId:h.request.invoice_id,kind:"full",requestedMethods:["card"],operationKey:"different-operation"},h.provider);
  assert.equal(result.request.stripe_invoice_id,"in_existing");assert.ok(!h.calls.some(call=>call.name==="invoice"));assert.ok(!h.calls.some(call=>call.name==="reserve"));
});

test("Invoice Payments must match the reserved amount before their PaymentIntent is trusted",async()=>{
  const h=harness();h.provider.invoicePayments.list=async()=>({data:[{status:"paid",amount_paid:1,payment:{payment_intent:"pi_wrong"}},{status:"paid",amount_paid:150000,payment:{payment_intent:"pi_exact"}}]}) as any;
  const event={id:"evt_exact",type:"invoice.paid",data:{object:{id:"in_test",metadata:{custom_invoice_id:h.request.invoice_id,payment_request_id:h.request.id},amount_paid:150000,currency:"usd",livemode:false}}};
  assert.equal(await h.api.handleCustomInvoiceStripeWebhook(event,false,h.provider),true);const apply=h.calls.find(call=>call.name==="apply")!.value as any;assert.equal(apply.paymentIntentId,"pi_exact");
});

test("invalid PaymentIntent identifiers are rejected as incomplete evidence",async()=>{
  const h=harness();h.provider.invoicePayments.list=async()=>({data:[{status:"paid",amount_paid:150000,payment:{payment_intent:"not-a-payment-intent"}}]}) as any;
  const event={id:"evt_invalid_pi",type:"invoice.paid",data:{object:{id:"in_test",metadata:{custom_invoice_id:h.request.invoice_id,payment_request_id:h.request.id},amount_paid:150000,currency:"usd",livemode:false}}};
  await assert.rejects(h.api.handleCustomInvoiceStripeWebhook(event,false,h.provider),/evidence is incomplete/);assert.ok(!h.calls.some(call=>call.name==="apply"));
});
