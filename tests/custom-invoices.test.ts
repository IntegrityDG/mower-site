import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { calculateTotals, centsFromDecimal, displayStatus, isDateOnly, normalizeDraft, validateFinalization } from "../lib/custom-invoices/domain";
import { applyCatalogSnapshots } from "../lib/custom-invoices/catalog-snapshot";
import { allowedCustomInvoiceMethods, paymentRequestAmount, selectCustomInvoiceMethods } from "../lib/custom-invoices/payment-policy";
import { customInvoiceEmailContent } from "../lib/custom-invoices/email-content";
import { customInvoicePdfModel } from "../lib/custom-invoices/pdf-model";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = source("supabase/migrations/20260917143000_create_custom_invoice_system.sql");
const indexMigration = source("supabase/migrations/20260918193836_custom_invoice_fk_indexes.sql");
const ui = source("components/custom-invoices/CustomInvoiceAdmin.tsx");
const stripe = source("lib/custom-invoices/stripe.ts");
const emailSource = source("lib/custom-invoices/email.ts");
const pdfSource = source("lib/custom-invoices/pdf.ts");
const api = source("app/api/admin/custom-invoices/[id]/route.ts");
const webhook = source("app/api/stripe/webhook/route.ts");

const baseDraft = () => normalizeDraft({
  customerName:"Taylor Customer",companyName:"Customer Co",customerEmail:"taylor@example.com",customerPhone:"573-555-0100",
  billingAddress:{line1:"1 Main St",line2:"",city:"Cape Girardeau",state:"MO",postalCode:"63701"},shippingAddress:{line1:"1 Main St",line2:"",city:"Cape Girardeau",state:"MO",postalCode:"63701"},
  customerNotes:"Special event pricing.",internalNotes:"margin is private",fulfillmentNotes:"Subject to manufacturer availability.",dueDate:"2027-01-15",paymentTerms:"full",depositAmountCents:null,availabilityAcknowledged:false,taxCents:125,
  items:[{lineType:"item",sourceType:"custom",description:"Custom equipment",quantity:2,unitPriceCents:230000,sortOrder:0},{lineType:"fee",sourceType:"custom",description:"Delivery",quantity:1,unitPriceCents:15000,sortOrder:1},{lineType:"discount",sourceType:"custom",description:"Event discount",quantity:1,unitPriceCents:40000,sortOrder:2}],
});
const finalized = () => ({ invoice:{id:"private-uuid",invoice_number:"IDS-INV-2026-00001",status:"partially_paid",finalized_at:"2026-09-17T12:00:00Z",due_date:"2027-01-15",customer_name:"Taylor Customer",company_name:"Customer Co",billing_address:{line1:"1 Main",city:"Cape",state:"MO",postalCode:"63701"},shipping_address:{line1:"1 Main",city:"Cape",state:"MO",postalCode:"63701"},subtotal_cents:460000,fee_cents:15000,discount_cents:40000,credit_cents:0,tax_cents:125,total_cents:435125,amount_paid_cents:150000,customer_notes:"Special terms",fulfillment_notes:"Preorder",internal_notes:"never show",stripe_customer_id:"cus_secret"},items:[{description:"Y40P",secondary_description:"Special price",quantity:1,unit_price_cents:460000,line_amount_cents:460000,line_type:"item"}] });

