import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import PurchaseMethod from "../components/customer-paths/purchase/PurchaseMethod";
import { paymentMethodIsAvailableForNewCheckout } from "../lib/checkout/payment-method-availability";
import { createPaymentMethodAdminHandlers } from "../lib/payment-method-settings/admin-handlers";
import { customerPurchaseMethodIsAvailable, SEEDED_PAYMENT_METHOD_SETTINGS, toPublicPaymentMethodAvailability, type PaymentMethodSettings } from "../lib/payment-method-settings/types";

const enabled: PaymentMethodSettings = { card:true, ach_debit:true, hearth_financing:true };
const request = (body:unknown)=>new Request("http://local/api/admin/payment-methods",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(body)});

test("payment method admin reads and writes require IDS authentication",async()=>{const handlers=createPaymentMethodAdminHandlers({isAdmin:async()=>false,read:async()=>enabled,save:async(paymentMethod,value)=>({paymentMethod,enabled:value})});assert.equal((await handlers.GET()).status,401);assert.equal((await handlers.PATCH(request({paymentMethod:"card",enabled:false}))).status,401);});

test("authorized IDS admin can read and change supported settings",async()=>{let stored={...enabled};const handlers=createPaymentMethodAdminHandlers({isAdmin:async()=>true,read:async()=>stored,save:async(paymentMethod,value)=>{stored={...stored,[paymentMethod]:value};return{paymentMethod,enabled:value};}});assert.deepEqual((await (await handlers.GET()).json()).settings,enabled);assert.equal((await handlers.PATCH(request({paymentMethod:"ach_debit",enabled:false}))).status,200);assert.equal(stored.ach_debit,false);assert.equal((await handlers.PATCH(request({paymentMethod:"wire_transfer",enabled:true}))).status,400);});

test("public projection exposes only safe availability and applies ACH hard switch",()=>{assert.deepEqual(toPublicPaymentMethodAvailability(enabled,false),{card:true,achDebit:false,hearthFinancing:true});assert.deepEqual(Object.keys(toPublicPaymentMethodAvailability(enabled,true)).sort(),["achDebit","card","hearthFinancing"]);});

test("new ACH checkout requires both database enablement and ACH_CHECKOUT_ENABLED",async()=>{assert.equal(await paymentMethodIsAvailableForNewCheckout("ach_debit",async()=>enabled,{ACH_CHECKOUT_ENABLED:"true"}),true);assert.equal(await paymentMethodIsAvailableForNewCheckout("ach_debit",async()=>({...enabled,ach_debit:false}),{ACH_CHECKOUT_ENABLED:"true"}),false);assert.equal(await paymentMethodIsAvailableForNewCheckout("ach_debit",async()=>enabled,{ACH_CHECKOUT_ENABLED:"false"}),false);});

test("new card checkout is blocked by its database setting and fails closed on lookup error",async()=>{assert.equal(await paymentMethodIsAvailableForNewCheckout("card",async()=>enabled,{}),true);assert.equal(await paymentMethodIsAvailableForNewCheckout("card",async()=>({...enabled,card:false}),{}),false);assert.equal(await paymentMethodIsAvailableForNewCheckout("card",async()=>{throw new Error("db");},{}),false);});

const renderMethods=(availability:{card:boolean;achDebit:boolean;hearthFinancing:boolean})=>renderToStaticMarkup(<PurchaseMethod selectedMethod="" checkoutAvailable configuredTotalCents={100000} hearthUrl="https://example.com" onSelectMethod={()=>undefined} availability={availability}/>);
test("disabled Card, ACH, and Hearth methods are absent and wire is always absent",()=>{const html=renderMethods({card:false,achDebit:false,hearthFinancing:false});assert.doesNotMatch(html,/>Card</);assert.doesNotMatch(html,/>ACH</);assert.doesNotMatch(html,/Explore financing through Hearth/);assert.doesNotMatch(html,/wire/i);assert.match(html,/temporarily unavailable/);assert.match(html,/href="\/#contact-us"/);});
test("each enabled customer method renders independently",()=>{assert.match(renderMethods({card:true,achDebit:false,hearthFinancing:false}),/>Card</);assert.doesNotMatch(renderMethods({card:true,achDebit:false,hearthFinancing:false}),/>ACH</);assert.match(renderMethods({card:false,achDebit:false,hearthFinancing:true}),/Explore financing through Hearth/);});
test("stale customer selections are invalid when their method is disabled",()=>{const off={card:false,achDebit:false,hearthFinancing:false};assert.equal(customerPurchaseMethodIsAvailable("pay-in-full",off,true),false);assert.equal(customerPurchaseMethodIsAvailable("ach",enabledProjection(),false),false);assert.equal(customerPurchaseMethodIsAvailable("hearth-financing",off,true),false);});
function enabledProjection(){return{card:true,achDebit:true,hearthFinancing:true};}

test("migration seeds Card on, ACH off, Hearth on and keeps the table private",()=>{assert.deepEqual(SEEDED_PAYMENT_METHOD_SETTINGS,{card:true,ach_debit:false,hearth_financing:true});const sql=readFileSync("supabase/migrations/20260811030746_create_checkout_payment_method_settings.sql","utf8");assert.match(sql,/check \(payment_method in \('card', 'ach_debit', 'hearth_financing'\)\)/);assert.match(sql,/\('card', true\)[\s\S]*\('ach_debit', false\)[\s\S]*\('hearth_financing', true\)/);assert.match(sql,/enable row level security/);assert.match(sql,/revoke all[\s\S]*from anon, authenticated/);assert.match(sql,/grant select, update[\s\S]*to service_role/);});

test("new Card and ACH session routes enforce database-backed availability before processing",()=>{for(const path of ["app/api/checkout/session/route.ts","app/api/checkout/ach/session/route.ts"]){const source=readFileSync(path,"utf8");assert.match(source,/await paymentMethodIsAvailableForNewCheckout/);}assert.doesNotMatch(readFileSync("components/customer-paths/purchase/PurchaseMethod.tsx","utf8"),/wire_transfer|Wire Transfer/);});

test("webhook reconciliation remains independent of customer visibility settings",()=>{const source=readFileSync("app/api/stripe/webhook/route.ts","utf8");assert.doesNotMatch(source,/payment-method-settings|paymentMethodIsAvailableForNewCheckout/);assert.match(source,/reconcile/);});
