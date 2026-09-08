import "server-only";
import {randomUUID,createHash} from "node:crypto";
import type Stripe from "stripe";
import {getSupabaseServiceClient} from "@/lib/supabase";
import {isReviewAdmin} from "@/lib/reviews/admin-auth";
import {getStripeServerClient} from "@/lib/stripe/server";
import {getStripeConfiguration,getStripeMode} from "@/lib/stripe/config";
import {requireInstallationOnlinePayments} from "./controls";
import {installationBalance,installationCheckoutAmount} from "./accounting";
import {readInstallationLedger} from "./ledger";
import {operationKey,ADMIN_ACTOR,type AdminState} from "./admin-policy";
import {dollarsToCents} from "./cash-validation";
import {installationStripeProjection,validateInstallationSession,stripeObjectId,type InstallationStripePayment} from "./stripe-policy";

type EventContext={id:string;type:string;objectId:string;created:number|null;receivedAt:string;hash:string};
const digest=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
function testOnly(){if(getStripeMode()!=="test")throw new Error("installation_checkout_requires_test_mode");}
function context(event:Stripe.Event):EventContext{return{id:event.id,type:event.type,objectId:(event.data.object as {id:string}).id,created:event.created,receivedAt:new Date().toISOString(),hash:digest({id:event.id,type:event.type,created:event.created,livemode:event.livemode,data:event.data})};}
async function payment(id:string){const{data,error}=await getSupabaseServiceClient().from("installation_payments").select("*").eq("id",id).single();if(error)throw error;if(!data)throw new Error("installation_payment_missing");return data as InstallationStripePayment;}
async function state(id:string){const{data,error}=await getSupabaseServiceClient().rpc("ids_installation_admin_state",{p_id:id});if(error)throw error;if(!data?.installation?.pricing_snapshot)throw new Error("missing_approved_pricing");return data as AdminState;}
async function existingEvent(event:EventContext,paymentId:string){
  const{data,error}=await getSupabaseServiceClient().from("installation_processor_events").select("payment_id,payload_hash").eq("event_id",event.id).maybeSingle();
  if(error)throw error;if(data&&(data.payment_id!==paymentId||data.payload_hash!==event.hash))throw new Error("processor_event_conflict");return !!data;
}
async function recoverSession(p:InstallationStripePayment){
  const sessions=await getStripeServerClient().checkout.sessions.list({created:{gte:Math.floor(Date.parse(p.created_at)/1000)-60,lte:Math.floor(Date.parse(p.created_at)/1000)+3600},limit:100}).autoPagingToArray({limit:10000});
  if(sessions.length>=10000)throw new Error("checkout_recovery_search_incomplete");
  const matches=sessions.filter(s=>s.metadata?.payment_id===p.id&&s.metadata?.installation_id===p.installation_id);
  if(matches.length>1)throw new Error("checkout_recovery_multiple_sessions");return matches[0]??null;
}
async function attach(p:InstallationStripePayment,session:Stripe.Checkout.Session){
  validateInstallationSession(session,p);
  const{data,error}=await getSupabaseServiceClient().rpc("ids_attach_installation_checkout",{p_id:p.installation_id,p_payment_id:p.id,p_session_id:session.id,p_expires:new Date(session.expires_at*1000).toISOString()});
  if(error)throw error;if(!data?.stripe_session_id)throw new Error("checkout_persistence_incomplete");return data as InstallationStripePayment;
}
export async function createInstallationCheckout(token:string,purpose:"deposit"|"balance"){
  requireInstallationOnlinePayments();testOnly();
  if(!["deposit","balance"].includes(purpose))throw new Error("invalid_checkout_purpose");
  const db=getSupabaseServiceClient(),stripe=getStripeServerClient(),config=getStripeConfiguration();
  const{data:i,error}=await db.from("installations").select("*").eq("public_token",token).single();if(error)throw error;if(!i?.pricing_snapshot)throw new Error("not_approved");
  for(let attempt=0;attempt<4;attempt++){
    const ledger=await readInstallationLedger(i.id,db),amount=installationCheckoutAmount(ledger.balance,purpose,ledger.installation.deposit_due_cents??ledger.pricing.depositCents);
    if(amount<=0)throw new Error("nothing_due");
    if(!["approved","deposit_due","scheduled","balance_due","ready"].includes(ledger.installation.status))throw new Error("installation_not_payable");
    if(purpose==="balance"&&ledger.installation.cash_status==="approved")throw new Error("cash_approved");
    const id=randomUUID(),metadata={ids_kind:"professional_installation",installation_id:i.id,payment_id:id,purpose};
    const request:Stripe.Checkout.SessionCreateParams={mode:"payment",payment_method_types:["card"],client_reference_id:id,customer_email:i.customer_email,
      line_items:[{quantity:1,price_data:{currency:"usd",unit_amount:amount,product_data:{name:purpose==="deposit"?"Professional Installation required payment":"Professional Installation balance",description:"Credited toward the approved installation total."}}}],
      metadata,payment_intent_data:{metadata},expires_at:Math.floor(Date.now()/1000)+3600,
      success_url:`${config.appBaseUrl}/professional-installation/${token}?payment=success`,cancel_url:`${config.appBaseUrl}/professional-installation/${token}?payment=cancelled`};
    const{data,error:reserveError}=await db.rpc("ids_reserve_installation_checkout",{p_id:i.id,p_payment_id:id,p_purpose:purpose,p_amount:amount,p_request:request,p_expected_ledger:ledger.snapshot,p_balance:ledger.balance});
    if(reserveError){if(reserveError.message==="installation_ledger_changed")continue;throw reserveError;}
    let p=data as InstallationStripePayment;if(!p?.id||!p.processor_request)throw new Error("checkout_reservation_incomplete");
    let session=p.stripe_session_id?await stripe.checkout.sessions.retrieve(p.stripe_session_id):await recoverSession(p);
    if(!session){
      if(Date.now()-Date.parse(p.created_at)>23*3600000)throw new Error("checkout_recovery_required_no_new_charge");
      session=await stripe.checkout.sessions.create(p.processor_request as Stripe.Checkout.SessionCreateParams,{idempotencyKey:p.idempotency_key});
    }
    p=await attach(p,session);
    if(session.status==="complete"){await reconcileInstallationPayment(p.id,{sessionId:session.id});continue;}
    if(session.status==="expired"){await reconcileInstallationPayment(p.id,{sessionId:session.id});continue;}
    // Resolve the prior session before reserving a different amount or purpose.
    const current=await readInstallationLedger(i.id,db),currentAmount=installationCheckoutAmount(current.balance,purpose,current.installation.deposit_due_cents??current.pricing.depositCents);
    if(p.amount_cents!==currentAmount||p.purpose!==purpose||!["approved","deposit_due","scheduled","balance_due","ready"].includes(current.installation.status)){
      await stripe.checkout.sessions.expire(session.id);await reconcileInstallationPayment(p.id,{sessionId:session.id});continue;
    }
    validateInstallationSession(session,p);if(!session.url||session.status!=="open")throw new Error("checkout_url_missing");return session.url;
  }
  throw new Error("installation_changed_retry_checkout");
}

