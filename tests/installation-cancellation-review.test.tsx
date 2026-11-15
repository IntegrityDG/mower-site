import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { installationBalance } from "../lib/installations/accounting";
import { prepareAdminOperation, type AdminState } from "../lib/installations/admin-policy";
import { DEFAULT_PRICING } from "../lib/installations/policy";
import { cancellationCopy, reviewedCancellation, usesReviewedCancellation, INSTALLATION_TERMS_VERSION, type CancellationReview } from "../lib/installations/cancellation";
import InstallationCancellationTerms from "../components/installations/InstallationCancellationTerms";
import InstallationCancellationSummary from "../components/installations/InstallationCancellationSummary";
import InstallationCancellationReview from "../components/installations/InstallationCancellationReview";
import { processorFixture } from "./helpers/installation-stripe-fixtures";

const now = new Date("2026-11-15T12:00:00Z");
function fixture(amount = 100000) {
  const { state } = processorFixture(amount);
  state.installation.terms_version = INSTALLATION_TERMS_VERSION;
  return state;
}
const body = (extra: Record<string, unknown> = {}) => ({ action: "cancel", operationKey: randomUUID(), reason: "Synthetic staff-reviewed cancellation", cancellationCause: "customer", cancellationReviewed: true, ...extra });
const balance = (state: AdminState) => installationBalance(DEFAULT_PRICING, state.adjustments, state.payments, state.corrections, state.cashRefunds);
const plan = (state: AdminState, extra: Record<string, unknown> = {}) => prepareAdminOperation(state, body(extra), DEFAULT_PRICING, now);
function close(state: AdminState, extra: Record<string, unknown> = {}) {
  const op = plan(state, extra);
  Object.assign(state.installation, op.patch);
  state.adjustments.push(...op.adjustments.map(a => ({ ...a, id: randomUUID(), amount_cents: Number(a.amount_cents) })));
  return op;
}

