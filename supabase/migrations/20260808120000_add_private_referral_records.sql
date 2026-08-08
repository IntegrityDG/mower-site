begin;

create table checkout_private.referrals (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references checkout_private.orders(id) on delete restrict,
  referrer_name text not null check (length(btrim(referrer_name)) between 1 and 200),
  referrer_email text not null check (length(btrim(referrer_email)) between 3 and 254),
  normalized_referrer_email text not null check (normalized_referrer_email = lower(btrim(referrer_email))),
  qualifying_brand text not null check (qualifying_brand in ('Lymow','Yarbo','Pandag')),
  product_id uuid references public.catalog_products(id) on delete set null,
  product_slug_snapshot text not null,
  product_name_snapshot text not null,
  base_reward_cents bigint not null check (
    (qualifying_brand='Lymow' and base_reward_cents=5000) or
    (qualifying_brand='Yarbo' and base_reward_cents=10000) or
    (qualifying_brand='Pandag' and base_reward_cents=75000)
  ),
  higher_tier_reward_cents bigint not null check (
    (qualifying_brand='Lymow' and higher_tier_reward_cents=7500) or
    (qualifying_brand='Yarbo' and higher_tier_reward_cents=15000) or
    (qualifying_brand='Pandag' and higher_tier_reward_cents=100000)
  ),
  schedule_version text not null,
  status text not null default 'pending'
    check (status in ('pending','qualified','paid','disqualified')),
  final_reward_cents bigint,
  tier_applied text check (tier_applied is null or tier_applied in ('base','higher')),
  purchase_date timestamptz,
  return_period_ends_at timestamptz,
  qualified_at timestamptz,
  paid_at timestamptz,
  disqualified_at timestamptz,
  disqualification_reason text check (disqualification_reason is null or length(btrim(disqualification_reason)) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (final_reward_cents is null or final_reward_cents in (base_reward_cents,higher_tier_reward_cents)),
  check ((tier_applied is null) = (final_reward_cents is null)),
  check ((status in ('qualified','paid')) = (qualified_at is not null)),
  check ((status = 'paid') = (paid_at is not null)),
  check ((status = 'disqualified') = (disqualified_at is not null)),
  check ((status = 'disqualified') = (disqualification_reason is not null))
);

create index checkout_referrals_status_idx
  on checkout_private.referrals (status, return_period_ends_at);
create index checkout_referrals_referrer_idx
  on checkout_private.referrals (normalized_referrer_email, purchase_date, status);

alter table checkout_private.referrals enable row level security;
alter table checkout_private.referrals force row level security;
revoke all on table checkout_private.referrals from public, anon, authenticated;
grant select, insert, update on table checkout_private.referrals to service_role;

comment on table checkout_private.referrals is
  'Private manual referral accounting. Passing the return-period date never triggers qualification or payout.';
comment on column checkout_private.referrals.base_reward_cents is
  'Server-derived standard reward stored at order creation; does not affect any order or payment amount.';
comment on column checkout_private.referrals.higher_tier_reward_cents is
  'Published higher-tier amount retained for later manual determination; never automatically applied.';

create function public.checkout_upsert_referral(p_referral jsonb)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public, checkout_private
as $$
begin
  insert into checkout_private.referrals (
    order_id, referrer_name, referrer_email, normalized_referrer_email, qualifying_brand, product_id,
    product_slug_snapshot, product_name_snapshot, base_reward_cents,
    higher_tier_reward_cents, schedule_version, status, purchase_date, return_period_ends_at
  ) values (
    (p_referral->>'order_id')::uuid,
    p_referral->>'referrer_name',
    lower(p_referral->>'referrer_email'),
    lower(btrim(p_referral->>'referrer_email')),
    p_referral->>'qualifying_brand',
    (p_referral->>'product_id')::uuid,
    p_referral->>'product_slug_snapshot',
    p_referral->>'product_name_snapshot',
    (p_referral->>'base_reward_cents')::bigint,
    (p_referral->>'higher_tier_reward_cents')::bigint,
    p_referral->>'schedule_version', 'pending',
    (select paid_at from checkout_private.orders where id=(p_referral->>'order_id')::uuid),
    (select paid_at + interval '30 days' from checkout_private.orders where id=(p_referral->>'order_id')::uuid)
  )
  on conflict (order_id) do update set
    referrer_name = excluded.referrer_name,
    referrer_email = excluded.referrer_email,
    normalized_referrer_email = excluded.normalized_referrer_email,
    updated_at = now()
  where checkout_private.referrals.status = 'pending';
end
$$;

revoke all on function public.checkout_upsert_referral(jsonb) from public, anon, authenticated;
grant execute on function public.checkout_upsert_referral(jsonb) to service_role;

create function checkout_private.sync_referral_paid_dates()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, checkout_private
as $$
begin
  if new.paid_at is not null and new.paid_at is distinct from old.paid_at then
    update checkout_private.referrals
      set purchase_date=new.paid_at,
          return_period_ends_at=new.paid_at + interval '30 days',
          updated_at=now()
      where order_id=new.id and status='pending';
  end if;
  return new;
end
$$;

create trigger checkout_sync_referral_paid_dates
after update of paid_at on checkout_private.orders
for each row execute function checkout_private.sync_referral_paid_dates();

create function public.checkout_create_card_draft_with_referral(p_idempotency_key text, p_request_fingerprint text, p_customer jsonb, p_snapshot jsonb, p_referral jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public,checkout_private as $$
declare draft jsonb;
begin
  draft:=public.checkout_create_card_draft(p_idempotency_key,p_request_fingerprint,p_customer,p_snapshot);
  if p_referral is not null then perform public.checkout_upsert_referral(p_referral || jsonb_build_object('order_id',draft->>'orderId')); end if;
  return draft;
end $$;

create function public.checkout_create_ach_draft_with_referral(p_idempotency_key text, p_request_fingerprint text, p_customer jsonb, p_snapshot jsonb, p_referral jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public,checkout_private as $$
declare draft jsonb;
begin
  draft:=public.checkout_create_ach_draft(p_idempotency_key,p_request_fingerprint,p_customer,p_snapshot);
  if p_referral is not null then perform public.checkout_upsert_referral(p_referral || jsonb_build_object('order_id',draft->>'orderId')); end if;
  return draft;
end $$;

create function public.checkout_create_wire_draft_with_referral(p_idempotency_key text, p_request_fingerprint text, p_customer jsonb, p_snapshot jsonb, p_referral jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public,checkout_private as $$
declare draft jsonb;
begin
  draft:=public.checkout_create_wire_draft(p_idempotency_key,p_request_fingerprint,p_customer,p_snapshot);
  if p_referral is not null then perform public.checkout_upsert_referral(p_referral || jsonb_build_object('order_id',draft->>'orderId')); end if;
  return draft;
end $$;

revoke all on function public.checkout_create_card_draft_with_referral(text,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.checkout_create_ach_draft_with_referral(text,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.checkout_create_wire_draft_with_referral(text,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.checkout_create_card_draft_with_referral(text,text,jsonb,jsonb,jsonb) to service_role;
grant execute on function public.checkout_create_ach_draft_with_referral(text,text,jsonb,jsonb,jsonb) to service_role;
grant execute on function public.checkout_create_wire_draft_with_referral(text,text,jsonb,jsonb,jsonb) to service_role;

create function public.checkout_admin_list_referrals()
returns jsonb
language sql
security invoker
set search_path = pg_catalog, public, checkout_private
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'referrerName', r.referrer_name,
    'referrerEmail', r.referrer_email,
    'orderIdentifier', o.public_reference,
    'brand', r.qualifying_brand,
    'productName', r.product_name_snapshot,
    'purchaseDate', r.purchase_date,
    'eligibleDate', r.return_period_ends_at,
    'status', r.status,
    'baseRewardCents', r.base_reward_cents,
    'higherTierRewardCents', r.higher_tier_reward_cents,
    'finalRewardCents', r.final_reward_cents,
    'tierApplied', r.tier_applied,
    'qualifiedAt', r.qualified_at,
    'paidAt', r.paid_at,
    'disqualifiedAt', r.disqualified_at,
    'disqualificationReason', r.disqualification_reason,
    'orderStatus', o.order_status,
    'paymentStatus', o.payment_status
  ) order by
    case
      when r.status='pending' and r.return_period_ends_at<=now() then 0
      when r.status='qualified' then 1
      when r.status='pending' then 2
      when r.status='paid' then 3
      else 4
    end,
    r.purchase_date asc
  ), '[]'::jsonb)
  from checkout_private.referrals r
  join checkout_private.orders o on o.id=r.order_id
  where r.purchase_date is not null and r.return_period_ends_at is not null
$$;

create function public.checkout_admin_mutate_referral(p_referral_id uuid, p_action text, p_reason text default null)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, checkout_private
as $$
declare
  r checkout_private.referrals;
  o checkout_private.orders;
  earlier_count integer;
  chosen_reward bigint;
  chosen_tier text;
begin
  select * into r from checkout_private.referrals where id=p_referral_id for update;
  if not found then raise exception 'Referral record was not found.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(r.normalized_referrer_email, 0));
  select * into o from checkout_private.orders where id=r.order_id for update;

  if p_action='qualify' then
    if r.status<>'pending' then raise exception 'Only pending referrals can be qualified.'; end if;
    if r.purchase_date is null or r.return_period_ends_at is null or o.paid_at is null or now()<r.return_period_ends_at then raise exception 'This referral cannot be qualified before its paid-based 30-day eligibility date.'; end if;
    if o.order_status<>'confirmed' or o.payment_status<>'paid' or o.refunded_cents<>0 then
      raise exception 'The associated order is not completed and fully paid, or it has been refunded.';
    end if;
    if exists (
      select 1 from checkout_private.referrals earlier
      where earlier.normalized_referrer_email=r.normalized_referrer_email
        and (earlier.purchase_date,earlier.id)<(r.purchase_date,r.id) and earlier.status='pending'
    ) then
      raise exception 'Resolve this referrer’s earlier pending referral before qualifying this purchase so the reward tier can be calculated correctly.';
    end if;
    select count(*) into earlier_count from checkout_private.referrals earlier
    where earlier.normalized_referrer_email=r.normalized_referrer_email
      and (earlier.purchase_date,earlier.id)<(r.purchase_date,r.id) and earlier.status in ('qualified','paid');
    if earlier_count>=5 then chosen_reward:=r.higher_tier_reward_cents; chosen_tier:='higher';
    else chosen_reward:=r.base_reward_cents; chosen_tier:='base'; end if;
    update checkout_private.referrals set status='qualified', final_reward_cents=chosen_reward,
      tier_applied=chosen_tier, qualified_at=now(), updated_at=now() where id=r.id;
  elsif p_action='paid' then
    if r.status<>'qualified' or r.final_reward_cents is null or r.tier_applied is null then raise exception 'Only qualified referrals can be marked paid.'; end if;
    if o.order_status<>'confirmed' or o.payment_status<>'paid' or o.refunded_cents<>0 or o.paid_at is null then
      raise exception 'The associated order is no longer completed and fully paid or has been refunded. The referral cannot be marked paid.';
    end if;
    update checkout_private.referrals set status='paid', paid_at=now(), updated_at=now() where id=r.id;
  elsif p_action='disqualify' then
    if r.status not in ('pending','qualified') then raise exception 'Only pending or qualified unpaid referrals can be disqualified.'; end if;
    if p_reason is null or length(btrim(p_reason))<1 or length(btrim(p_reason))>500 then raise exception 'A disqualification reason is required.'; end if;
    update checkout_private.referrals set status='disqualified', disqualified_at=now(),
      disqualification_reason=btrim(p_reason), qualified_at=null, final_reward_cents=null,
      tier_applied=null, updated_at=now() where id=r.id;
  elsif p_action='restore' then
    if r.status<>'disqualified' then raise exception 'Only disqualified referrals can be restored.'; end if;
    update checkout_private.referrals set status='pending', disqualified_at=null,
      disqualification_reason=null, qualified_at=null, final_reward_cents=null,
      tier_applied=null, updated_at=now() where id=r.id;
  else raise exception 'Unsupported referral action.';
  end if;
  return jsonb_build_object('id',r.id,'success',true);
end
$$;

revoke all on function public.checkout_admin_list_referrals() from public, anon, authenticated;
revoke all on function public.checkout_admin_mutate_referral(uuid,text,text) from public, anon, authenticated;
grant execute on function public.checkout_admin_list_referrals() to service_role;
grant execute on function public.checkout_admin_mutate_referral(uuid,text,text) to service_role;

commit;