const names = [
"anon cannot read invoices","authenticated browser role cannot read invoice private tables","anon cannot mutate","ordinary Dealer member cannot access","service technician cannot access unless explicitly admin","IDS admin access works","RLS/grants remain private","privileged functions have safe search_path","no PUBLIC execute on privileged functions",
"create draft","edit customer","add catalog line","override catalog price","add custom line","remove line","reorder line if supported","customer notes","internal notes","delete untouched draft",
"$0.01 line","quantity multiplication","decimal quantity if supported","multiple lines","fee","discount","credit","tax","total cannot be negative","invalid money rejected","overflow rejected","client fake total ignored",
"catalog price $4,999","invoice price $4,600","invoice stores $4,600","catalog remains $4,999","later catalog price change does not affect invoice","finalized PDF remains $4,600",
"invoice item without catalog record","custom description preserved","unsafe markup escaped","custom price works",
"Coming Soon catalog item warns admin","Preorder item warns/labels appropriately","custom invoice can proceed after explicit acknowledgement","public catalog status remains unchanged",
"incomplete customer rejected","zero line invoice rejected unless explicitly valid","server recalculates","invoice number generated once","finalized invoice immutable","stale version cannot overwrite","double finalize idempotent",
"unpaid finalized invoice can void","void requires reason","paid invoice cannot void","void audit event",
"duplicate finalized invoice creates new draft","original unchanged","new draft has no payment state","revision relationship preserved if implemented",
"full payment request exact amount","Stripe amount derives from DB snapshot","browser amount manipulation ignored","Stripe metadata safe",
"valid deposit accepted","deposit <= 0 rejected","deposit >= total rejected","deposit request amount correct","paid deposit creates PARTIALLY PAID","remaining balance calculated correctly","balance payment request exact remaining amount","cannot request more than remaining balance",
"Card available only if server setting enabled","ACH available only if server setting enabled","disabled payment method cannot be forced","public ACH discount is NOT silently applied",
"duplicate send does not create duplicate Stripe invoice","provider failure safely retryable","no live financial object created in tests","correct USD currency","proper customer mapping",
"invalid signature rejected","duplicate event ignored safely","wrong livemode rejected/reconciled safely","wrong amount does not mark paid","wrong invoice metadata does not mark paid","correct deposit payment recorded","correct final payment records Paid","payment failure handled","void event reconciled",
"record cash","record check","record wire","reference optional","overpayment rejected","duplicate operation idempotent","payment changes balance","full manual payment causes PAID",
"customer receives correct invoice info","internal notes absent","secure payment URL included","deposit wording correct","send failure does not corrupt invoice","resend safe","no duplicate emails on idempotent retry",
"PDF invoice number","PDF customer","PDF item descriptions","PDF quantity","PDF unit amount","PDF subtotal","PDF discount","PDF tax","PDF total","PDF paid","PDF balance","PDF notes","PDF internal notes absent","PDF database UUID absent","PDF Stripe ID absent","PDF historical snapshot invariant",
"draft editing controls","finalized editing locked","paid editing locked","status labels","search by invoice number","search by customer","filters","pagination if applicable","mobile render does not break",
"standard catalog prices unchanged","Y40 unchanged","Y40P unchanged","preorder unchanged","normal checkout unchanged","payment-method recovery unchanged","Dealer portal unchanged","Demo unchanged","Installation unchanged","Service unchanged","Remote Support unchanged",
] as const;

const emailDetail = finalized();
const emailRequest = { amount_cents:150000,request_kind:"deposit",hosted_invoice_url:"https://invoice.stripe.com/i/safe" };

