// Controlled processor objects, never Stripe-delivered evidence.
import type Stripe from 'stripe';
import {DEFAULT_PRICING} from '../../lib/installations/policy';
import {ledgerSnapshot} from '../../lib/installations/accounting';
import type {InstallationStripePayment} from '../../lib/installations/stripe-policy';
import type {AdminState} from '../../lib/installations/admin-policy';
import {installation,installationId,payment,receivedAt} from './installation-fixtures';
export function processorFixture(amount=25000,extra:Partial<InstallationStripePayment>={}){
  const p={...payment(amount),installation_id:installationId,currency:'usd',livemode:false,stripe_session_id:'cs_test_synthetic',stripe_payment_intent_id:'pi_synthetic',stripe_charge_id:'ch_synthetic',stripe_refund_id:null,processor_request:null,processor_operation_payload:null,processor_state:'paid',processor_status:'succeeded',processor_created_at:receivedAt,processor_observed_at:null,last_processor_event_created:null,idempotency_key:'synthetic',created_at:receivedAt,refund_balance_transaction_id:null,refund_failure_balance_transaction_id:null,...extra} as InstallationStripePayment;
  const metadata={ids_kind:'professional_installation',installation_id:p.installation_id,payment_id:p.id,purpose:p.purpose};
  const created=Math.floor(Date.parse(receivedAt)/1000);
  const session={id:p.stripe_session_id,object:'checkout.session',livemode:false,mode:'payment',status:'complete',payment_status:'paid',payment_method_types:['card'],amount_total:amount,currency:'usd',metadata,client_reference_id:p.id,payment_intent:p.stripe_payment_intent_id,created,expires_at:created+3600,url:null} as unknown as Stripe.Checkout.Session;
  const intent={id:p.stripe_payment_intent_id,object:'payment_intent',metadata,livemode:false,status:'succeeded',amount,amount_received:amount,currency:'usd',latest_charge:p.stripe_charge_id,capture_method:'automatic',created} as unknown as Stripe.PaymentIntent;
  const charge={id:p.stripe_charge_id,object:'charge',metadata,livemode:false,status:'succeeded',paid:true,captured:true,amount,amount_captured:amount,amount_refunded:0,currency:'usd',payment_intent:p.stripe_payment_intent_id,created} as unknown as Stripe.Charge;
  const refund=(refundAmount=5000,status:NonNullable<Stripe.Refund['status']>='succeeded',id='re_synthetic')=>({id,object:'refund',amount:refundAmount,currency:'usd',charge:charge.id,payment_intent:intent.id,status,created:created+60,metadata:{},balance_transaction:status==='succeeded'?{id:'txn_synthetic',created:created+120}:null,failure_balance_transaction:null}) as unknown as Stripe.Refund;
  const state:AdminState={installation:installation(),payments:[p],adjustments:[],corrections:[],cashRefunds:[],sessions:[],ledger:ledgerSnapshot(DEFAULT_PRICING,[],[p],[],[])};
  return {p,session,intent,charge,refund,state};
}