// All network reads occur before the short database transaction. Canonical
// objects, rather than event arrival order, determine the financial projection.
export async function reconcileInstallationPayment(paymentId:string,hint:{sessionId?:string;intentId?:string}={},event?:EventContext){
  testOnly();const db=getSupabaseServiceClient(),stripe=getStripeServerClient();
  if(event&&await existingEvent(event,paymentId))return {ok:true,replayed:true};
  for(let attempt=0;attempt<3;attempt++){
    const p=await payment(paymentId);if(p.method!=="stripe"||p.purpose==="refund"||p.livemode)throw new Error("invalid_stripe_payment");
    let sessionId=p.stripe_session_id??hint.sessionId;
    if(hint.sessionId&&p.stripe_session_id&&hint.sessionId!==p.stripe_session_id)throw new Error("installation_stripe_session_mismatch");
    if(!sessionId&&hint.intentId){const sessions=await stripe.checkout.sessions.list({payment_intent:hint.intentId,limit:2});if(sessions.data.length!==1)throw new Error("installation_session_not_uniquely_linked");sessionId=sessions.data[0].id;}
    if(!sessionId)sessionId=(await recoverSession(p))?.id;
    if(!sessionId)throw new Error("checkout_recovery_required_no_new_charge");
    const session=await stripe.checkout.sessions.retrieve(sessionId);validateInstallationSession(session,p);
    const intentId=stripeObjectId(session.payment_intent);
    if(hint.intentId&&intentId!==hint.intentId)throw new Error("installation_stripe_intent_mismatch");
    const intent=intentId?await stripe.paymentIntents.retrieve(intentId):null;
    const chargeId=intent?stripeObjectId(intent.latest_charge):null,charge=chargeId?await stripe.charges.retrieve(chargeId):null;
    const paid=session.status==="complete"&&session.payment_status==="paid";
    const refunds=paid&&charge?await stripe.refunds.list({charge:charge.id,limit:100,expand:["data.balance_transaction"]}).autoPagingToArray({limit:10000}):[];
    if(refunds.length>=10000)throw new Error("installation_refund_list_incomplete");
    const observedAt=new Date().toISOString(),current=await state(p.installation_id),currentPayment=current.payments.find(x=>x.id===p.id) as InstallationStripePayment;
    const projection=installationStripeProjection(current,currentPayment,session,intent,charge,refunds,event?.created??null,observedAt);
    const canonicalHash=digest({...projection.evidence,observedAt:undefined,refunds:projection.refundRows.map(r=>({id:r.stripe_refund_id,status:r.status,amount:r.amount_cents,paidAt:r.paid_at,balanceTransaction:r.refund_balance_transaction_id,failureBalanceTransaction:r.refund_failure_balance_transaction_id})).sort((a,b)=>String(a.id).localeCompare(String(b.id)))});
    const eventValue=event??{id:`sync:${p.id}:${canonicalHash}`,type:"installation.manual_reconciliation",objectId:session.id,created:null,receivedAt:observedAt,hash:canonicalHash};
    const before=installationBalance(current.installation.pricing_snapshot,current.adjustments,current.payments,current.corrections,current.cashRefunds);
    const{data,error}=await db.rpc("ids_reconcile_installation_stripe",{p_id:p.installation_id,p_payment_id:p.id,p_expected_ledger:current.ledger,p_balance_before:before,p_balance_after:projection.balance,p_evidence:projection.evidence,p_refunds:projection.refundRows,p_event:eventValue});
    if(error){if(["installation_ledger_changed","processor_observation_stale"].includes(error.message))continue;throw error;}
    if(!data?.ok)throw new Error("installation_reconciliation_incomplete");return data;
  }
  throw new Error("installation_ledger_changed");
}
export async function applyInstallationStripeSession(session:Stripe.Checkout.Session,event?:EventContext){
  if(session.metadata?.ids_kind!=="professional_installation")return false;
  const db=getSupabaseServiceClient();let query=db.from("installation_payments").select("id");
  query=session.metadata.payment_id?query.eq("id",session.metadata.payment_id):query.eq("stripe_session_id",session.id);
  const{data,error}=await query.single();if(error)throw error;if(!data)throw new Error("installation_session_not_linked");
  await reconcileInstallationPayment(data.id,{sessionId:session.id},event);return true;
}
export async function applyInstallationRefund(paymentIntentId:string,_reportedAmount?:number,event?:EventContext){
  const{data,error}=await getSupabaseServiceClient().from("installation_payments").select("id").eq("stripe_payment_intent_id",paymentIntentId).maybeSingle();
  if(error)throw error;if(!data)return false;await reconcileInstallationPayment(data.id,{intentId:paymentIntentId},event);return true;
}
export async function handleInstallationWebhook(event:Stripe.Event){
  const object=event.data.object as Stripe.Checkout.Session|Stripe.PaymentIntent|Stripe.Charge|Stripe.Refund;
  if(object.metadata?.ids_kind!=="professional_installation")return false;
  const ctx=context(event);
  if(object.object==="checkout.session")return applyInstallationStripeSession(object,ctx);
  if(object.object==="payment_intent"){
    const id=object.metadata.payment_id;if(!id)throw new Error("installation_payment_link_missing");
    await reconcileInstallationPayment(id,{intentId:object.id},ctx);return true;
  }
  if(object.object==="charge"||object.object==="refund"){
    const id=object.metadata?.payment_id??object.metadata?.original_payment_id;
    if(id){await reconcileInstallationPayment(id,{intentId:stripeObjectId(object.payment_intent)??undefined},ctx);return true;}
    const intent=stripeObjectId(object.payment_intent);if(intent)return applyInstallationRefund(intent,undefined,ctx);
  }
  return false;
}
export const installationEventContext=context;