test("review defaults to zero and only exact saved new version selects new terms", () => {
  assert.deepEqual(reviewedCancellation(balance(fixture()), body()), { cause: "customer", feeCents: 0, purchasedMaterialsCents: 0, materialsChoice: "not_applicable", settlementFinal: true });
  for (const version of [null, undefined, "2026-09-04", "2026-09-08-setup", "future"]) assert.equal(usesReviewedCancellation(version), false);
  assert.equal(usesReviewedCancellation(INSTALLATION_TERMS_VERSION), true);
});
for (const [paid, materials, requested, fee, refund] of [[100000,15000,25000,25000,60000],[30000,20000,25000,10000,0],[10000,10000,25000,0,0],[0,0,25000,0,0],[100000,0,12345,12345,87655]]) {
  test(`materials-first cap: paid ${paid}, materials ${materials}, fee request ${requested}`, () => {
    const state=fixture(paid);
    const op=plan(state,{purchasedMaterialsCents:materials,materialsPurchaseEvidence:"Synthetic purchase receipt",cancellationFeeCents:requested});
    const review=op.patch.cancellation_review as CancellationReview;
    assert.equal(review.feeCents,fee); assert.equal(review.materialsChoice,materials ? "awaiting_choice" : "not_applicable");
    assert.equal(op.balanceAfter.approvedChargesCents,materials+fee); assert.equal(op.balanceAfter.customerCreditCents,refund); assert.equal(op.balanceAfter.balanceDueCents,0);
    assert.equal(op.balanceAfter.netPaidCents,op.balanceBefore.netPaidCents); assert.equal(op.balanceAfter.completedRefundsCents,0);
  });
}
for (const field of ["cancellationFeeCents","purchasedMaterialsCents"]) for (const value of [-1, 1.5, "100", NaN, Infinity, Number.MAX_SAFE_INTEGER+1]) {
  test(`reject invalid ${field} ${String(value)}`,()=>assert.throws(()=>reviewedCancellation(balance(fixture()),body({[field]:value})),/invalid_/));
}
test("review, cause, cap, purchase evidence and collected-payment validation fail closed",()=>{
  for(const [extra,error] of [
    [{cancellationReviewed:false},/cancellation_review_required/], [{cancellationCause:"unknown"},/cancellation_cause_required/],
    [{cancellationFeeCents:25001},/cancellation_fee_exceeds_250/], [{purchasedMaterialsCents:100001},/purchased_materials_exceed_collected_payment/],
    [{purchasedMaterialsCents:100},/verified_materials_purchase_required/], [{purchasedMaterialsCents:100,materialsPurchaseEvidence:"  "},/verified_materials_purchase_required/],
    [{materialsPurchaseEvidence:3},/invalid_materials_purchase_evidence/], [{materialsPurchaseEvidence:"x".repeat(2001)},/invalid_materials_purchase_evidence/],
  ] as const) assert.throws(()=>reviewedCancellation(balance(fixture()),body(extra)),error);
});
test("net collected excludes completed refunds, cash returns and receipt corrections",()=>{
  const state=fixture(50000); const p=state.payments[0]; p.method="cash"; p.refunded_cents=5000;p.status="partially_refunded";
  state.cashRefunds=[{id:randomUUID(),original_payment_id:p.id,amount_cents:10000}]; state.corrections=[{id:randomUUID(),original_payment_id:p.id,amount_cents:5000}];
  const op=plan(state,{purchasedMaterialsCents:10000,materialsPurchaseEvidence:"Receipt",cancellationFeeCents:25000});
  assert.equal(op.balanceBefore.netPaidCents,30000);assert.equal((op.patch.cancellation_review as CancellationReview).feeCents,20000);assert.equal(op.balanceAfter.balanceDueCents,0);
});
test("pending processor refunds block all cancellation causes",()=>{
  const state=fixture();state.payments.push({...state.payments[0],id:randomUUID(),purpose:"refund",status:"pending",amount_cents:1000,paid_at:null,original_payment_id:state.payments[0].id});
  for(const cancellationCause of ["customer","ids","full_refund_required"])assert.throws(()=>plan(state,{cancellationCause}),/resolve_pending_refunds/);
});
test("customer settlement replaces allowance, travel and other charges rather than retaining them twice",()=>{
  const state=fixture();state.installation.setup_selected=true;
  state.adjustments=[{id:randomUUID(),amount_cents:50000,reconciliation_kind:"setup_base"},{id:randomUUID(),amount_cents:7000,reconciliation_kind:"travel"},{id:randomUUID(),amount_cents:2500,reconciliation_kind:"materials"}];
  const op=plan(state,{purchasedMaterialsCents:10000,materialsPurchaseEvidence:"Actual purchase",cancellationFeeCents:5000});
  assert.equal(op.balanceAfter.approvedChargesCents,15000);assert.equal(op.balanceAfter.customerCreditCents,85000);
});
test("IDS cancellation has zero fee with separate accounting review; legal full refund retains nothing",()=>{
  for(const cause of ["ids","full_refund_required"]){
    const state=fixture();state.adjustments=[{id:randomUUID(),amount_cents:3500,reconciliation_kind:"travel"}];
    for(const extra of [{cancellationFeeCents:1},{purchasedMaterialsCents:1}])assert.throws(()=>plan(state,{cancellationCause:cause,...extra}),/no_customer_deductions/);
    const op=plan(state,{cancellationCause:cause});const review=op.patch.cancellation_review as CancellationReview;
    assert.equal(review.feeCents,0);assert.equal(review.settlementFinal,cause!=="ids");assert.equal(op.balanceAfter.approvedChargesCents,cause==="ids"?23500:0);
  }
});
test("historical work including zero/corrected sessions and cash-failure route block new cancellation",()=>{
  for(const status of ["running","paused","corrected"]){const state=fixture();state.sessions=[{id:randomUUID(),status,duration_minutes:0,duration_seconds:0,corrected_from_id:null,started_at:now.toISOString(),ended_at:status==="running"?null:now.toISOString(),notes:null}];assert.throws(()=>plan(state),/use_work_or_safety_termination/);}
  const state=fixture();state.installation.special_cash_failure_reschedule=true;assert.throws(()=>plan(state),/use_cash_failure_resolution/);
});
test("final settlement blocks later financial changes and duplicate new cancellation",()=>{
  for(const cause of ["customer","full_refund_required"]){const state=fixture();close(state,{cancellationCause:cause});
    for(const action of ["pricing","travel","adjustment","materials","setup_materials","labor","underground","session_correct"])assert.throws(()=>prepareAdminOperation(state,{action,operationKey:randomUUID(),reason:"Attempt mutation"},DEFAULT_PRICING,now),/cancellation_settlement_locked/);
    assert.throws(()=>plan(state),/installation_closed/);
  }
});
test("pickup or forfeiture requires explicit customer choice and does not change financial settlement",()=>{
  for(const materialsChoice of ["pickup","forfeit"]){const state=fixture();close(state,{purchasedMaterialsCents:10000,materialsPurchaseEvidence:"Receipt"});
    const input={action:"cancellation_materials_choice",operationKey:randomUUID(),reason:"Customer choice evidence",materialsChoice,customerChoiceConfirmed:true};
    for(const invalid of [{customerChoiceConfirmed:false},{materialsChoice:"awaiting_choice"}])assert.throws(()=>prepareAdminOperation(state,{...input,...invalid},DEFAULT_PRICING,now),/customer_materials_choice_required/);
    const op=prepareAdminOperation(state,input,DEFAULT_PRICING,now);assert.equal((op.patch.cancellation_review as CancellationReview).materialsChoice,materialsChoice);assert.deepEqual(op.balanceAfter,op.balanceBefore);assert.deepEqual(op.adjustments,[]);
  }
  const state=fixture();close(state);assert.throws(()=>prepareAdminOperation(state,{action:"cancellation_materials_choice",operationKey:randomUUID(),reason:"No materials",materialsChoice:"pickup",customerChoiceConfirmed:true},DEFAULT_PRICING,now),/choice_unavailable/);
});
for(const version of ["2026-09-04","2026-09-08-setup"])for(const [hours,retained] of [[49,0],[48,12500],[24,12500],[23,25000]])test(`legacy ${version} ${hours}h timing remains unchanged`,()=>{
  const state=fixture();state.installation.terms_version=version;state.installation.requested_start_at=new Date(now.getTime()+hours*3600000).toISOString();
  const op=prepareAdminOperation(state,{action:"cancel",operationKey:randomUUID(),reason:"Legacy cancellation"},DEFAULT_PRICING,now);
  assert.equal(op.balanceAfter.approvedChargesCents,20000+retained);assert.equal(op.patch.cancellation_review,undefined);assert.throws(()=>plan(state),/review_saved_cancellation_terms/);
});
test("public SSR uses saved version and does not imply an automatic refund",()=>{
  const current=renderToStaticMarkup(<InstallationCancellationTerms/>);assert.match(current,/case-by-case/);assert.match(current,/purchased/);assert.match(current,/pick up/);assert.match(current,/does not itself send a refund/);assert.doesNotMatch(current,/24–48 hours/);
  const legacy=renderToStaticMarkup(<InstallationCancellationTerms termsVersion="2026-09-08-setup"/>);assert.match(legacy,/24–48 hours/);assert.doesNotMatch(legacy,/case-by-case/);
  assert.match(cancellationCopy("unknown"),/verify/);
});
test("review SSR starts at zero, requires review and never implies automatic materials forfeiture",()=>{
  const html=renderToStaticMarkup(<InstallationCancellationReview installationId={randomUUID()} closed={false} disabled={false} onSaved={async()=>{}}/>);
  assert.equal((html.match(/value="0.00"/g)||[]).length,2);assert.match(html,/cancellationReviewed/);assert.match(html,/materialsPurchaseEvidence/);assert.match(html,/never charges or returns money/);
  const review=reviewedCancellation(balance(fixture()),body({purchasedMaterialsCents:10000,materialsPurchaseEvidence:"Receipt"}));
  const summary=renderToStaticMarkup(<InstallationCancellationSummary review={review}/>);assert.match(summary,/No automatic forfeiture/);assert.match(summary,/Only completed refunds/);
  const pickup=renderToStaticMarkup(<InstallationCancellationSummary review={{...review,materialsChoice:"pickup"}}/>);assert.match(pickup,/does not record a completed pickup/);
  const closed=renderToStaticMarkup(<InstallationCancellationReview installationId={randomUUID()} closed review={review} disabled={false} onSaved={async()=>{}}/>);assert.match(closed,/customerChoiceConfirmed/);assert.doesNotMatch(closed,/Record reviewed cancellation/);
});

