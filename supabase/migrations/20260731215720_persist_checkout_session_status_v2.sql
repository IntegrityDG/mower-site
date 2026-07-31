begin;

create or replace function public.checkout_apply_card_event_v2(
  p_kind text,
  p_session_id text,
  p_payment_intent_id text,
  p_order_id uuid,
  p_attempt_id uuid,
  p_amount bigint,
  p_currency text,
  p_stripe_session_status text,
  p_stripe_payment_status text,
  p_refunded bigint default null,
  p_stripe_customer_id text default null,
  p_contact jsonb default null
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
  if p_kind is null or p_kind not in ('paid','processing','expired','refund','dispute') then
    raise exception 'unsupported checkout event';
  end if;
  if p_kind='paid' and (p_stripe_session_status is distinct from 'complete' or p_stripe_payment_status is distinct from 'paid') then
    raise exception 'invalid paid checkout session status';
  end if;
  if p_kind='processing' and (p_stripe_session_status is distinct from 'complete' or p_stripe_payment_status is distinct from 'unpaid') then
    raise exception 'invalid processing checkout session status';
  end if;
  if p_kind='expired' and (p_stripe_session_status is distinct from 'expired' or p_stripe_payment_status is null or p_stripe_payment_status not in ('paid','unpaid','no_payment_required')) then
    raise exception 'invalid expired checkout session status';
  end if;
  if p_kind in ('refund','dispute') and (p_stripe_session_status is not null or p_stripe_payment_status is not null) then
    raise exception 'financial event cannot replace checkout session status';
  end if;

  select * into a
  from checkout_private.payment_attempts
  where id=p_attempt_id
    and order_id=p_order_id
    and (stripe_checkout_session_id=p_session_id or (p_kind in ('refund','dispute') and stripe_payment_intent_id=p_payment_intent_id))
  for update;
  if not found then raise exception 'checkout_relationship_mismatch'; end if;

  select * into o from checkout_private.orders where id=p_order_id for update;
  if not found then raise exception 'checkout_order_missing'; end if;

  if p_amount is null or p_currency is null
    or (p_kind='dispute' and (p_amount < 1 or p_amount > a.expected_amount_cents))
    or (p_kind<>'dispute' and a.expected_amount_cents is distinct from p_amount)
    or a.expected_currency is distinct from lower(p_currency) then
    raise exception 'checkout_reconciliation_mismatch';
  end if;
  if p_payment_intent_id is not null and a.stripe_payment_intent_id is not null and a.stripe_payment_intent_id<>p_payment_intent_id then
    raise exception 'checkout_payment_intent_conflict';
  end if;
  if p_kind='paid' and (a.attempt_status in ('expired','failed') or a.failed_at is not null) then raise exception 'invalid attempt transition'; end if;
  if p_kind='processing' and a.attempt_status in ('succeeded','expired','failed') then raise exception 'invalid attempt transition'; end if;
  if p_kind='expired' and (a.attempt_status in ('succeeded','failed') or o.payment_status not in ('unpaid','processing')) then raise exception 'invalid expiration transition'; end if;
  if p_kind='refund' and (p_refunded is null or p_refunded < 1 or p_refunded > o.total_cents) then raise exception 'invalid refund amount'; end if;

  update checkout_private.payment_attempts
  set stripe_payment_intent_id=coalesce(stripe_payment_intent_id,p_payment_intent_id),
      stripe_session_status=case when p_kind in ('paid','processing','expired') then p_stripe_session_status else stripe_session_status end,
      stripe_payment_status=case when p_kind in ('paid','processing','expired') then p_stripe_payment_status else stripe_payment_status end,
      attempt_status=case when p_kind='paid' then 'succeeded' when p_kind='processing' then 'processing' when p_kind='expired' and attempt_status not in ('succeeded','expired') then 'expired' else attempt_status end,
      completed_at=case when p_kind='paid' then coalesce(completed_at,now()) else completed_at end,
      updated_at=now()
  where id=a.id;

  if p_stripe_customer_id is not null then
    update checkout_private.customers
    set stripe_customer_id=p_stripe_customer_id,
        stripe_customer_created_at=coalesce(stripe_customer_created_at,now()),
        email=coalesce(p_contact->>'email',email),
        normalized_email=coalesce(lower(p_contact->>'email'),normalized_email),
        name=coalesce(p_contact->>'name',name),
        phone=coalesce(p_contact->>'phone',phone),
        billing_address=coalesce(p_contact->'billingAddress',billing_address),
        shipping_address=coalesce(p_contact->'shippingAddress',shipping_address),
        updated_at=now()
    where id=o.customer_id and (stripe_customer_id is null or stripe_customer_id=p_stripe_customer_id);
    if not found then raise exception 'checkout_customer_conflict'; end if;
  end if;

  if p_kind='paid' then
    update checkout_private.orders
    set order_status='confirmed',payment_status='paid',fulfillment_status=case when fulfillment_status='not_ready' then 'pending' else fulfillment_status end,paid_at=coalesce(paid_at,now()),updated_at=now()
    where id=o.id and payment_status in ('unpaid','processing','failed','paid');
  elsif p_kind='processing' then
    update checkout_private.orders
    set order_status=case when order_status='draft' then 'checkout_pending' else order_status end,payment_status=case when payment_status in ('unpaid','failed') then 'processing' else payment_status end,updated_at=now()
    where id=o.id;
  elsif p_kind='expired' then
    update checkout_private.orders set expired_at=coalesce(expired_at,now()),updated_at=now()
    where id=o.id and payment_status in ('unpaid','processing');
  elsif p_kind='refund' then
    update checkout_private.orders
    set refunded_cents=greatest(refunded_cents,p_refunded),payment_status=case when greatest(refunded_cents,p_refunded)=total_cents then 'refunded' else 'partially_refunded' end,updated_at=now()
    where id=o.id and payment_status in ('paid','partially_refunded','refunded','disputed');
  elsif p_kind='dispute' then
    update checkout_private.orders set payment_status='disputed',updated_at=now()
    where id=o.id and payment_status in ('paid','partially_refunded','refunded','disputed');
  end if;
  if not found then raise exception 'invalid order transition'; end if;

  return jsonb_build_object('publicReference',o.public_reference);
end
$$;

revoke all on function public.checkout_apply_card_event_v2(text,text,text,uuid,uuid,bigint,text,text,text,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.checkout_apply_card_event_v2(text,text,text,uuid,uuid,bigint,text,text,text,bigint,text,jsonb) to service_role;

commit;

-- Verification after separately approved application:
-- select routine_name,security_type from information_schema.routines where routine_schema='public' and routine_name in ('checkout_apply_card_event','checkout_apply_card_event_v2');
-- Rollback after separate approval:
-- drop function public.checkout_apply_card_event_v2(text,text,text,uuid,uuid,bigint,text,text,text,bigint,text,jsonb);