export async function requestInstallationStripeRefund(id:string,raw:unknown){
  if(!(await isReviewAdmin()))throw new Error("Unauthorized");testOnly();
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new Error("invalid_refund_request");
  const body=raw as Record<string,unknown>;
  if(Object.keys(body).some(k=>!["operationKey","originalPaymentId","amountDollars","reason","reference"].includes(k)))throw new Error("invalid_refund_request");
  const key=operationKey(body.operationKey),original=operationKey(body.originalPaymentId),amount=dollarsToCents(body.amountDollars);
  if(typeof body.reason!=="string"||!body.reason.trim()||body.reason.length>2000||body.reference!==undefined&&(typeof body.reference!=="string"||body.reference.length>200))throw new Error("refund_reason_reference_required");
  const payload={installationId:id,operationKey:key,originalPaymentId:original,amountCents:amount,reason:body.reason.trim(),reference:(body.reference as string|undefined)?.trim()||null,actor:ADMIN_ACTOR};
  const db=getSupabaseServiceClient(),stripe=getStripeServerClient();
  const{data:existing,error:existingError}=await db.from("installation_payments").select("*").eq("idempotency_key",`ids-installation-refund:${key}`).maybeSingle();if(existingError)throw existingError;
  let reserved=existing as InstallationStripePayment|null;
  if(reserved){const{isDeepStrictEqual}=await import("node:util");if(reserved.installation_id!==id||!isDeepStrictEqual(reserved.processor_operation_payload,payload))throw new Error("refund_operation_conflict");}
  else {
    const current=await state(id),p=current.payments.find(p=>p.id===original) as InstallationStripePayment|undefined;
    if(!p||p.method!=="stripe"||p.purpose==="refund"||!p.stripe_payment_intent_id||p.livemode||!["paid","partially_refunded"].includes(p.status))throw new Error("invalid_refund_original");
    const pending=current.payments.filter(r=>r.purpose==="refund"&&r.original_payment_id===original&&r.status==="pending").reduce((n,r)=>n+r.amount_cents,0);
    if(amount>p.amount_cents-p.refunded_cents-pending)throw new Error("refund_exceeds_eligible_amount");
    const refundId=randomUUID(),request:Stripe.RefundCreateParams={payment_intent:p.stripe_payment_intent_id,amount,reason:"requested_by_customer",metadata:{ids_kind:"professional_installation",installation_id:id,original_payment_id:original,refund_operation_key:key}};
    const before=installationBalance(current.installation.pricing_snapshot,current.adjustments,current.payments,current.corrections,current.cashRefunds);
    const after=installationBalance(current.installation.pricing_snapshot,current.adjustments,[...current.payments,{id:refundId,original_payment_id:original,purpose:"refund",method:"stripe",status:"pending",amount_cents:amount,refunded_cents:0,paid_at:null}],current.corrections,current.cashRefunds);
    const{data,error}=await db.rpc("ids_reserve_installation_refund",{p_id:id,p_refund_id:refundId,p_original_id:original,p_key:key,p_payload:payload,p_request:request,p_expected_ledger:current.ledger,p_balance_before:before,p_balance_after:after});
    if(error)throw error;reserved=data as InstallationStripePayment;if(!reserved?.processor_request)throw new Error("refund_reservation_incomplete");
  }
  let refund:Stripe.Refund|null=null;
  if(reserved.stripe_refund_id)refund=await stripe.refunds.retrieve(reserved.stripe_refund_id);
  else {
    const request=reserved.processor_request as Stripe.RefundCreateParams;
    const known=await stripe.refunds.list({payment_intent:String(request.payment_intent),limit:100}).autoPagingToArray({limit:10000});
    if(known.length>=10000)throw new Error("refund_recovery_search_incomplete");
    const matches=known.filter(r=>r.metadata?.refund_operation_key===key);if(matches.length>1)throw new Error("refund_recovery_multiple_references");refund=matches[0]??null;
    if(!refund){if(Date.now()-Date.parse(reserved.created_at)>23*3600000)throw new Error("refund_recovery_required_no_second_refund");refund=await stripe.refunds.create(request,{idempotencyKey:reserved.idempotency_key});}
  }
  await reconcileInstallationPayment(original);
  const recorded=await payment(reserved.id);if(recorded.stripe_refund_id!==refund.id)throw new Error("refund_reconciliation_pending_keep_same_key");
  return {ok:true,refundId:recorded.id,stripeRefundId:refund.id,status:recorded.status,processorStatus:recorded.processor_status};
}