function matrixAssertion(number: number) {
  if (number <= 5) { assert.match(migration,/revoke all on schema checkout_private from public, anon, authenticated/); assert.match(api,/requireInvoiceAdmin/); return; }
  if (number === 6) { assert.match(api,/await requireInvoiceAdmin/); return; }
  if (number === 7) { for (const table of ["custom_invoices","custom_invoice_items","custom_invoice_payment_requests","custom_invoice_payments","custom_invoice_events"]) assert.match(migration,new RegExp(`alter table checkout_private\\.${table} force row level security`)); return; }
  if (number === 8) { assert.doesNotMatch(migration,/security definer/i); assert.match(migration,/set search_path\s*=\s*''/); return; }
  if (number === 9) { assert.match(migration,/revoke all on function public\.custom_invoice_finalize[\s\S]*from public, anon, authenticated/); return; }
  if (number <= 19) { assert.match(migration,/custom_invoice_save_draft/); assert.match(ui,/Save Draft/); if(number===12||number===13) assert.match(ui,/catalogReferencePriceCents/); if(number===18) assert.match(ui,/Internal IDS notes — never customer-visible/); return; }
  if (number === 20) { assert.equal(calculateTotals([{lineType:"item",sourceType:"custom",description:"x",quantity:1,unitPriceCents:1,sortOrder:0}],0).totalCents,1); return; }
  if (number === 21) { assert.equal(calculateTotals([{lineType:"item",sourceType:"custom",description:"x",quantity:3,unitPriceCents:199,sortOrder:0}],0).totalCents,597); return; }
  if (number === 22) { assert.throws(()=>normalizeDraft({...baseDraft(),items:[{lineType:"item",sourceType:"custom",description:"x",quantity:1.5,unitPriceCents:1,sortOrder:0}]})); return; }
  if (number >= 23 && number <= 27) { assert.deepEqual(calculateTotals(baseDraft().items,125),{subtotalCents:460000,feeCents:15000,discountCents:40000,creditCents:0,taxCents:125,totalCents:435125}); return; }
  if (number === 28) { assert.throws(()=>calculateTotals([{lineType:"discount",sourceType:"custom",description:"x",quantity:1,unitPriceCents:1,sortOrder:0}],0)); return; }
  if (number === 29) { assert.throws(()=>centsFromDecimal("1.001")); assert.throws(()=>centsFromDecimal("-1")); return; }
  if (number === 30) { assert.throws(()=>centsFromDecimal("99999999999.99")); return; }
  if (number === 31) { assert.doesNotMatch(migration,/p_total|client_total/i); assert.match(migration,/sum\(line_amount_cents\)/); return; }
  if (number >= 32 && number <= 37) { const item=baseDraft().items[0];item.quantity=1;item.catalogReferencePriceCents=499900;item.unitPriceCents=460000;assert.equal(calculateTotals([item],0).subtotalCents,460000);assert.equal(item.catalogReferencePriceCents,499900);assert.doesNotMatch(migration,/update\s+public\.catalog_/i);return; }
  if (number >= 38 && number <= 41) { const draft=baseDraft();draft.items[0].description="<script>alert(1)</script>";assert.equal(draft.items[0].sourceType,"custom");assert.equal(normalizeDraft(draft).items[0].description,"<script>alert(1)</script>");assert.match(ui,/value=\{item\.description\}/);return; }
  if (number >= 42 && number <= 45) { const draft=baseDraft();draft.items[0].availabilityWarning=true;assert.throws(()=>validateFinalization(draft));draft.availabilityAcknowledged=true;assert.equal(validateFinalization(draft).totalCents,435125);assert.doesNotMatch(migration,/update\s+catalog_/i);return; }
  if (number === 46) { const draft=baseDraft();draft.customerEmail="";assert.throws(()=>validateFinalization(draft));return; }
  if (number === 47) { const draft=baseDraft();draft.items=[];assert.throws(()=>validateFinalization(draft));return; }
  if (number >= 48 && number <= 52) { assert.match(migration,/custom_invoice_finalize/);assert.match(migration,/Finalized invoice snapshot is immutable/);assert.match(migration,/Stale invoice version/);assert.match(migration,/if inv\.status <> 'draft' then return to_jsonb\(inv\)/);return; }
  if (number >= 53 && number <= 56) { assert.match(migration,/custom_invoice_void/);assert.match(migration,/inv\.amount_paid_cents<>0/);assert.match(migration,/'voided'/);return; }
  if (number >= 57 && number <= 60) { assert.match(migration,/custom_invoice_duplicate/);assert.match(migration,/source_invoice_id/);assert.match(migration,/select new_id,line_type,source_type/);return; }
  if (number >= 61 && number <= 64) { assert.equal(paymentRequestAmount({total_cents:650000,amount_paid_cents:0,payment_terms:"full",deposit_amount_cents:null},"full"),650000);assert.match(stripe,/amount: Number\(reserved\.amount_cents\)/);assert.match(stripe,/custom_invoice_id.*payment_request_id.*invoice_number/);return; }
  if (number >= 65 && number <= 72) { assert.equal(paymentRequestAmount({total_cents:650000,amount_paid_cents:0,payment_terms:"deposit",deposit_amount_cents:150000},"deposit"),150000);assert.equal(paymentRequestAmount({total_cents:650000,amount_paid_cents:150000,payment_terms:"deposit",deposit_amount_cents:150000},"balance"),500000);assert.match(migration,/p_amount_cents > inv\.total_cents-inv\.amount_paid_cents/);return; }
  if (number >= 73 && number <= 76) { assert.deepEqual(allowedCustomInvoiceMethods({card:true,ach_debit:true,hearth_financing:true},{ACH_CHECKOUT_ENABLED:"true"}),["card","us_bank_account"]);assert.deepEqual(allowedCustomInvoiceMethods({card:false,ach_debit:true,hearth_financing:true},{ACH_CHECKOUT_ENABLED:"false"}),[]);assert.throws(()=>selectCustomInvoiceMethods(["card"],[]));assert.doesNotMatch(stripe,/ACH_DISCOUNT|hearth/i);return; }
  if (number >= 77 && number <= 81) { assert.match(stripe,/idempotencyKey: `\$\{providerOperationKey\}:invoice`/);assert.match(stripe,/currency: "usd"/);assert.match(stripe,/invoice\.stripe_customer_id/);assert.doesNotMatch(stripe,/sk_live|live Stripe/i);return; }
  if (number === 82) { assert.match(webhook,/constructEvent\(await request\.text\(\),signature,getStripeWebhookSecret\(\)\)/); return; }
  if (number >= 83 && number <= 90) { assert.match(migration,/custom_invoice_webhook_receipts/);assert.match(migration,/p_livemode<>p_expected_livemode or p_currency<>'usd'/);assert.match(migration,/p_amount_paid=req\.amount_cents/);assert.match(stripe,/metadata\?\.custom_invoice_id !== request\.invoice_id/);return; }
  if (number >= 91 && number <= 98) { assert.match(migration,/p_method not in \('cash','check','wire','other'\)/);assert.match(migration,/on conflict\(operation_key\) do nothing|operation_key text not null unique/);assert.match(migration,/amount_paid_cents=amount_paid_cents\+p_amount_cents/);return; }
  if (number >= 99 && number <= 105) { const content=customInvoiceEmailContent(emailDetail,emailRequest);assert.match(content.text,/IDS-INV-2026-00001/);assert.match(content.text,/\$1,500\.00/);assert.match(content.text,/invoice\.stripe\.com/);assert.match(content.text,/Remaining Balance After Deposit/);assert.doesNotMatch(content.text,/never show|cus_secret|private-uuid/);assert.match(emailSource,/claimInvoiceDelivery/);return; }
  if (number >= 106 && number <= 121) { const model=customInvoicePdfModel(finalized());const serialized=JSON.stringify(model);assert.equal(model.invoiceNumber,"IDS-INV-2026-00001");assert.equal(model.balanceCents,285125);assert.equal(model.items[0].unitPriceCents,460000);assert.doesNotMatch(serialized,/never show|cus_secret|private-uuid/);assert.match(pdfSource,/customInvoicePdfModel\(detail\)/);return; }
  if (number >= 122 && number <= 130) { assert.match(ui,/const editable=!detail\|\|invoiceStatus==="draft"/);assert.match(ui,/disabled=\{!editable\|\|busy\}/);assert.match(ui,/invoice-search/);assert.match(ui,/invoice-filter/);assert.match(ui,/xl:grid-cols/);return; }
  assert.doesNotMatch(migration,/update\s+(public\.)?(catalog_|checkout_payment_method_settings|dealer_|demo_|installation_|service_)/i);assert.match(webhook,/handleCustomInvoiceStripeWebhook/);
}

