begin;

create table checkout_private.notification_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique check (length(btrim(event_key)) between 1 and 300),
  notification_type text not null check (notification_type in ('ach_processing','paid','payment_failed','refund','dispute')),
  order_id uuid references checkout_private.orders(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  attempt_count integer not null default 1 check (attempt_count > 0),
  claimed_at timestamptz not null default now(),
  last_error text check (last_error is null or length(last_error) <= 100),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  check ((status='sent') = (sent_at is not null))
);

create index checkout_notification_events_status_idx on checkout_private.notification_events(status,updated_at);
create index checkout_notification_events_order_idx on checkout_private.notification_events(order_id,created_at);
alter table checkout_private.notification_events enable row level security;
alter table checkout_private.notification_events force row level security;
revoke all on table checkout_private.notification_events from public,anon,authenticated;
grant select,insert,update on table checkout_private.notification_events to service_role;

create function public.checkout_claim_notification_event(p_event_key text,p_notification_type text,p_order_id uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public,checkout_private as $$
declare e checkout_private.notification_events;
begin
  insert into checkout_private.notification_events(event_key,notification_type,order_id)
    values(p_event_key,p_notification_type,p_order_id) on conflict(event_key) do nothing returning * into e;
  if found then return jsonb_build_object('claimed',true,'eventId',e.id,'claimedAt',e.claimed_at); end if;
  select * into e from checkout_private.notification_events where event_key=p_event_key for update;
  if e.notification_type<>p_notification_type or e.order_id is distinct from p_order_id then raise exception 'notification_event_conflict'; end if;
  if e.status='failed' or (e.status='pending' and e.claimed_at <= now() - interval '10 minutes') then
    update checkout_private.notification_events set status='pending',attempt_count=attempt_count+1,claimed_at=now(),last_error=null,updated_at=now() where id=e.id returning * into e;
    return jsonb_build_object('claimed',true,'eventId',e.id,'claimedAt',e.claimed_at);
  end if;
  return jsonb_build_object('claimed',false,'eventId',e.id,'claimedAt',e.claimed_at);
end $$;

create function public.checkout_finish_notification_event(p_event_id uuid,p_claimed_at timestamptz,p_status text,p_error_code text default null)
returns void language plpgsql security invoker set search_path=pg_catalog,public,checkout_private as $$
begin
  if p_status not in ('sent','failed') then raise exception 'invalid notification status'; end if;
  update checkout_private.notification_events set status=p_status,
    sent_at=case when p_status='sent' then now() else null end,
    last_error=case when p_status='failed' then left(coalesce(p_error_code,'SEND_FAILED'),100) else null end,
    updated_at=now() where id=p_event_id and status='pending' and claimed_at=p_claimed_at;
  if not found then raise exception 'notification event is not pending'; end if;
end $$;

create function public.checkout_notification_context(p_order_id uuid)
returns jsonb language sql security invoker set search_path=pg_catalog,public,checkout_private as $$
  select jsonb_build_object(
    'orderId',o.id,'publicReference',o.public_reference,'orderStatus',o.order_status,'paymentStatus',o.payment_status,
    'customerName',o.customer_name,'customerEmail',o.customer_email,'customerPhone',o.customer_phone,
    'subtotalCents',o.subtotal_cents,'discountCents',o.discount_cents,'taxCents',o.tax_cents,
    'shippingCents',o.shipping_cents,'totalCents',o.total_cents,'refundedCents',o.refunded_cents,
    'paymentMethod',o.payment_method_choice,'paidAt',o.paid_at,'snapshot',o.pricing_snapshot,
    'referral',case when r.id is null then null else jsonb_build_object('referrerName',r.referrer_name,'referrerEmail',r.referrer_email) end
  ) from checkout_private.orders o left join checkout_private.referrals r on r.order_id=o.id where o.id=p_order_id
$$;

revoke all on function public.checkout_claim_notification_event(text,text,uuid) from public,anon,authenticated;
revoke all on function public.checkout_finish_notification_event(uuid,timestamptz,text,text) from public,anon,authenticated;
revoke all on function public.checkout_notification_context(uuid) from public,anon,authenticated;
grant execute on function public.checkout_claim_notification_event(text,text,uuid) to service_role;
grant execute on function public.checkout_finish_notification_event(uuid,timestamptz,text,text) to service_role;
grant execute on function public.checkout_notification_context(uuid) to service_role;

commit;
