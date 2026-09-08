import type Stripe from "stripe";
import { createHash } from "node:crypto";
import { cents, installationBalance, type InstallationPayment } from "./accounting";
import type { AdminState } from "./admin-policy";

export type InstallationStripePayment = InstallationPayment & {
  installation_id:string;stripe_session_id:string|null;stripe_payment_intent_id:string|null;stripe_charge_id:string|null;stripe_refund_id:string|null;
  processor_request:Stripe.Checkout.SessionCreateParams|Stripe.RefundCreateParams|null;processor_operation_payload:Record<string,unknown>|null;
  processor_state:string|null;processor_status:string|null;processor_created_at:string|null;processor_observed_at:string|null;
  refund_balance_transaction_id:string|null;refund_failure_balance_transaction_id:string|null;last_processor_event_created:number|null;
  idempotency_key:string;currency:string;livemode:boolean;created_at:string;
};
export const stripeObjectId=(v:string|{id:string}|null|undefined)=>typeof v==="string"?v:v?.id??null;
function check(ok:unknown,name:string):asserts ok {if(!ok)throw new Error(`installation_stripe_${name}`);}
function timestamp(seconds:number){check(Number.isSafeInteger(seconds)&&seconds>0,"invalid_timestamp");return new Date(seconds*1000).toISOString();}
function metadata(meta:Stripe.Metadata|null|undefined,p:InstallationStripePayment){
  check(meta?.ids_kind==="professional_installation"&&meta.installation_id===p.installation_id&&meta.purpose===p.purpose,"metadata_mismatch");
  if(p.processor_request||meta?.payment_id)check(meta?.payment_id===p.id,"payment_link_mismatch");
}
export function validateInstallationSession(session:Stripe.Checkout.Session,p:InstallationStripePayment){
  check(p.method==="stripe"&&p.purpose!=="refund"&&!p.livemode&&session.livemode===false&&session.id.startsWith("cs_test_"),"mode_mismatch");
  check(!p.stripe_session_id||session.id===p.stripe_session_id,"session_mismatch");metadata(session.metadata,p);
  check(session.mode==="payment"&&session.amount_total===p.amount_cents&&session.currency===p.currency&&p.currency==="usd","amount_currency_mismatch");
  check(session.payment_method_types.length===1&&session.payment_method_types[0]==="card","method_mismatch");
  if(p.processor_request)check(session.client_reference_id===p.id,"client_reference_mismatch");
  const intent=stripeObjectId(session.payment_intent);if(p.stripe_payment_intent_id)check(intent===p.stripe_payment_intent_id,"intent_mismatch");
}
export function validateInstallationPayment(session:Stripe.Checkout.Session,intent:Stripe.PaymentIntent,charge:Stripe.Charge,p:InstallationStripePayment){
  validateInstallationSession(session,p);metadata(intent.metadata,p);metadata(charge.metadata,p);
  check(session.status==="complete"&&session.payment_status==="paid"&&intent.status==="succeeded"&&charge.status==="succeeded"&&charge.paid&&charge.captured,"payment_not_successful");
  check(stripeObjectId(session.payment_intent)===intent.id&&stripeObjectId(intent.latest_charge)===charge.id&&stripeObjectId(charge.payment_intent)===intent.id,"processor_link_mismatch");
  check(!p.stripe_charge_id||p.stripe_charge_id===charge.id,"charge_mismatch");
  check(intent.livemode===false&&charge.livemode===false&&intent.amount===p.amount_cents&&intent.amount_received===p.amount_cents&&charge.amount===p.amount_cents&&charge.amount_captured===p.amount_cents
    &&intent.currency===p.currency&&charge.currency===p.currency,"payment_amount_mode_mismatch");
  check(["automatic","automatic_async"].includes(intent.capture_method),"capture_method_mismatch");
  cents(charge.amount_refunded,"refund");check(charge.amount_refunded<=charge.amount,"refund_exceeds_payment");
}
function referenceUuid(value:string){const h=createHash("sha256").update("ids-installation-stripe-refund:"+value).digest("hex");return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;}
export function installationStripeProjection(state:AdminState,p:InstallationStripePayment,session:Stripe.Checkout.Session,intent:Stripe.PaymentIntent|null,charge:Stripe.Charge|null,refunds:Stripe.Refund[],eventCreated:number|null,observedAt=new Date().toISOString()){
  validateInstallationSession(session,p);const paid=session.status==="complete"&&session.payment_status==="paid";
  if(paid){check(intent&&charge,"missing_payment_evidence");validateInstallationPayment(session,intent,charge,p);}
  else check(!p.paid_at&&refunds.length===0,"payment_regression");
  const stored=state.payments as InstallationStripePayment[],oldRefunds=stored.filter(r=>r.purpose==="refund"&&r.original_payment_id===p.id),ids=new Set<string>();
  const refundRows=refunds.map(refund=>{
    check(paid&&intent&&charge,"refund_without_payment");
    check(refund.id.startsWith("re_")&&!ids.has(refund.id),"duplicate_refund");ids.add(refund.id);
    check(stripeObjectId(refund.payment_intent)===intent.id&&stripeObjectId(refund.charge)===charge.id&&refund.currency===p.currency,"refund_link_mismatch");
    check(cents(refund.amount,"refund")>0&&refund.amount<=p.amount_cents,"refund_amount_mismatch");
    const key=refund.metadata?.refund_operation_key;
    const old=oldRefunds.find(r=>r.stripe_refund_id===refund.id||(key&&r.idempotency_key===`ids-installation-refund:${key}`));
    if(old)check(old.amount_cents===refund.amount&&(!old.stripe_refund_id||old.stripe_refund_id===refund.id),"refund_reference_conflict");
    if(key||old?.processor_request)check(refund.metadata?.installation_id===p.installation_id&&refund.metadata?.original_payment_id===p.id&&refund.metadata?.ids_kind==="professional_installation","refund_metadata_mismatch");
    check(refund.status&&["pending","requires_action","succeeded","failed","canceled"].includes(refund.status),"refund_status_unknown");
    const mapped=refund.status==="succeeded"?"paid":refund.status==="canceled"?"cancelled":["pending","requires_action"].includes(refund.status)?"pending":"failed";
    const failureId=stripeObjectId(refund.failure_balance_transaction);
    if(old&&["paid","failed","cancelled"].includes(old.status)&&mapped==="pending")return {...old,stripe_refund_id:refund.id};
    if(old?.status==="paid"&&mapped!=="paid")check(mapped==="failed"&&failureId&&eventCreated!==null&&eventCreated>(old.last_processor_event_created??0),"refund_regression");
    if(old&&["failed","cancelled"].includes(old.status)&&mapped!==old.status)throw new Error("installation_stripe_refund_terminal_conflict");
    const transaction=refund.balance_transaction;
    const occurrence=mapped==="paid"?(transaction&&typeof transaction!=="string"?timestamp(transaction.created):old?.paid_at??null):null;
    return {...old,id:old?.id??referenceUuid(refund.id),installation_id:p.installation_id,original_payment_id:p.id,purpose:"refund",method:"stripe",status:mapped,
      amount_cents:refund.amount,refunded_cents:0,stripe_refund_id:refund.id,processor_status:refund.status,processor_created_at:timestamp(refund.created),paid_at:occurrence,
      refund_balance_transaction_id:stripeObjectId(transaction),refund_failure_balance_transaction_id:failureId,last_processor_event_created:eventCreated};
  });
  for(const old of oldRefunds)if(old.stripe_refund_id)check(ids.has(old.stripe_refund_id),"incomplete_refund_list");
  const refundedCents=refundRows.filter(r=>r.status==="paid").reduce((n,r)=>n+r.amount_cents,0);
  if(charge)check(refundedCents<=charge.amount_refunded&&refundedCents<=p.amount_cents,"refund_total_mismatch");
  const paymentOccurredAt=paid?timestamp(charge!.created):null;
  const changed:InstallationPayment={...p,paid_at:paymentOccurredAt,refunded_cents:refundedCents,status:paid?(refundedCents===p.amount_cents?"refunded":refundedCents>0?"partially_refunded":"paid"):session.status==="expired"?"cancelled":"pending"};
  const replacementIds=new Set(refundRows.map(r=>r.id));
  const payments=[...state.payments.filter(r=>r.id!==p.id&&!replacementIds.has(r.id)),changed,...refundRows];
  const balance=installationBalance(state.installation.pricing_snapshot,state.adjustments,payments,state.corrections,state.cashRefunds);
  const evidence={installationId:p.installation_id,paymentId:p.id,purpose:p.purpose,amountCents:p.amount_cents,currency:p.currency,livemode:false,
    sessionId:session.id,intentId:stripeObjectId(session.payment_intent),chargeId:paid?charge!.id:null,sessionState:session.status,
    sessionExpiresAt:timestamp(session.expires_at),processorStatus:intent?.status??session.payment_status,paid,paymentOccurredAt,
    processorCreatedAt:timestamp(paid?charge!.created:session.created),refundedCents,observedAt};
  return {evidence,refundRows,balance};
}
