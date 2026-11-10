-- Allocate two issue-based sessions for each newly paid Remote Support cycle.
-- Existing session and appointment constraints retain numbers 1-4 to preserve history.
-- Refuse this policy change if any subscriptions or entitlements exist; an owner
-- must review those records before release rather than silently reducing benefits.
begin;

-- Serialize with the checkout and paid-cycle RPCs before checking for records.
select pg_advisory_xact_lock(7242026);
select pg_advisory_xact_lock(8152026);
lock table public.remote_support_subscriptions, public.remote_support_cycles,
  public.remote_support_sessions in share row exclusive mode;

do $guard$
declare
  prior_hash text;
begin
  if exists (select 1 from public.remote_support_subscriptions)
     or exists (select 1 from public.remote_support_cycles)
     or exists (select 1 from public.remote_support_sessions) then
    raise exception 'Remote Support records exist; stop and review subscriber entitlements before changing policy.';
  end if;

  select md5(replace(p.prosrc, chr(13), '')) into prior_hash
  from pg_catalog.pg_proc p
  where p.oid = to_regprocedure('public.ids_support_paid_cycle(uuid,text,text,text,text,text,boolean,timestamptz,timestamptz,timestamptz)');
  if prior_hash is distinct from '5aa57d4b708988f8bd2d0113d0555291' then
    raise exception 'Remote Support paid-cycle function differs from the reviewed version; stop and inspect schema drift.';
  end if;
end;
$guard$;
create or replace function public.ids_support_paid_cycle(p_subscription uuid,p_event text,p_invoice text,p_stripe_customer text,p_stripe_subscription text,p_payment_method text,p_live boolean,p_paid_at timestamptz,p_start timestamptz,p_end timestamptz) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s public.remote_support_subscriptions; cy uuid; existing public.remote_support_cycles; begin
  perform pg_advisory_xact_lock(7242026); perform pg_advisory_xact_lock(8152026);
  select * into s from public.remote_support_subscriptions where id=p_subscription for update;
  if s.id is null or s.livemode<>p_live or (s.stripe_customer_id is not null and s.stripe_customer_id<>p_stripe_customer)
    or (s.stripe_subscription_id is not null and p_stripe_subscription is not null and s.stripe_subscription_id<>p_stripe_subscription)
    or p_paid_at is null or p_start is null or p_end is null or p_end<=p_start then raise exception 'service_payment_identity_mismatch'; end if;
  select * into existing from public.remote_support_cycles where stripe_invoice_id=p_invoice;
  if existing.id is not null then
    if existing.subscription_id<>s.id or existing.starts_at<>p_start or existing.ends_at<>p_end then raise exception 'service_payment_identity_mismatch'; end if;
    return jsonb_build_object('duplicate',true,'cycleId',existing.id);
  end if;
  -- Late success after cancellation is recorded for reconciliation, never used
  -- to silently revive a cancelled subscription or old unpaid period.
  if s.status='cancelled' or (s.failed_at is not null and p_paid_at>=s.failed_at+interval '14 days') then
    insert into public.service_financial_reconciliations(stripe_object_id,subscription_id,reason,details)
      values(p_invoice,s.id,'late_subscription_payment',jsonb_build_object('amountCents',10000,'paidAt',p_paid_at,'startsAt',p_start,'endsAt',p_end)) on conflict(stripe_object_id) do nothing;
    if not exists(select 1 from public.service_webhook_events where event_id=p_event) then
      insert into public.service_case_events(subscription_id,actor_name,action,details) values(s.id,'Stripe','late_payment_requires_review',jsonb_build_object('invoiceId',p_invoice,'amountCents',10000));
      insert into public.service_webhook_events(event_id,event_type,object_id) values(p_event,'support_late_payment',p_invoice);
    end if;
    return jsonb_build_object('reviewRequired',true);
  end if;
  insert into public.remote_support_cycles(subscription_id,stripe_invoice_id,starts_at,ends_at,paid_at) values(s.id,p_invoice,p_start,p_end,p_paid_at) returning id into cy;
  insert into public.remote_support_sessions(cycle_id,number) select cy,generate_series(1,2);
  perform public.ids_support_apply_penalties(s.id,cy);
  if s.paid_through is null or p_end>s.paid_through or s.failed_invoice_id=p_invoice then
    update public.remote_support_subscriptions set activation_at=coalesce(activation_at,p_start),paid_through=greatest(coalesce(paid_through,p_end),p_end),
      stripe_customer_id=p_stripe_customer,stripe_subscription_id=coalesce(p_stripe_subscription,stripe_subscription_id),stripe_payment_method_id=coalesce(p_payment_method,stripe_payment_method_id),
      status=case when coalesce(activation_at,p_start)>now() then 'pending_activation' else 'active' end,
      failed_at=null,failed_invoice_id=null,updated_at=now() where id=s.id;
    update public.service_appointments a set status='scheduled' from public.service_cases c where c.id=a.case_id and c.subscription_id=s.id and a.status='paused';
  end if;
  update checkout_private.customers set stripe_customer_id=coalesce(stripe_customer_id,p_stripe_customer),stripe_customer_created_at=coalesce(stripe_customer_created_at,now()) where id=s.customer_id;
  insert into public.service_case_events(subscription_id,actor_name,action,details) values(s.id,'Stripe','paid_cycle',jsonb_build_object('invoiceId',p_invoice,'startsAt',p_start,'endsAt',p_end));
  if s.request_key is not null and s.public_origin is not null then
    insert into public.service_outbox(semantic_key,kind,subscription_id,payload)
    select 'support-welcome:'||s.id,'customer_link',s.id,jsonb_build_object('email',cu.email,'requestKey',s.request_key,'scope','support','origin',s.public_origin)
    from checkout_private.customers cu where cu.id=s.customer_id and cu.email is not null on conflict(semantic_key) do nothing;
  end if;
  insert into public.service_webhook_events(event_id,event_type,object_id) values(p_event,'support_paid',p_invoice) on conflict(event_id) do nothing;
  if p_stripe_subscription is null then
    insert into public.service_outbox(semantic_key,kind,subscription_id) values('support-recurring:'||s.id,'machine_subscription',s.id) on conflict(semantic_key) do nothing;
  end if;
  return jsonb_build_object('duplicate',false,'cycleId',cy);
end; $$;


-- CREATE OR REPLACE retains the existing function owner and privileges.
commit;