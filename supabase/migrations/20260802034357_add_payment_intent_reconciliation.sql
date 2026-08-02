begin;

create or replace function public.checkout_link_payment_intent_by_identity(
  p_payment_intent_id text,
  p_order_id uuid,
  p_attempt_id uuid,
  p_payment_method text
)
returns jsonb
language plpgsql
security invoker
set search_path=pg_catalog,public,checkout_private
as $$
declare
  a checkout_private.payment_attempts;
  o checkout_private.orders;
begin
  if p_payment_intent_id is null or p_payment_intent_id !~ '^pi_[A-Za-z0-9]+$' then raise exception 'invalid_payment_intent_id'; end if;
  select * into a from checkout_private.payment_attempts
  where id=p_attempt_id and order_id=p_order_id and payment_method=p_payment_method
  for update;
  if not found then raise exception 'checkout_identity_mismatch'; end if;
  if a.stripe_payment_intent_id is not null and a.stripe_payment_intent_id<>p_payment_intent_id then raise exception 'checkout_payment_intent_conflict'; end if;
  if exists(select 1 from checkout_private.payment_attempts where stripe_payment_intent_id=p_payment_intent_id and id<>a.id) then raise exception 'checkout_payment_intent_conflict'; end if;
  update checkout_private.payment_attempts set stripe_payment_intent_id=p_payment_intent_id,updated_at=now() where id=a.id;
  select * into o from checkout_private.orders where id=a.order_id;
  if not found then raise exception 'checkout_order_missing'; end if;
  return jsonb_build_object('attemptId',a.id,'orderId',o.id,'customerId',o.customer_id,'publicReference',o.public_reference,'attemptStatus',a.attempt_status,'paymentStatus',o.payment_status,'orderStatus',o.order_status,'fulfillmentStatus',o.fulfillment_status,'currency',o.currency,'totalCents',o.total_cents,'refundedCents',o.refunded_cents,'fundedAmountCents',a.funded_amount_cents,'amountRemainingCents',a.amount_remaining_cents,'snapshot',o.pricing_snapshot,'sessionId',a.stripe_checkout_session_id,'paymentIntentId',p_payment_intent_id);
end $$;

revoke all on function public.checkout_link_payment_intent_by_identity(text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.checkout_link_payment_intent_by_identity(text,uuid,uuid,text) to service_role;

commit;