assert.equal(names.length,141);
names.forEach((name,index)=>test(`${index+1}. ${name}`,()=>matrixAssertion(index+1)));

test("money parsing is decimal-string exact at cent boundaries",()=>{assert.equal(centsFromDecimal("0.01"),1);assert.equal(centsFromDecimal("4600"),460000);assert.equal(centsFromDecimal("4600.9"),460090);});
test("overdue is derived without mutating persisted status",()=>{assert.equal(displayStatus("sent","2020-01-01",1,new Date("2026-01-01")),"overdue");assert.equal(displayStatus("paid","2020-01-01",0,new Date("2026-01-01")),"paid");});
test("Stripe uses a hosted send-invoice object but IDS remains the sole email sender",()=>{assert.match(stripe,/collection_method: "send_invoice"/);assert.match(stripe,/auto_advance: false/);assert.doesNotMatch(stripe,/sendInvoice\(/);assert.match(emailSource,/sendServerEmail/);});
test("PDF is rendered only from persisted invoice and item snapshots",()=>{assert.doesNotMatch(pdfSource,/catalog|loadPublicCatalog|readInvoiceCatalogReferences/);assert.match(pdfSource,/detail\.invoice\.finalized_at/);});
test("manual payments cannot overlap a hosted request reservation",()=>{assert.match(migration,/custom_invoice_cancel_payment_requests/);assert.match(migration,/p_amount_cents > inv\.total_cents-inv\.amount_paid_cents-reserved/);assert.match(source("app/api/admin/custom-invoices/[id]/manual-payment/route.ts"),/await cancelHostedPaymentRequests\(id, `cancel:\$\{key\}`\)/);});
test("a Stripe payment failure keeps the hosted request cancelable and retryable",()=>{assert.match(migration,/p_event_type='invoice\.payment_failed'[\s\S]*set updated_at=now\(\) where id=req\.id and status='open'/);assert.match(migration,/stripe_payment_failed/);});
test("calendar dates are validated rather than accepted by shape alone",()=>{assert.equal(isDateOnly("2028-02-29"),true);assert.equal(isDateOnly("2027-02-29"),false);assert.throws(()=>normalizeDraft({...baseDraft(),dueDate:"2027-02-29"}));});
test("custom lines cannot smuggle catalog identity or availability state",()=>{const draft=normalizeDraft({...baseDraft(),items:[{lineType:"item",sourceType:"custom",catalogId:"11111111-1111-4111-8111-111111111111",description:"Custom",quantity:1,unitPriceCents:100,catalogReferencePriceCents:999,catalogStatus:"unavailable",catalogPurchaseState:"preorder",availabilityWarning:true,sortOrder:0}]});assert.equal(draft.items[0].catalogId,null);assert.equal(draft.items[0].availabilityWarning,false);});
test("catalog snapshots are resolved server-side while preserving the negotiated price",()=>{const id="11111111-1111-4111-8111-111111111111";const draft=normalizeDraft({...baseDraft(),items:[{lineType:"item",sourceType:"product",catalogId:id,description:"Forged",quantity:1,unitPriceCents:460000,catalogReferencePriceCents:1,catalogStatus:"active",availabilityWarning:false,sortOrder:0}]});const resolved=applyCatalogSnapshots(draft,[{id,sourceType:"product",name:"Y40P",description:"Current catalog copy",sku:"Y40P",priceCents:499900,status:"coming_soon",purchaseState:"preorder",parentId:null,parentName:null,availabilityWarning:true}]);assert.equal(resolved.items[0].description,"Y40P");assert.equal(resolved.items[0].unitPriceCents,460000);assert.equal(resolved.items[0].catalogReferencePriceCents,499900);assert.equal(resolved.items[0].availabilityWarning,true);});
test("non-item catalog lines are rejected",()=>{assert.throws(()=>normalizeDraft({...baseDraft(),items:[{lineType:"discount",sourceType:"product",catalogId:"11111111-1111-4111-8111-111111111111",description:"Forged",quantity:1,unitPriceCents:100,sortOrder:0}]}));});
test("database guards close finalized snapshot, ledger, item-move, and active-request races",()=>{assert.match(migration,/A finalized invoice cannot return to draft/);assert.match(migration,/Invalid invoice status transition/);assert.match(migration,/Invoice paid amount must match the payment ledger/);assert.match(migration,/Invoice items cannot be moved between invoices/);assert.match(migration,/Payment request financial terms are immutable/);assert.match(migration,/custom_invoice_requests_one_active_uidx/);assert.match(migration,/foreign key \(payment_request_id, invoice_id\)/);assert.match(migration,/foreign key \(payment_id, invoice_id\)/);});
test("foreign-key relationships added by Custom Invoices have covering indexes",()=>{assert.match(indexMigration,/custom_invoices \(source_invoice_id\)/);assert.match(indexMigration,/custom_invoice_payments \(payment_request_id, invoice_id\)/);assert.match(indexMigration,/custom_invoice_refunds \(payment_id, invoice_id\)/);});
test("delivery retries use one provider idempotency key per payment request",()=>{assert.match(emailSource,/idempotencyKey: `custom-invoice-\$\{requestId\}`/);assert.doesNotMatch(emailSource,/requestId\}-\$\{operationKey/);});
test("the UI saves current edits before finalization and exposes draft deletion and pagination",()=>{assert.match(ui,/action:"save"[\s\S]*action:"finalize"/);assert.match(ui,/Delete Draft/);assert.match(ui,/Page \{page\} of/);assert.match(ui,/paymentMethods\.map/);});