test("unknown or missing accepted terms cannot silently use a legacy cancellation calculation",()=>{
  for(const version of [undefined,null,"unknown"]){const state=fixture();state.installation.terms_version=version;assert.throws(()=>prepareAdminOperation(state,{action:"cancel",operationKey:randomUUID(),reason:"Verify saved terms"},DEFAULT_PRICING,now),/review_saved_cancellation_terms/);}
});

test("unknown or missing saved terms never silently execute legacy settlement",()=>{
  for(const terms_version of [undefined,null,"unknown"]){const state=fixture();state.installation.terms_version=terms_version;assert.throws(()=>prepareAdminOperation(state,{action:"cancel",operationKey:randomUUID(),reason:"Verify terms"},DEFAULT_PRICING,now),/review_saved_cancellation_terms/);}
});
test("unapproved cancellation has no invented charge even after default pricing changes",()=>{
  const state=fixture(0);state.payments=[];Object.assign(state.installation,{status:"requested",pricing_snapshot:null,draft_pricing:null});
  const op=close(state);assert.equal(op.balanceBefore.approvedChargesCents,0);assert.equal(op.balanceAfter.approvedChargesCents,0);assert.deepEqual(op.adjustments,[]);
  const later=prepareAdminOperation(state,{action:"cancellation_full_refund",operationKey:randomUUID(),reason:"Confirmed statutory requirement",cancellationReviewed:true},{...DEFAULT_PRICING,laborCents:160000,materialsAllowanceCents:40000},now);
  assert.equal(later.balanceBefore.approvedChargesCents,0);assert.equal(later.balanceAfter.approvedChargesCents,0);assert.deepEqual(later.adjustments,[]);
});
test("later full-refund decision compensates prior settlement without rewriting history or payment evidence",()=>{
  const state=fixture();close(state,{purchasedMaterialsCents:10000,materialsPurchaseEvidence:"Receipt",cancellationFeeCents:15000});const before=structuredClone(state);
  const op=prepareAdminOperation(state,{action:"cancellation_full_refund",operationKey:randomUUID(),reason:"Confirmed applicable requirement",cancellationReviewed:true},DEFAULT_PRICING,now);
  assert.deepEqual(state,before);assert.equal(op.patch.status,undefined);assert.equal(op.adjustments.length,1);assert.equal(op.adjustments[0].amount_cents,-25000);assert.equal(op.adjustments[0].reconciliation_kind,"cancellation_full_refund");
  assert.equal(op.balanceAfter.approvedChargesCents,0);assert.equal(op.balanceAfter.customerCreditCents,100000);assert.equal(op.balanceAfter.netPaidCents,op.balanceBefore.netPaidCents);assert.deepEqual(op.sessions,[]);assert.equal(op.stopSession,null);
  assert.equal((op.patch.cancellation_review as CancellationReview).cause,"full_refund_required");
});
test("later statutory override requires a closed reviewed booking, explicit verification and resolved refund/work state",()=>{
  const input={action:"cancellation_full_refund",operationKey:randomUUID(),reason:"Requirement verified",cancellationReviewed:true};
  assert.throws(()=>prepareAdminOperation(fixture(),input,DEFAULT_PRICING,now),/unavailable/);
  for(const extra of [{cancellationReviewed:false},{cancellationReviewed:undefined}]){const state=fixture();close(state);assert.throws(()=>prepareAdminOperation(state,{...input,...extra},DEFAULT_PRICING,now),/cancellation_review_required/);}
  for(const variation of ["cash","work","pending","legacy","no_review"]){const state=fixture();close(state);
    if(variation==="cash")state.installation.special_cash_failure_reschedule=true;
    if(variation==="work")state.sessions=[{id:randomUUID(),status:"paused",duration_minutes:0,corrected_from_id:null,started_at:now.toISOString(),ended_at:now.toISOString(),notes:null}];
    if(variation==="pending")state.payments.push({...state.payments[0],id:randomUUID(),purpose:"refund",status:"pending",paid_at:null,amount_cents:1,original_payment_id:state.payments[0].id});
    if(variation==="legacy")state.installation.terms_version="2026-09-04";
    if(variation==="no_review")delete state.installation.cancellation_review;
    assert.throws(()=>prepareAdminOperation(state,input,DEFAULT_PRICING,now),/unavailable|use_work_or_safety|resolve_pending_refunds/);
  }
  const declined=fixture(0);declined.payments=[];Object.assign(declined.installation,{status:"requested",pricing_snapshot:null});const op=prepareAdminOperation(declined,{action:"decline",operationKey:randomUUID(),reason:"IDS decline"},DEFAULT_PRICING,now);Object.assign(declined.installation,op.patch);assert.equal(prepareAdminOperation(declined,input,DEFAULT_PRICING,now).patch.status,undefined);
});

test("IDS Setup-only cancellation honors booked discount after subscriber eligibility expires",()=>{
  for(const extras of [false,true]){
    const state=fixture(50000);Object.assign(state.installation,{installation_selected:false,setup_selected:true,pricing_snapshot:{...DEFAULT_PRICING,laborCents:0,materialsAllowanceCents:0,setupLaborCents:50000}});
    state.adjustments=[{id:randomUUID(),amount_cents:50000,reconciliation_kind:"setup_base"},{id:randomUUID(),amount_cents:-12500,reconciliation_kind:"setup_discount"}];
    if(extras)state.adjustments.push({id:randomUUID(),amount_cents:3000,reconciliation_kind:"setup_materials"},{id:randomUUID(),amount_cents:3500,reconciliation_kind:"travel"});
    const op=prepareAdminOperation(state,body({cancellationCause:"ids"}),DEFAULT_PRICING,now,false);
    assert.equal(op.adjustments[0].amount_cents,-37500);assert.equal(op.balanceAfter.approvedChargesCents,extras?6500:0);
    assert.equal((op.patch.cancellation_review as CancellationReview).feeCents,0);assert.equal((op.patch.cancellation_review as CancellationReview).settlementFinal,false);
  }
});
