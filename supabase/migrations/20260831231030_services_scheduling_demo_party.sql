begin;

-- Permanent shared Services & Scheduling configuration. The legacy demo_*
-- tables remain the physical appointment store so existing IDs, timestamps,
-- exclusions, area planning, and notification history stay authoritative.
create table public.appointment_type_settings (
  appointment_type text primary key check (appointment_type in ('demo','install','setup','service')),
  display_name text not null check (char_length(display_name) between 1 and 80),
  duration_minutes integer not null check (duration_minutes between 30 and 1440),
  public_active boolean not null default false,
  sort_order integer not null check (sort_order between 0 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.appointment_type_settings
  (appointment_type,display_name,duration_minutes,public_active,sort_order)
values
  ('demo','Demo',240,true,10),
  ('install','Install',240,false,20),
  ('setup','Setup',240,false,30),
  ('service','Service',120,false,40);

alter table public.appointment_type_settings enable row level security;
revoke all on table public.appointment_type_settings from public,anon,authenticated,service_role;
grant select on table public.appointment_type_settings to service_role;

alter table public.demo_requests
  add column appointment_type text not null default 'demo',
  add column duration_minutes integer,
  add column demo_format text not null default 'private',
  add column notes text,
  add column payment_status text not null default 'not_started',
  add column information_requested_at timestamptz,
  add column scheduling_fingerprint text;

update public.demo_requests
set appointment_type='demo',
    duration_minutes=greatest(1,round(extract(epoch from (requested_end_at-requested_start_at))/60)::integer),
    demo_format='private',
    payment_status='not_started'
where duration_minutes is null;

alter table public.demo_requests
  alter column duration_minutes set not null,
  add constraint demo_requests_appointment_type_check
    check (appointment_type in ('demo','install','setup','service')),
  add constraint demo_requests_duration_minutes_check
    check (duration_minutes between 1 and 1440),
  add constraint demo_requests_demo_format_check
    check ((appointment_type='demo' and demo_format in ('private','party')) or (appointment_type<>'demo' and demo_format='private')),
  add constraint demo_requests_notes_check
    check (notes is null or char_length(notes)<=2000),
  add constraint demo_requests_payment_status_check
    check (payment_status in ('not_started','checkout_open','paid','partially_refunded','refunded')),
  add constraint demo_requests_scheduling_fingerprint_check
    check (scheduling_fingerprint is null or scheduling_fingerprint~'^[0-9a-f]{32}$');

create index demo_requests_type_calendar_idx
  on public.demo_requests(appointment_type,requested_start_at,requested_end_at)
  where status in ('pending','approved');
create index demo_requests_payment_status_idx
  on public.demo_requests(payment_status,requested_start_at)
  where status='approved';

create schema scheduling_private;
revoke all on schema scheduling_private from public,anon,authenticated;
grant usage on schema scheduling_private to service_role;

create table scheduling_private.appointment_portal_tokens (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.demo_requests(id) on delete restrict,
  purpose text not null default 'host_manage' check (purpose='host_manage'),
  token_hash text not null unique check (token_hash~'^[0-9a-f]{64}$'),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  regenerated_at timestamptz,
  updated_at timestamptz not null default now()
);

create table scheduling_private.demo_payments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.demo_requests(id) on delete restrict,
  amount_cents integer not null default 10000 check (amount_cents=10000),
  currency text not null default 'usd' check (currency='usd'),
  status text not null default 'not_started'
    check (status in ('not_started','creating','checkout_open','paid','partially_refunded','refunded')),
  checkout_generation_key uuid,
  checkout_generation_started_at timestamptz,
  stripe_checkout_session_id text unique,
  stripe_checkout_url text,
  stripe_checkout_expires_at timestamptz,
  stripe_payment_intent_id text unique,
  stripe_charge_id text unique,
  paid_cents integer not null default 0 check (paid_cents between 0 and 10000),
  refunded_cents integer not null default 0 check (refunded_cents between 0 and paid_cents),
  paid_at timestamptz,
  last_reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status in ('paid','partially_refunded','refunded'))=(paid_at is not null)),
  check ((status='refunded')=(refunded_cents=paid_cents and paid_cents>0)),
  check ((status='creating')=(checkout_generation_key is not null and checkout_generation_started_at is not null))
);

create table scheduling_private.demo_parties (
  request_id uuid primary key references public.demo_requests(id) on delete restrict,
  property_relationship text not null
    check (property_relationship in ('homeowner','property_owner','authorized_property_manager')),
  property_type text not null
    check (property_type in ('residential','commercial','rental_property','hoa','other')),
  mowable_acreage numeric(10,2) not null check (mowable_acreage>0 and mowable_acreage<=100000),
  actively_considering_purchase boolean not null,
  purchase_timeframe text not null
    check (purchase_timeframe in ('within_30_days','1_to_3_months','3_to_6_months','researching_later')),
  equipment_budget text not null
    check (equipment_budget in ('under_3000','3000_to_5000','5000_to_8000','8000_to_12000','12000_plus')),
  decision_maker boolean not null,
  property_authorization_certified boolean not null check (property_authorization_certified),
  guest_arrival_offset_minutes integer not null default 120 check (guest_arrival_offset_minutes=120),
  guest_list_locked boolean not null default false,
  guest_list_locked_at timestamptz,
  guest_list_lock_reason text check (guest_list_lock_reason is null or char_length(guest_list_lock_reason)<=500),
  food_support_status text not null default 'not_planned'
    check (food_support_status in ('not_planned','planned','arranged','completed','cancelled')),
  food_notes text check (food_notes is null or char_length(food_notes)<=1000),
  food_budget_cents integer check (food_budget_cents is null or food_budget_cents between 0 and 15000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (guest_list_locked=(guest_list_locked_at is not null))
);

create table scheduling_private.demo_party_guests (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references scheduling_private.demo_parties(request_id) on delete restrict,
  full_name text not null check (char_length(btrim(full_name)) between 1 and 160),
  email text not null check (char_length(btrim(email)) between 3 and 320),
  normalized_email text not null check (normalized_email=lower(btrim(email))),
  phone text not null check (char_length(btrim(phone)) between 7 and 80),
  referral_identifier uuid not null default gen_random_uuid() unique,
  registered_at timestamptz not null default now(),
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  qualification_status text not null default 'pending'
    check (qualification_status in ('pending','qualifying','not_qualifying')),
  qualification_verified_at timestamptz,
  qualification_note text check (qualification_note is null or char_length(qualification_note)<=500),
  follow_up_consent boolean,
  follow_up_consent_recorded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (checked_out_at is null or (checked_in_at is not null and checked_out_at>=checked_in_at)),
  check (qualification_status<>'qualifying' or (
    checked_in_at is not null
    and qualification_verified_at is not null
    and qualification_verified_at>=checked_in_at+interval '1 hour'
    and (checked_out_at is null or checked_out_at>=checked_in_at+interval '1 hour')
  )),
  check ((follow_up_consent is null)=(follow_up_consent_recorded_at is null)),
  unique(request_id,normalized_email),
  unique(id,request_id)
);

create index demo_party_guests_request_idx on scheduling_private.demo_party_guests(request_id,registered_at);
create index demo_party_guests_qualifying_idx on scheduling_private.demo_party_guests(request_id,qualification_status);

create table scheduling_private.demo_party_benefit_ledger (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references scheduling_private.demo_parties(request_id) on delete restrict,
  benefit_type text not null
    check (benefit_type in ('demo_fee_refund','base_machine_discount','referral_reward')),
  source_key text not null default 'party' check (char_length(source_key) between 1 and 100),
  earned_cents integer not null default 0 check (earned_cents>=0),
  consumed_cents integer not null default 0 check (consumed_cents between 0 and earned_cents),
  state text not null default 'pending'
    check (state in ('pending','earned','partially_consumed','consumed','voided')),
  stripe_refund_id text unique,
  linked_order_id uuid references checkout_private.orders(id) on delete restrict,
  calculation_version text not null default 'demo-party-benefits-v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(request_id,benefit_type,source_key),
  check (benefit_type='demo_fee_refund' or stripe_refund_id is null)
);

create index demo_party_benefit_order_idx
  on scheduling_private.demo_party_benefit_ledger(linked_order_id)
  where linked_order_id is not null;

create table scheduling_private.demo_party_benefit_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references scheduling_private.demo_parties(request_id) on delete restrict,
  benefit_type text not null
    check (benefit_type in ('demo_fee_refund','base_machine_discount','referral_reward')),
  event_type text not null
    check (event_type in ('calculated','reserved','released','redeemed','refunded','adjusted','voided')),
  amount_cents integer not null check (amount_cents>=0),
  balance_after_cents integer not null check (balance_after_cents>=0),
  source text not null check (char_length(source) between 1 and 100),
  linked_order_id uuid references checkout_private.orders(id) on delete restrict,
  stripe_refund_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index demo_party_benefit_events_request_idx
  on scheduling_private.demo_party_benefit_events(request_id,created_at);
create index demo_party_benefit_events_order_idx
  on scheduling_private.demo_party_benefit_events(linked_order_id)
  where linked_order_id is not null;

create table scheduling_private.demo_refund_attempts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.demo_requests(id) on delete restrict,
  target_refunded_cents integer not null check (target_refunded_cents between 1 and 10000),
  amount_cents integer not null check (amount_cents between 1 and 10000),
  state text not null default 'prepared' check (state in ('prepared','succeeded','failed')),
  stripe_refund_id text unique,
  last_error_code text check (last_error_code is null or char_length(last_error_code)<=100),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(request_id,target_refunded_cents)
);

create table scheduling_private.demo_party_benefit_redemptions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references scheduling_private.demo_parties(request_id) on delete restrict,
  benefit_type text not null check (benefit_type='base_machine_discount'),
  application text not null check (application='machine'),
  amount_cents integer not null check (amount_cents>0),
  order_id uuid not null references checkout_private.orders(id) on delete restrict,
  checkout_attempt_id uuid references checkout_private.payment_attempts(id) on delete restrict,
  stripe_checkout_session_id text unique,
  checkout_url text,
  checkout_expires_at timestamptz,
  state text not null default 'reserved' check (state in ('reserved','applied','released','voided')),
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  released_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(order_id,benefit_type),
  check ((state='applied')=(applied_at is not null)),
  check ((state='released')=(released_at is not null))
);

create unique index demo_party_one_active_base_redemption_idx
  on scheduling_private.demo_party_benefit_redemptions(request_id,benefit_type)
  where benefit_type='base_machine_discount' and state='reserved';
create index demo_party_redemptions_order_idx
  on scheduling_private.demo_party_benefit_redemptions(order_id,state);

create table scheduling_private.appointment_audit_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.demo_requests(id) on delete restrict,
  event_type text not null check (char_length(event_type) between 1 and 100),
  actor_type text not null check (actor_type in ('customer','admin','system','stripe')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index appointment_audit_events_request_idx
  on scheduling_private.appointment_audit_events(request_id,created_at);

-- Link direct Demo Party guests to the existing authoritative referral ledger.
do $$
declare
  old_constraint_name text;
  old_constraint_count bigint;
begin
  select count(*),max(candidate.conname)
  into old_constraint_count,old_constraint_name
  from (
    select constraint_row.conname::text,
      pg_catalog.pg_get_constraintdef(constraint_row.oid) as definition
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid='checkout_private.referrals'::regclass
      and constraint_row.contype='c'
      and constraint_row.conname<>'referrals_higher_tier_reward_cents_check'
  ) candidate
  where candidate.definition like '%higher_tier_reward_cents%'
    and candidate.definition like '%qualifying_brand%'
    and candidate.definition like '%''Lymow''%'
    and candidate.definition like '%''Yarbo''%'
    and candidate.definition like '%''Pandag''%'
    and candidate.definition like '%7500%'
    and candidate.definition like '%15000%'
    and candidate.definition like '%100000%'
    and candidate.definition not like '%base_reward_cents%'
    and candidate.definition not like '%demo_party_guest_id%';

  if old_constraint_count<>1 then
    raise exception 'Expected exactly one legacy higher_tier_reward_cents CHECK constraint, found %',old_constraint_count;
  end if;

  execute pg_catalog.format(
    'alter table checkout_private.referrals drop constraint %I',
    old_constraint_name
  );
end
$$;

alter table checkout_private.referrals
  add column demo_party_request_id uuid references scheduling_private.demo_parties(request_id) on delete restrict,
  add column demo_party_guest_id uuid references scheduling_private.demo_party_guests(id) on delete restrict,
  add column demo_party_purchase_window_ends_at timestamptz,
  add constraint checkout_referrals_demo_party_guest_request_fkey
    foreign key(demo_party_guest_id,demo_party_request_id)
    references scheduling_private.demo_party_guests(id,request_id) on delete restrict,
  add constraint referrals_higher_tier_reward_cents_check check (
    (demo_party_guest_id is not null and higher_tier_reward_cents=base_reward_cents)
    or
    (demo_party_guest_id is null and (
      (qualifying_brand='Lymow' and higher_tier_reward_cents=7500) or
      (qualifying_brand='Yarbo' and higher_tier_reward_cents=15000) or
      (qualifying_brand='Pandag' and higher_tier_reward_cents=100000)
    ))
  ),
  add constraint checkout_referrals_demo_party_direct_check check (
    (demo_party_request_id is null and demo_party_guest_id is null and demo_party_purchase_window_ends_at is null)
    or
    (demo_party_request_id is not null and demo_party_guest_id is not null and demo_party_purchase_window_ends_at is not null)
  ),
  add constraint checkout_referrals_demo_party_tier_one_check check (
    demo_party_guest_id is null
    or (
      higher_tier_reward_cents=base_reward_cents
      and (final_reward_cents is null or final_reward_cents=base_reward_cents)
      and (tier_applied is null or tier_applied='base')
    )
  );
create unique index checkout_referrals_demo_party_guest_unique
  on checkout_private.referrals(demo_party_guest_id)
  where demo_party_guest_id is not null;
create index checkout_referrals_demo_party_request_idx
  on checkout_private.referrals(demo_party_request_id,status)
  where demo_party_request_id is not null;

-- Every private scheduling table is inaccessible to browser roles. Mutations
-- are available only through server-held service-role calls and restricted RPCs.
alter table scheduling_private.appointment_portal_tokens enable row level security;
alter table scheduling_private.appointment_portal_tokens force row level security;
alter table scheduling_private.demo_payments enable row level security;
alter table scheduling_private.demo_payments force row level security;
alter table scheduling_private.demo_parties enable row level security;
alter table scheduling_private.demo_parties force row level security;
alter table scheduling_private.demo_party_guests enable row level security;
alter table scheduling_private.demo_party_guests force row level security;
alter table scheduling_private.demo_party_benefit_ledger enable row level security;
alter table scheduling_private.demo_party_benefit_ledger force row level security;
alter table scheduling_private.demo_party_benefit_events enable row level security;
alter table scheduling_private.demo_party_benefit_events force row level security;
alter table scheduling_private.demo_refund_attempts enable row level security;
alter table scheduling_private.demo_refund_attempts force row level security;
alter table scheduling_private.demo_party_benefit_redemptions enable row level security;
alter table scheduling_private.demo_party_benefit_redemptions force row level security;
alter table scheduling_private.appointment_audit_events enable row level security;
alter table scheduling_private.appointment_audit_events force row level security;

revoke all on all tables in schema scheduling_private from public,anon,authenticated,service_role;
grant select,insert,update on all tables in schema scheduling_private to service_role;
grant delete on table scheduling_private.demo_party_guests to service_role;

alter table public.demo_notification_events
  drop constraint demo_notification_events_event_type_check,
  add constraint demo_notification_events_event_type_check check (event_type in (
    'ids_new_request','customer_request_received','customer_approved','ids_calendar_invite','customer_denied',
    'customer_more_information','customer_payment_required',
    'customer_payment_confirmed_private','customer_payment_confirmed_party'
  ));

create function scheduling_private.recalculate_demo_party_benefits(p_request_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path=pg_catalog,public,scheduling_private
as $$
declare
  qualifying_count integer;
  fee_refund integer;
  base_discount integer;
  benefit record;
  existing scheduling_private.demo_party_benefit_ledger;
  had_existing boolean;
  next_state text;
begin
  perform 1 from scheduling_private.demo_parties where request_id=p_request_id for update;
  if not found then raise exception 'demo_party_not_found'; end if;

  select least(5,count(*))::integer into qualifying_count
  from scheduling_private.demo_party_guests
  where request_id=p_request_id and qualification_status='qualifying';

  fee_refund:=qualifying_count*2000;
  base_discount:=qualifying_count*2000;

  for benefit in
    select * from (values
      ('demo_fee_refund'::text,fee_refund),
      ('base_machine_discount'::text,base_discount)
    ) as calculated(benefit_type,earned_cents)
  loop
    select * into existing
    from scheduling_private.demo_party_benefit_ledger
    where request_id=p_request_id and benefit_type=benefit.benefit_type and source_key='party'
    for update;
    had_existing:=found;
    if had_existing and existing.consumed_cents+coalesce((
      select sum(redemption.amount_cents)
      from scheduling_private.demo_party_benefit_redemptions redemption
      where redemption.request_id=p_request_id
        and redemption.benefit_type=benefit.benefit_type
        and redemption.state='reserved'
    ),0)>benefit.earned_cents then
      raise exception 'consumed_benefit_conflict';
    end if;
    next_state:=case
      when benefit.earned_cents=0 then 'pending'
      when coalesce(existing.consumed_cents,0)=0 then 'earned'
      when coalesce(existing.consumed_cents,0)<benefit.earned_cents then 'partially_consumed'
      else 'consumed'
    end;
    insert into scheduling_private.demo_party_benefit_ledger
      (request_id,benefit_type,source_key,earned_cents,consumed_cents,state)
    values
      (p_request_id,benefit.benefit_type,'party',benefit.earned_cents,0,next_state)
    on conflict(request_id,benefit_type,source_key) do update set
      earned_cents=excluded.earned_cents,
      state=next_state,
      updated_at=now();
    if not had_existing or existing.earned_cents is distinct from benefit.earned_cents then
      insert into scheduling_private.demo_party_benefit_events
        (request_id,benefit_type,event_type,amount_cents,balance_after_cents,source,metadata)
      values
        (p_request_id,benefit.benefit_type,'calculated',benefit.earned_cents,
         benefit.earned_cents-coalesce(existing.consumed_cents,0),'verified_attendance',
         jsonb_build_object('qualifyingGuests',qualifying_count,'calculationVersion','demo-party-benefits-v1'));
    end if;
  end loop;

  return jsonb_build_object(
    'qualifyingGuests',qualifying_count,
    'feeRefundCents',fee_refund,
    'baseMachineDiscountCents',base_discount,
    'maximumMachineDiscountCents',base_discount
  );
end
$$;

create function public.scheduling_create_demo_request(
  p_name text,
  p_email text,
  p_phone text,
  p_address text,
  p_start_at timestamptz,
  p_source text,
  p_equipment_interest text,
  p_notes text,
  p_demo_format text,
  p_party_screening jsonb,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security invoker
set search_path=pg_catalog,public,scheduling_private
as $$
declare
  request_id uuid;
  request_end timestamptz;
  local_start timestamp;
  availability_rule public.demo_availability_rules;
  demo_settings_row public.demo_settings;
  type_settings public.appointment_type_settings;
  existing public.demo_requests;
  fingerprint text;
begin
  if p_demo_format not in ('private','party') then raise exception 'invalid_demo_format'; end if;
  if p_demo_format='party' and (
    p_party_screening is null
    or p_party_screening->>'propertyRelationship' not in ('homeowner','property_owner','authorized_property_manager')
    or p_party_screening->>'propertyType' not in ('residential','commercial','rental_property','hoa','other')
    or (p_party_screening->>'purchaseTimeframe') not in ('within_30_days','1_to_3_months','3_to_6_months','researching_later')
    or (p_party_screening->>'equipmentBudget') not in ('under_3000','3000_to_5000','5000_to_8000','8000_to_12000','12000_plus')
    or (p_party_screening->>'certification')::boolean is distinct from true
  ) then raise exception 'invalid_party_screening'; end if;
  if p_demo_format='private' and p_party_screening is not null then raise exception 'private_demo_party_payload'; end if;

  fingerprint:=md5(jsonb_build_object(
    'name',p_name,'email',lower(p_email),'phone',p_phone,'address',p_address,
    'startAt',p_start_at,'source',p_source,'equipmentInterest',p_equipment_interest,
    'notes',p_notes,'demoFormat',p_demo_format,'partyScreening',p_party_screening
  )::text);

  -- Serialize retries sharing the same browser-generated key before checking or
  -- inserting, so simultaneous submissions cannot fall through to a unique or
  -- calendar-exclusion error instead of returning the original request.
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text,0));
  select * into existing from public.demo_requests where idempotency_key=p_idempotency_key for update;
  if found then
    if existing.scheduling_fingerprint is not null and existing.scheduling_fingerprint<>fingerprint then
      raise exception 'idempotency_conflict';
    end if;
    if existing.scheduling_fingerprint is null and (
      existing.customer_name is distinct from p_name
      or lower(existing.customer_email) is distinct from lower(p_email)
      or existing.customer_phone is distinct from p_phone
      or existing.property_address is distinct from p_address
      or existing.requested_start_at is distinct from p_start_at
      or existing.source is distinct from p_source
      or existing.equipment_interest is distinct from p_equipment_interest
      or existing.demo_format is distinct from p_demo_format
      or existing.notes is distinct from p_notes
    ) then raise exception 'idempotency_conflict'; end if;
    if p_demo_format='party' and not exists (
      select 1 from scheduling_private.demo_parties party
      where party.request_id=existing.id
        and party.property_relationship=p_party_screening->>'propertyRelationship'
        and party.property_type=p_party_screening->>'propertyType'
        and party.mowable_acreage=(p_party_screening->>'mowableAcreage')::numeric
        and party.actively_considering_purchase=(p_party_screening->>'activelyConsideringPurchase')::boolean
        and party.purchase_timeframe=p_party_screening->>'purchaseTimeframe'
        and party.equipment_budget=p_party_screening->>'equipmentBudget'
        and party.decision_maker=(p_party_screening->>'decisionMaker')::boolean
        and party.property_authorization_certified
    ) then raise exception 'idempotency_conflict'; end if;
    update public.demo_requests set scheduling_fingerprint=fingerprint where id=existing.id and scheduling_fingerprint is null;
    return existing.id;
  end if;

  select * into type_settings from public.appointment_type_settings where appointment_type='demo' and public_active;
  if not found then raise exception 'appointment_type_unavailable'; end if;
  select * into demo_settings_row from public.demo_settings where id=true;
  request_end:=p_start_at+make_interval(mins=>type_settings.duration_minutes);
  if p_start_at<=now() or p_start_at>now()+make_interval(days=>demo_settings_row.scheduling_horizon_days) then
    raise exception 'slot_unavailable';
  end if;
  local_start:=p_start_at at time zone demo_settings_row.timezone;
  select * into availability_rule
  from public.demo_availability_rules
  where weekday=extract(dow from local_start)::smallint and enabled;
  if not found
    or local_start<>date_trunc('minute',local_start)
    or local_start::time<availability_rule.start_time
    or mod(extract(epoch from (local_start::time-availability_rule.start_time))::bigint,type_settings.duration_minutes*60)<>0
    or (request_end at time zone demo_settings_row.timezone)::date<>local_start::date
    or (request_end at time zone demo_settings_row.timezone)::time>availability_rule.end_time
  then raise exception 'slot_unavailable'; end if;
  if exists (
    select 1 from public.demo_availability_exceptions
    where tstzrange(starts_at,ends_at,'[)')&&tstzrange(p_start_at,request_end,'[)')
  ) then raise exception 'slot_unavailable'; end if;
  if exists (
    select 1 from public.demo_requests
    where created_at>now()-interval '5 minutes'
      and idempotency_key<>p_idempotency_key
      and (lower(customer_email)=lower(p_email)
        or regexp_replace(customer_phone,'[^0-9]','','g')=regexp_replace(p_phone,'[^0-9]','','g'))
  ) then raise exception 'request_throttled'; end if;

  insert into public.demo_requests(
    customer_name,customer_email,customer_phone,property_address,
    requested_start_at,requested_end_at,status,source,equipment_interest,
    idempotency_key,appointment_type,duration_minutes,demo_format,notes,payment_status,scheduling_fingerprint
  ) values (
    p_name,lower(p_email),p_phone,p_address,p_start_at,request_end,'pending',p_source,p_equipment_interest,
    p_idempotency_key,'demo',type_settings.duration_minutes,p_demo_format,p_notes,'not_started',fingerprint
  ) returning id into request_id;

  if p_demo_format='party' then
    insert into scheduling_private.demo_parties(
      request_id,property_relationship,property_type,mowable_acreage,
      actively_considering_purchase,purchase_timeframe,equipment_budget,
      decision_maker,property_authorization_certified
    ) values (
      request_id,p_party_screening->>'propertyRelationship',p_party_screening->>'propertyType',
      (p_party_screening->>'mowableAcreage')::numeric,
      (p_party_screening->>'activelyConsideringPurchase')::boolean,
      p_party_screening->>'purchaseTimeframe',p_party_screening->>'equipmentBudget',
      (p_party_screening->>'decisionMaker')::boolean,true
    );
    perform scheduling_private.recalculate_demo_party_benefits(request_id);
  end if;
  insert into scheduling_private.appointment_audit_events(request_id,event_type,actor_type,metadata)
  values(request_id,'request_submitted','customer',jsonb_build_object('appointmentType','demo','demoFormat',p_demo_format));
  return request_id;
exception when exclusion_violation then raise exception 'slot_conflict';
end
$$;

create function public.scheduling_transition_appointment(p_request_id uuid,p_action text,p_message text default null)
returns text
language plpgsql
security invoker
set search_path=pg_catalog,public,scheduling_private
as $$
declare current_status text;
begin
  select status into current_status from public.demo_requests where id=p_request_id for update;
  if not found then raise exception 'request_not_found'; end if;
  if p_action='approve' then
    if current_status='approved' then return 'unchanged'; end if;
    if current_status<>'pending' then raise exception 'invalid_transition'; end if;
    update public.demo_requests set status='approved',approved_at=now(),denied_at=null,
      cancelled_at=null,admin_message=null,information_requested_at=null,payment_status='not_started',updated_at=now()
    where id=p_request_id;
    insert into scheduling_private.demo_payments(request_id) values(p_request_id) on conflict(request_id) do nothing;
  elsif p_action='request_info' then
    if current_status<>'pending' or nullif(btrim(p_message),'') is null then raise exception 'invalid_transition'; end if;
    if exists(select 1 from public.demo_requests where id=p_request_id and admin_message=btrim(p_message) and information_requested_at is not null) then return 'unchanged'; end if;
    update public.demo_requests set admin_message=left(btrim(p_message),2000),information_requested_at=now(),updated_at=now()
    where id=p_request_id;
  elsif p_action='deny' then
    if current_status='denied' then return 'unchanged'; end if;
    if current_status<>'pending' or nullif(btrim(p_message),'') is null then raise exception 'invalid_transition'; end if;
    update public.demo_requests set status='denied',denied_at=now(),approved_at=null,cancelled_at=null,
      admin_message=left(btrim(p_message),2000),updated_at=now() where id=p_request_id;
  elsif p_action='cancel' then
    if current_status='cancelled' then return 'unchanged'; end if;
    if current_status<>'approved' then raise exception 'invalid_transition'; end if;
    update public.demo_requests set status='cancelled',cancelled_at=now(),approved_at=null,updated_at=now()
    where id=p_request_id;
  else raise exception 'invalid_action'; end if;
  insert into scheduling_private.appointment_audit_events(request_id,event_type,actor_type,metadata)
  values(p_request_id,'request_'||p_action,'admin',jsonb_build_object('messageProvided',p_message is not null));
  return 'changed';
end
$$;

create function public.scheduling_set_portal_token(p_request_id uuid,p_token_hash text)
returns void
language plpgsql
security invoker
set search_path=pg_catalog,public,scheduling_private
as $$
begin
  if p_token_hash!~'^[0-9a-f]{64}$' then raise exception 'invalid_token_hash'; end if;
  perform 1 from public.demo_requests where id=p_request_id and status='approved' for update;
  if not found then raise exception 'portal_unavailable'; end if;
  insert into scheduling_private.demo_payments(request_id) values(p_request_id) on conflict(request_id) do nothing;
  insert into scheduling_private.appointment_portal_tokens(request_id,token_hash)
  values(p_request_id,p_token_hash)
  on conflict(request_id) do update set token_hash=excluded.token_hash,revoked_at=null,
    regenerated_at=now(),updated_at=now();
  insert into scheduling_private.appointment_audit_events(request_id,event_type,actor_type)
  values(p_request_id,'portal_token_issued','system');
end
$$;

create function public.scheduling_revoke_portal_token(p_request_id uuid)
returns void
language plpgsql
security invoker
set search_path=pg_catalog,public,scheduling_private
as $$
begin
  update scheduling_private.appointment_portal_tokens
  set revoked_at=now(),updated_at=now() where request_id=p_request_id and revoked_at is null;
  if not found then raise exception 'portal_token_not_found'; end if;
  insert into scheduling_private.appointment_audit_events(request_id,event_type,actor_type)
  values(p_request_id,'portal_token_revoked','admin');
end
$$;

create function public.scheduling_add_demo_party_guest(p_token_hash text,p_full_name text,p_email text,p_phone text)
returns jsonb
language plpgsql
security invoker
set search_path=pg_catalog,public,scheduling_private
as $$
declare request_uuid uuid; guest scheduling_private.demo_party_guests;
begin
  select token.request_id into request_uuid
  from scheduling_private.appointment_portal_tokens token
  join public.demo_requests request on request.id=token.request_id
  join scheduling_private.demo_parties party on party.request_id=request.id
  where token.token_hash=p_token_hash and token.revoked_at is null
    and request.status='approved' and request.payment_status in ('paid','partially_refunded','refunded')
  for update of party;
  if not found then raise exception 'guest_management_unavailable'; end if;
  if exists(select 1 from scheduling_private.demo_parties where request_id=request_uuid and guest_list_locked) then
    raise exception 'guest_list_locked';
  end if;
  if (select count(*) from scheduling_private.demo_party_guests where request_id=request_uuid)>=5 then
    raise exception 'guest_limit_reached';
  end if;
  insert into scheduling_private.demo_party_guests(request_id,full_name,email,normalized_email,phone)
  values(request_uuid,btrim(p_full_name),lower(btrim(p_email)),lower(btrim(p_email)),btrim(p_phone))
  returning * into guest;
  insert into scheduling_private.appointment_audit_events(request_id,event_type,actor_type,metadata)
  values(request_uuid,'guest_added','customer',jsonb_build_object('guestId',guest.id));
  return jsonb_build_object('id',guest.id,'fullName',guest.full_name,'email',guest.email,'phone',guest.phone,
    'checkedInAt',guest.checked_in_at,'checkedOutAt',guest.checked_out_at,
    'qualificationStatus',guest.qualification_status,'qualificationVerifiedAt',guest.qualification_verified_at,
    'followUpConsent',guest.follow_up_consent,'referralIdentifier',guest.referral_identifier);
end
$$;

create function public.scheduling_update_demo_party_guest(p_token_hash text,p_guest_id uuid,p_full_name text,p_email text,p_phone text)
returns jsonb
language plpgsql
security invoker
set search_path=pg_catalog,public,scheduling_private
as $$
declare request_uuid uuid; guest scheduling_private.demo_party_guests;
begin
  select token.request_id into request_uuid
  from scheduling_private.appointment_portal_tokens token
  join public.demo_requests request on request.id=token.request_id
  join scheduling_private.demo_parties party on party.request_id=request.id
  where token.token_hash=p_token_hash and token.revoked_at is null
    and request.status='approved' and request.payment_status in ('paid','partially_refunded','refunded')
  for update of party;
  if not found then raise exception 'guest_management_unavailable'; end if;
  if exists(select 1 from scheduling_private.demo_parties where request_id=request_uuid and guest_list_locked) then
    raise exception 'guest_list_locked';
  end if;
  update scheduling_private.demo_party_guests
  set full_name=btrim(p_full_name),email=lower(btrim(p_email)),normalized_email=lower(btrim(p_email)),
    phone=btrim(p_phone),updated_at=now()
  where id=p_guest_id and request_id=request_uuid
  returning * into guest;
  if not found then raise exception 'guest_not_found'; end if;
  insert into scheduling_private.appointment_audit_events(request_id,event_type,actor_type,metadata)
  values(request_uuid,'guest_updated','customer',jsonb_build_object('guestId',guest.id));
  return jsonb_build_object('id',guest.id,'fullName',guest.full_name,'email',guest.email,'phone',guest.phone,
    'checkedInAt',guest.checked_in_at,'checkedOutAt',guest.checked_out_at,
    'qualificationStatus',guest.qualification_status,'qualificationVerifiedAt',guest.qualification_verified_at,
    'followUpConsent',guest.follow_up_consent,'referralIdentifier',guest.referral_identifier);
end
$$;

create function public.scheduling_delete_demo_party_guest(p_token_hash text,p_guest_id uuid)
returns void
language plpgsql
security invoker
set search_path=pg_catalog,public,scheduling_private,checkout_private
as $$
declare request_uuid uuid;
begin
  select token.request_id into request_uuid
  from scheduling_private.appointment_portal_tokens token
  join public.demo_requests request on request.id=token.request_id
  join scheduling_private.demo_parties party on party.request_id=request.id
  where token.token_hash=p_token_hash and token.revoked_at is null
    and request.status='approved' and request.payment_status in ('paid','partially_refunded','refunded')
  for update of party;
  if not found then raise exception 'guest_management_unavailable'; end if;
  if exists(select 1 from scheduling_private.demo_parties where request_id=request_uuid and guest_list_locked) then
    raise exception 'guest_list_locked';
  end if;
  if exists(select 1 from checkout_private.referrals where demo_party_guest_id=p_guest_id) then
    raise exception 'guest_has_linked_purchase';
  end if;
  delete from scheduling_private.demo_party_guests
  where id=p_guest_id and request_id=request_uuid and qualification_status='pending';
  if not found then raise exception 'guest_cannot_be_removed'; end if;
  insert into scheduling_private.appointment_audit_events(request_id,event_type,actor_type,metadata)
  values(request_uuid,'guest_removed','customer',jsonb_build_object('guestId',p_guest_id));
end
$$;

create function public.scheduling_admin_set_demo_party_lock(p_request_id uuid,p_locked boolean,p_reason text default null)
returns void
language plpgsql
security invoker
set search_path=pg_catalog,public,scheduling_private
as $$
begin
  if p_locked and (p_reason is null or char_length(btrim(p_reason))<1 or char_length(btrim(p_reason))>500) then raise exception 'lock_reason_required'; end if;
  update scheduling_private.demo_parties set guest_list_locked=p_locked,
    guest_list_locked_at=case when p_locked then now() else null end,
    guest_list_lock_reason=case when p_locked then btrim(p_reason) else null end,updated_at=now()
  where request_id=p_request_id;
  if not found then raise exception 'demo_party_not_found'; end if;
  insert into scheduling_private.appointment_audit_events(request_id,event_type,actor_type,metadata)
  values(p_request_id,case when p_locked then 'guest_list_locked' else 'guest_list_unlocked' end,'admin',jsonb_build_object('reason',p_reason));
end
$$;

create function public.scheduling_admin_update_demo_party_guest(
  p_guest_id uuid,p_action text,p_note text default null,p_follow_up_consent boolean default null
)
returns jsonb
language plpgsql
security invoker
set search_path=pg_catalog,public,scheduling_private
as $$
declare guest scheduling_private.demo_party_guests; request_row public.demo_requests; benefits jsonb;
begin
  select * into guest from scheduling_private.demo_party_guests where id=p_guest_id for update;
  if not found then raise exception 'guest_not_found'; end if;
  select * into request_row from public.demo_requests where id=guest.request_id;
  if not found then raise exception 'appointment_not_found'; end if;
  if request_row.appointment_type<>'demo' or request_row.demo_format<>'party'
    or request_row.status<>'approved'
    or request_row.payment_status not in ('paid','partially_refunded','refunded')
  then raise exception 'attendance_unavailable'; end if;
  if p_action='check_in' then
    if now()<request_row.requested_start_at+interval '2 hours' then raise exception 'guest_check_in_not_open'; end if;
    if now()>request_row.requested_end_at-interval '1 hour' then raise exception 'guest_check_in_too_late'; end if;
    if guest.checked_in_at is null then
      update scheduling_private.demo_party_guests set checked_in_at=now(),updated_at=now() where id=p_guest_id returning * into guest;
    end if;
  elsif p_action='check_out' then
    if guest.checked_in_at is null then raise exception 'guest_not_checked_in'; end if;
    if guest.checked_out_at is null then
      update scheduling_private.demo_party_guests set checked_out_at=least(now(),request_row.requested_end_at),updated_at=now() where id=p_guest_id returning * into guest;
    end if;
  elsif p_action='qualify' then
    if guest.checked_in_at is null
      or now()<guest.checked_in_at+interval '1 hour'
      or (guest.checked_out_at is not null and guest.checked_out_at<guest.checked_in_at+interval '1 hour')
    then
      raise exception 'one_hour_requirement_not_met';
    end if;
    update scheduling_private.demo_party_guests set qualification_status='qualifying',
      qualification_verified_at=now(),qualification_note=nullif(btrim(p_note),''),updated_at=now()
    where id=p_guest_id returning * into guest;
  elsif p_action='not_qualifying' then
    if guest.qualification_status='qualifying' and exists(
      select 1 from checkout_private.referrals where demo_party_guest_id=guest.id
    ) then raise exception 'guest_has_linked_referral'; end if;
    update scheduling_private.demo_party_guests set qualification_status='not_qualifying',
      qualification_verified_at=now(),qualification_note=nullif(btrim(p_note),''),updated_at=now()
    where id=p_guest_id returning * into guest;
  elsif p_action='consent' then
    if p_follow_up_consent is null then raise exception 'consent_value_required'; end if;
    update scheduling_private.demo_party_guests set follow_up_consent=p_follow_up_consent,
      follow_up_consent_recorded_at=now(),updated_at=now()
    where id=p_guest_id returning * into guest;
  else raise exception 'invalid_attendance_action'; end if;
  benefits:=scheduling_private.recalculate_demo_party_benefits(guest.request_id);
  insert into scheduling_private.appointment_audit_events(request_id,event_type,actor_type,metadata)
  values(guest.request_id,'guest_'||p_action,'admin',jsonb_build_object('guestId',guest.id));
  return jsonb_build_object('guestId',guest.id,'benefits',benefits);
end
$$;

create function public.scheduling_admin_set_demo_party_food(
  p_request_id uuid,p_status text,p_notes text,p_budget_cents integer
)
returns void
language plpgsql
security invoker
set search_path=pg_catalog,public,scheduling_private
as $$
begin
  if p_status not in ('not_planned','planned','arranged','completed','cancelled') then raise exception 'invalid_food_support_status'; end if;
  if p_budget_cents is not null and (p_budget_cents<0 or p_budget_cents>15000) then raise exception 'food_budget_exceeds_cap'; end if;
  if p_notes is not null and char_length(btrim(p_notes))>1000 then raise exception 'food_notes_too_long'; end if;
  update scheduling_private.demo_parties set food_support_status=p_status,
    food_notes=nullif(btrim(p_notes),''),food_budget_cents=p_budget_cents,updated_at=now()
  where request_id=p_request_id;
  if not found then raise exception 'demo_party_not_found'; end if;
  insert into scheduling_private.appointment_audit_events(request_id,event_type,actor_type,metadata)
  values(p_request_id,'food_support_updated','admin',jsonb_build_object('status',p_status,'budgetCents',p_budget_cents));
end
$$;

create function public.scheduling_prepare_demo_checkout(p_token_hash text)
returns jsonb
language plpgsql
security invoker
set search_path=pg_catalog,public,scheduling_private
as $$
declare request_row public.demo_requests; payment scheduling_private.demo_payments; generation_key uuid;
begin
  select request.* into request_row
  from scheduling_private.appointment_portal_tokens token
  join public.demo_requests request on request.id=token.request_id
  where token.token_hash=p_token_hash and token.revoked_at is null
  for update of request;
  if not found or request_row.status<>'approved' then raise exception 'payment_not_approved'; end if;
  insert into scheduling_private.demo_payments(request_id) values(request_row.id) on conflict(request_id) do nothing;
  select * into payment from scheduling_private.demo_payments where request_id=request_row.id for update;
  if payment.status in ('paid','partially_refunded','refunded') then
    return jsonb_build_object('state','paid','requestId',request_row.id,'amountCents',payment.amount_cents);
  end if;
  if payment.status='checkout_open' and payment.stripe_checkout_expires_at>now()+interval '1 minute' and payment.stripe_checkout_url is not null then
    return jsonb_build_object('state','resume','requestId',request_row.id,'amountCents',payment.amount_cents,
      'checkoutUrl',payment.stripe_checkout_url,'sessionId',payment.stripe_checkout_session_id);
  end if;
  if payment.status='creating' and payment.checkout_generation_started_at>now()-interval '10 minutes' then
    return jsonb_build_object('state','create','requestId',request_row.id,'amountCents',payment.amount_cents,
      'generationKey',payment.checkout_generation_key,'customerEmail',request_row.customer_email);
  end if;
  generation_key:=gen_random_uuid();
  update scheduling_private.demo_payments set status='creating',checkout_generation_key=generation_key,
    checkout_generation_started_at=now(),stripe_checkout_session_id=null,stripe_checkout_url=null,
    stripe_checkout_expires_at=null,updated_at=now() where id=payment.id;
  return jsonb_build_object('state','create','requestId',request_row.id,'amountCents',payment.amount_cents,
    'generationKey',generation_key,'customerEmail',request_row.customer_email);
end
$$;

create function public.scheduling_link_demo_checkout(
  p_request_id uuid,p_generation_key uuid,p_session_id text,p_checkout_url text,p_expires_at timestamptz
)
returns void
language plpgsql
security invoker
set search_path=pg_catalog,public,scheduling_private
as $$
declare payment scheduling_private.demo_payments;
begin
  select * into payment from scheduling_private.demo_payments where request_id=p_request_id for update;
  if not found then raise exception 'payment_not_found'; end if;
  if payment.status in ('paid','partially_refunded','refunded') then return; end if;
  if payment.status='checkout_open' and payment.stripe_checkout_session_id=p_session_id then return; end if;
  if payment.status<>'creating' or payment.checkout_generation_key<>p_generation_key then raise exception 'stale_checkout_generation'; end if;
  update scheduling_private.demo_payments set status='checkout_open',stripe_checkout_session_id=p_session_id,
    stripe_checkout_url=p_checkout_url,stripe_checkout_expires_at=p_expires_at,
    checkout_generation_key=null,checkout_generation_started_at=null,updated_at=now()
  where id=payment.id;
  update public.demo_requests set payment_status='checkout_open',updated_at=now() where id=p_request_id and payment_status='not_started';
end
$$;

create function public.scheduling_apply_demo_payment(
  p_session_id text,p_payment_intent_id text,p_charge_id text default null
)
returns jsonb
language plpgsql
security invoker
set search_path=pg_catalog,public,scheduling_private
as $$
declare payment scheduling_private.demo_payments; request_row public.demo_requests;
begin
  select * into payment from scheduling_private.demo_payments where stripe_checkout_session_id=p_session_id for update;
  if not found then raise exception 'demo_payment_not_found'; end if;
  if payment.status in ('paid','partially_refunded','refunded') then
    if payment.stripe_payment_intent_id<>p_payment_intent_id then raise exception 'payment_identity_mismatch'; end if;
    return jsonb_build_object('changed',false,'requestId',payment.request_id);
  end if;
  if payment.status<>'checkout_open' then raise exception 'invalid_payment_state'; end if;
  update scheduling_private.demo_payments set status='paid',stripe_payment_intent_id=p_payment_intent_id,
    stripe_charge_id=coalesce(p_charge_id,stripe_charge_id),paid_cents=amount_cents,paid_at=now(),
    last_reconciled_at=now(),stripe_checkout_url=null,updated_at=now()
  where id=payment.id;
  update public.demo_requests set payment_status='paid',updated_at=now() where id=payment.request_id returning * into request_row;
  insert into scheduling_private.appointment_audit_events(request_id,event_type,actor_type,metadata)
  values(payment.request_id,'demo_fee_paid','stripe',jsonb_build_object('amountCents',payment.amount_cents,'sessionId',p_session_id));
  return jsonb_build_object('changed',true,'requestId',payment.request_id,'demoFormat',request_row.demo_format);
end
$$;

create function public.scheduling_expire_demo_checkout(p_session_id text)
returns void
language plpgsql
security invoker
set search_path=pg_catalog,public,scheduling_private
as $$
declare request_uuid uuid;
begin
  update scheduling_private.demo_payments set status='not_started',stripe_checkout_url=null,
    stripe_checkout_expires_at=null,updated_at=now()
  where stripe_checkout_session_id=p_session_id and status='checkout_open'
  returning request_id into request_uuid;
  if request_uuid is not null then
    update public.demo_requests set payment_status='not_started',updated_at=now()
    where id=request_uuid and payment_status='checkout_open';
  end if;
end
$$;

create function public.scheduling_prepare_demo_refund(p_request_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path=pg_catalog,public,scheduling_private
as $$
declare
  payment scheduling_private.demo_payments;
  benefit scheduling_private.demo_party_benefit_ledger;
  attempt scheduling_private.demo_refund_attempts;
  target_cents integer;
  refund_cents integer;
begin
  select * into payment from scheduling_private.demo_payments
  where request_id=p_request_id for update;
  if not found or payment.status not in ('paid','partially_refunded') then
    raise exception 'paid_demo_payment_not_found';
  end if;
  select * into benefit from scheduling_private.demo_party_benefit_ledger
  where request_id=p_request_id and benefit_type='demo_fee_refund' and source_key='party'
  for update;
  if not found then raise exception 'demo_fee_refund_not_earned'; end if;
  target_cents:=least(payment.paid_cents,benefit.earned_cents);
  refund_cents:=target_cents-payment.refunded_cents;
  if refund_cents<=0 then
    return jsonb_build_object('state','settled','requestId',p_request_id,
      'refundedCents',payment.refunded_cents,'targetRefundedCents',target_cents);
  end if;
  insert into scheduling_private.demo_refund_attempts(request_id,target_refunded_cents,amount_cents)
  values(p_request_id,target_cents,refund_cents)
  on conflict(request_id,target_refunded_cents) do update set updated_at=now()
  returning * into attempt;
  if attempt.state='succeeded' then
    return jsonb_build_object('state','settled','requestId',p_request_id,
      'refundedCents',target_cents,'targetRefundedCents',target_cents);
  end if;
  update scheduling_private.demo_refund_attempts
  set state='prepared',last_error_code=null,updated_at=now() where id=attempt.id;
  return jsonb_build_object('state','refund','requestId',p_request_id,
    'attemptId',attempt.id,'amountCents',refund_cents,'targetRefundedCents',target_cents,
    'paymentIntentId',payment.stripe_payment_intent_id,
    'idempotencyKey','demo-refund-'||attempt.id::text);
end
$$;

create function public.scheduling_finish_demo_refund(
  p_attempt_id uuid,p_success boolean,p_stripe_refund_id text default null,p_error_code text default null
)
returns jsonb
language plpgsql
security invoker
set search_path=pg_catalog,public,scheduling_private
as $$
declare
  attempt scheduling_private.demo_refund_attempts;
  payment scheduling_private.demo_payments;
  benefit scheduling_private.demo_party_benefit_ledger;
begin
  select * into attempt from scheduling_private.demo_refund_attempts where id=p_attempt_id for update;
  if not found then raise exception 'refund_attempt_not_found'; end if;
  select * into payment from scheduling_private.demo_payments where request_id=attempt.request_id for update;
  select * into benefit from scheduling_private.demo_party_benefit_ledger
  where request_id=attempt.request_id and benefit_type='demo_fee_refund' and source_key='party' for update;
  if attempt.state='succeeded' then
    if p_success and attempt.stripe_refund_id is distinct from p_stripe_refund_id then raise exception 'refund_identity_mismatch'; end if;
    return jsonb_build_object('changed',false,'requestId',attempt.request_id,'refundedCents',payment.refunded_cents);
  end if;
  if not p_success then
    update scheduling_private.demo_refund_attempts set state='failed',
      last_error_code=left(coalesce(nullif(p_error_code,''),'STRIPE_REFUND_FAILED'),100),completed_at=now(),updated_at=now()
    where id=attempt.id;
    return jsonb_build_object('changed',true,'requestId',attempt.request_id,'state','failed');
  end if;
  if nullif(btrim(p_stripe_refund_id),'') is null then raise exception 'stripe_refund_id_required'; end if;
  if attempt.target_refunded_cents>payment.paid_cents or attempt.target_refunded_cents>benefit.earned_cents then
    raise exception 'refund_amount_exceeds_entitlement';
  end if;
  update scheduling_private.demo_refund_attempts set state='succeeded',stripe_refund_id=p_stripe_refund_id,
    last_error_code=null,completed_at=now(),updated_at=now() where id=attempt.id;
  update scheduling_private.demo_payments set refunded_cents=attempt.target_refunded_cents,
    status=case when attempt.target_refunded_cents=paid_cents then 'refunded' else 'partially_refunded' end,
    last_reconciled_at=now(),updated_at=now() where id=payment.id;
  update public.demo_requests set payment_status=
    case when attempt.target_refunded_cents=payment.paid_cents then 'refunded' else 'partially_refunded' end,
    updated_at=now() where id=attempt.request_id;
  update scheduling_private.demo_party_benefit_ledger set consumed_cents=attempt.target_refunded_cents,
    state=case when attempt.target_refunded_cents=earned_cents then 'consumed' else 'partially_consumed' end,
    stripe_refund_id=p_stripe_refund_id,updated_at=now() where id=benefit.id;
  insert into scheduling_private.demo_party_benefit_events
    (request_id,benefit_type,event_type,amount_cents,balance_after_cents,source,stripe_refund_id)
  values(attempt.request_id,'demo_fee_refund','refunded',attempt.amount_cents,
    benefit.earned_cents-attempt.target_refunded_cents,'stripe_admin_refund',p_stripe_refund_id);
  insert into scheduling_private.appointment_audit_events(request_id,event_type,actor_type,metadata)
  values(attempt.request_id,'demo_fee_refunded','admin',jsonb_build_object(
    'amountCents',attempt.amount_cents,'targetRefundedCents',attempt.target_refunded_cents));
  return jsonb_build_object('changed',true,'requestId',attempt.request_id,
    'refundedCents',attempt.target_refunded_cents);
end
$$;

create function public.scheduling_reserve_demo_party_benefit(
  p_token_hash text,p_order_reference text,p_benefit_type text,p_application text
)
returns jsonb
language plpgsql
security invoker
set search_path=pg_catalog,public,scheduling_private,checkout_private
as $$
declare
  request_uuid uuid;
  host_email text;
  benefit scheduling_private.demo_party_benefit_ledger;
  order_row checkout_private.orders;
  redemption scheduling_private.demo_party_benefit_redemptions;
  remaining_cents integer;
  redemption_cents integer;
begin
  select token.request_id,lower(btrim(request.customer_email)) into request_uuid,host_email
  from scheduling_private.appointment_portal_tokens token
  join public.demo_requests request on request.id=token.request_id
  where token.token_hash=p_token_hash and token.revoked_at is null
    and request.status='approved' and request.payment_status in ('paid','partially_refunded','refunded');
  if not found then raise exception 'portal_unavailable'; end if;
  if p_benefit_type<>'base_machine_discount' then raise exception 'invalid_benefit_type'; end if;
  if p_application<>'machine' then raise exception 'invalid_benefit_application'; end if;
  select * into benefit from scheduling_private.demo_party_benefit_ledger
  where request_id=request_uuid and benefit_type=p_benefit_type and source_key='party' for update;
  if not found or benefit.state not in ('earned','partially_consumed') then raise exception 'benefit_unavailable'; end if;
  remaining_cents:=benefit.earned_cents-benefit.consumed_cents-coalesce((
    select sum(r.amount_cents) from scheduling_private.demo_party_benefit_redemptions r
    where r.request_id=request_uuid and r.benefit_type=p_benefit_type and r.state='reserved'
  ),0);
  select * into order_row from checkout_private.orders where public_reference=p_order_reference for update;
  if not found or order_row.payment_status<>'unpaid' or order_row.order_status<>'checkout_pending' then raise exception 'order_unavailable'; end if;
  if lower(btrim(coalesce(order_row.customer_email,'')))<>host_email then raise exception 'order_customer_mismatch'; end if;
  select * into redemption from scheduling_private.demo_party_benefit_redemptions
  where order_id=order_row.id and benefit_type=p_benefit_type for update;
  if found then
    if redemption.request_id=request_uuid and redemption.application=p_application and redemption.state='reserved' then
      return jsonb_build_object('redemptionId',redemption.id,'orderId',order_row.id,
        'amountCents',redemption.amount_cents,'application',redemption.application,'state','reserved');
    end if;
    raise exception 'benefit_order_already_linked';
  end if;
  if remaining_cents<=0 then raise exception 'benefit_consumed'; end if;
  if coalesce(order_row.pricing_snapshot->>'purchaseMode','')='accessories' then raise exception 'benefit_order_type_mismatch'; end if;
  if order_row.discount_cents>0 then raise exception 'machine_discount_non_stacking'; end if;
  if order_row.subtotal_cents<=0 then raise exception 'order_has_no_eligible_value'; end if;
  redemption_cents:=least(remaining_cents,order_row.subtotal_cents::integer);
  if redemption_cents<=0 then raise exception 'order_has_no_eligible_value'; end if;
  insert into scheduling_private.demo_party_benefit_redemptions
    (request_id,benefit_type,application,amount_cents,order_id)
  values(request_uuid,p_benefit_type,p_application,redemption_cents,order_row.id)
  returning * into redemption;
  insert into scheduling_private.demo_party_benefit_events
    (request_id,benefit_type,event_type,amount_cents,balance_after_cents,source,linked_order_id)
  values(request_uuid,p_benefit_type,'reserved',redemption.amount_cents,
    remaining_cents-redemption.amount_cents,'secure_portal',order_row.id);
  return jsonb_build_object('redemptionId',redemption.id,'orderId',order_row.id,
    'amountCents',redemption.amount_cents,'application',redemption.application);
end
$$;

create function public.scheduling_set_demo_party_redemption_state(
  p_redemption_id uuid,p_state text
)
returns void
language plpgsql
security invoker
set search_path=pg_catalog,public,scheduling_private
as $$
declare redemption scheduling_private.demo_party_benefit_redemptions; benefit scheduling_private.demo_party_benefit_ledger;
begin
  if p_state not in ('applied','released','voided') then raise exception 'invalid_redemption_state'; end if;
  select * into redemption from scheduling_private.demo_party_benefit_redemptions where id=p_redemption_id for update;
  if not found then raise exception 'redemption_not_found'; end if;
  select * into benefit from scheduling_private.demo_party_benefit_ledger
  where request_id=redemption.request_id and benefit_type=redemption.benefit_type and source_key='party' for update;
  if redemption.state=p_state then return; end if;
  if redemption.state<>'reserved' then raise exception 'invalid_redemption_transition'; end if;
  if p_state='applied' then
    if benefit.consumed_cents+redemption.amount_cents>benefit.earned_cents then raise exception 'benefit_double_spend'; end if;
    update scheduling_private.demo_party_benefit_ledger set consumed_cents=consumed_cents+redemption.amount_cents,
      state=case when consumed_cents+redemption.amount_cents=earned_cents then 'consumed' else 'partially_consumed' end,
      linked_order_id=redemption.order_id,updated_at=now() where id=benefit.id;
    update scheduling_private.demo_party_benefit_redemptions set state='applied',applied_at=now(),updated_at=now() where id=redemption.id;
  else
    update scheduling_private.demo_party_benefit_redemptions set state=p_state,released_at=case when p_state='released' then now() else released_at end,
      updated_at=now() where id=redemption.id;
  end if;
  insert into scheduling_private.demo_party_benefit_events
    (request_id,benefit_type,event_type,amount_cents,balance_after_cents,source,linked_order_id)
  values(redemption.request_id,redemption.benefit_type,
    case when p_state='applied' then 'redeemed' else 'released' end,redemption.amount_cents,
    benefit.earned_cents-benefit.consumed_cents-case when p_state='applied' then redemption.amount_cents else 0 end,
    'order_reconciliation',redemption.order_id);
end
$$;

create function public.scheduling_reconcile_demo_refund(
  p_payment_intent_id text,p_refunded_cents integer,p_event_id text
)
returns jsonb
language plpgsql
security invoker
set search_path=pg_catalog,public,scheduling_private
as $$
declare payment scheduling_private.demo_payments; benefit scheduling_private.demo_party_benefit_ledger; applied_cents integer;
begin
  select * into payment from scheduling_private.demo_payments
  where stripe_payment_intent_id=p_payment_intent_id for update;
  if not found then raise exception 'demo_payment_not_found'; end if;
  if p_refunded_cents<0 or p_refunded_cents>payment.paid_cents then raise exception 'invalid_refund_total'; end if;
  if p_refunded_cents<payment.refunded_cents then raise exception 'stale_refund_total'; end if;
  if p_refunded_cents=payment.refunded_cents then return jsonb_build_object('changed',false,'requestId',payment.request_id); end if;
  update scheduling_private.demo_payments set refunded_cents=p_refunded_cents,
    status=case when p_refunded_cents=paid_cents then 'refunded' else 'partially_refunded' end,
    last_reconciled_at=now(),updated_at=now() where id=payment.id;
  update public.demo_requests set payment_status=
    case when p_refunded_cents=payment.paid_cents then 'refunded' else 'partially_refunded' end,
    updated_at=now() where id=payment.request_id;
  select * into benefit from scheduling_private.demo_party_benefit_ledger
  where request_id=payment.request_id and benefit_type='demo_fee_refund' and source_key='party' for update;
  if found then
    applied_cents:=least(benefit.earned_cents,p_refunded_cents);
    update scheduling_private.demo_party_benefit_ledger set consumed_cents=applied_cents,
      state=case when applied_cents=0 then 'earned' when applied_cents=earned_cents then 'consumed' else 'partially_consumed' end,
      updated_at=now() where id=benefit.id;
  end if;
  insert into scheduling_private.appointment_audit_events(request_id,event_type,actor_type,metadata)
  values(payment.request_id,'demo_refund_reconciled','stripe',jsonb_build_object('refundedCents',p_refunded_cents,'eventId',p_event_id));
  return jsonb_build_object('changed',true,'requestId',payment.request_id,'refundedCents',p_refunded_cents);
end
$$;

create function public.scheduling_prepare_demo_party_benefit_checkout(
  p_token_hash text,p_order_reference text
)
returns jsonb
language plpgsql
security invoker
set search_path=pg_catalog,public,scheduling_private,checkout_private
as $$
declare
  request_uuid uuid;
  host_email text;
  order_row checkout_private.orders;
  attempt checkout_private.payment_attempts;
  customer checkout_private.customers;
  primary_item checkout_private.order_items;
  base_reserved integer;
  reserved_application text;
  msrp_cents integer;
  linked_attempt_id uuid;
  stored_url text;
  stored_expires_at timestamptz;
  pricing_applied boolean;
begin
  select token.request_id,lower(btrim(request.customer_email)) into request_uuid,host_email
  from scheduling_private.appointment_portal_tokens token
  join public.demo_requests request on request.id=token.request_id
  where token.token_hash=p_token_hash and token.revoked_at is null
    and request.status='approved' and request.payment_status in ('paid','partially_refunded','refunded');
  if not found then raise exception 'portal_unavailable'; end if;
  select * into order_row from checkout_private.orders where public_reference=p_order_reference for update;
  if not found or order_row.payment_status<>'unpaid' or order_row.order_status<>'checkout_pending' then raise exception 'order_unavailable'; end if;
  if lower(btrim(coalesce(order_row.customer_email,'')))<>host_email then raise exception 'order_customer_mismatch'; end if;
  if order_row.payment_method_choice<>'card' or order_row.pricing_snapshot->>'paymentMethod'<>'card' then raise exception 'benefit_checkout_requires_card'; end if;
  if order_row.currency<>'usd' then raise exception 'benefit_checkout_requires_usd'; end if;
  select * into customer from checkout_private.customers where id=order_row.customer_id;
  select coalesce(sum(amount_cents),0),min(application)
  into base_reserved,reserved_application
  from scheduling_private.demo_party_benefit_redemptions
  where request_id=request_uuid and order_id=order_row.id and benefit_type='base_machine_discount' and state='reserved';
  if base_reserved<=0 then raise exception 'no_reserved_benefit'; end if;
  if exists(
    select 1 from scheduling_private.demo_party_benefit_redemptions redemption
    where redemption.request_id=request_uuid and redemption.order_id=order_row.id
      and redemption.state='reserved' and redemption.application<>reserved_application
  ) then raise exception 'mixed_benefit_application'; end if;
  select checkout_attempt_id,checkout_url,checkout_expires_at
  into linked_attempt_id,stored_url,stored_expires_at
  from scheduling_private.demo_party_benefit_redemptions
  where request_id=request_uuid and order_id=order_row.id and state='reserved' and checkout_attempt_id is not null
  order by updated_at desc limit 1;
  pricing_applied:=order_row.pricing_snapshot->'safeMetadata'->>'phase'='demo-party-v1'
    and order_row.pricing_snapshot->'safeMetadata'->>'appointmentId'=request_uuid::text;
  if linked_attempt_id is not null then
    select * into attempt from checkout_private.payment_attempts where id=linked_attempt_id and order_id=order_row.id;
    if found and attempt.attempt_status in ('creating','open') then
      if stored_url is not null and stored_expires_at>now()+interval '1 minute' then
        return jsonb_build_object('state','resume','checkoutUrl',stored_url,'orderId',order_row.id,
          'attemptId',attempt.id,'pricingApplied',pricing_applied);
      end if;
      return jsonb_build_object('state','create','orderId',order_row.id,'publicReference',order_row.public_reference,
        'attemptId',attempt.id,'attemptCreatedAt',attempt.created_at,'stripeIdempotencyKey',attempt.idempotency_key,
        'customerEmail',order_row.customer_email,'snapshot',order_row.pricing_snapshot,
        'benefitCents',order_row.discount_cents,'pricingApplied',pricing_applied);
    end if;
  end if;
  select * into attempt from checkout_private.payment_attempts
  where order_id=order_row.id and attempt_status in ('creating','open')
  order by attempt_number desc limit 1 for update;
  if order_row.pricing_snapshot->>'purchaseMode'='accessories' or reserved_application<>'machine' then raise exception 'benefit_order_type_mismatch'; end if;
  select * into primary_item from checkout_private.order_items
  where order_id=order_row.id and item_type in ('product','variant','package') and not included_in_package_price
  order by created_at limit 1;
  if not found or primary_item.quantity<>1 then raise exception 'eligible_machine_not_found'; end if;
  if primary_item.item_type='product' then
    select display_msrp_price_cents into msrp_cents from public.catalog_products where id=primary_item.product_id;
  elsif primary_item.item_type='variant' then
    select display_msrp_price_cents into msrp_cents from public.catalog_product_variants where id=primary_item.variant_id;
  else
    select display_msrp_price_cents into msrp_cents from public.catalog_packages where id=primary_item.package_id;
  end if;
  if msrp_cents is null or msrp_cents<=0 then raise exception 'authoritative_msrp_unavailable'; end if;
  return jsonb_build_object('state','prepare','appointmentId',request_uuid,'orderId',order_row.id,
    'publicReference',order_row.public_reference,'updatedAt',order_row.updated_at,
    'snapshot',order_row.pricing_snapshot,'baseReservedCents',base_reserved,
    'application',reserved_application,'regularMachineMsrpCents',msrp_cents,
    'machineOrderItemId',primary_item.id,'machineSourceId',coalesce(primary_item.product_id,primary_item.variant_id,primary_item.package_id),
    'activeAttemptId',attempt.id,'activeSessionId',attempt.stripe_checkout_session_id,
    'pricingApplied',pricing_applied,'customerEmail',order_row.customer_email);
end
$$;

create function public.scheduling_release_demo_party_order_reservations(
  p_token_hash text,p_order_reference text
)
returns void
language plpgsql
security invoker
set search_path=pg_catalog,public,scheduling_private,checkout_private
as $$
declare request_uuid uuid; host_email text; order_uuid uuid; redemption record; benefit scheduling_private.demo_party_benefit_ledger;
begin
  select token.request_id,lower(btrim(request.customer_email)) into request_uuid,host_email
  from scheduling_private.appointment_portal_tokens token
  join public.demo_requests request on request.id=token.request_id
  where token.token_hash=p_token_hash and token.revoked_at is null
    and request.status='approved' and request.payment_status in ('paid','partially_refunded','refunded');
  if not found then raise exception 'portal_unavailable'; end if;
  select id into order_uuid from checkout_private.orders where public_reference=p_order_reference and payment_status='unpaid'
    and lower(btrim(coalesce(customer_email,'')))=host_email for update;
  if not found then raise exception 'order_unavailable'; end if;
  for redemption in select * from scheduling_private.demo_party_benefit_redemptions
    where request_id=request_uuid and order_id=order_uuid and state='reserved' and checkout_attempt_id is null for update
  loop
    update scheduling_private.demo_party_benefit_redemptions set state='released',released_at=now(),updated_at=now() where id=redemption.id;
    select * into benefit from scheduling_private.demo_party_benefit_ledger
    where request_id=request_uuid and benefit_type=redemption.benefit_type and source_key='party' for update;
    insert into scheduling_private.demo_party_benefit_events(request_id,benefit_type,event_type,amount_cents,balance_after_cents,source,linked_order_id)
    values(request_uuid,redemption.benefit_type,'released',redemption.amount_cents,
      benefit.earned_cents-benefit.consumed_cents,'existing_price_wins',order_uuid);
  end loop;
end
$$;

create function public.scheduling_apply_demo_party_benefit_checkout(
  p_token_hash text,p_order_reference text,p_expected_updated_at timestamptz,p_snapshot jsonb,
  p_subtotal_cents integer,p_discount_cents integer,p_total_cents integer,
  p_machine_order_item_id uuid,p_machine_unit_cents integer,p_old_attempt_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path=pg_catalog,public,scheduling_private,checkout_private
as $$
declare
  request_uuid uuid;
  host_email text;
  order_row checkout_private.orders;
  primary_item checkout_private.order_items;
  old_attempt checkout_private.payment_attempts;
  new_attempt checkout_private.payment_attempts;
  next_attempt integer;
  base_reserved integer;
  reserved_application text;
  expected_discount integer;
  expected_subtotal integer;
  msrp_cents integer;
  snapshot_sum bigint;
  pricing_applied boolean;
begin
  select token.request_id,lower(btrim(request.customer_email)) into request_uuid,host_email
  from scheduling_private.appointment_portal_tokens token
  join public.demo_requests request on request.id=token.request_id
  where token.token_hash=p_token_hash and token.revoked_at is null
    and request.status='approved' and request.payment_status in ('paid','partially_refunded','refunded');
  if not found then raise exception 'portal_unavailable'; end if;
  select * into order_row from checkout_private.orders where public_reference=p_order_reference for update;
  if not found or order_row.payment_status<>'unpaid' or order_row.order_status<>'checkout_pending'
    or order_row.payment_method_choice<>'card' then raise exception 'order_unavailable'; end if;
  if lower(btrim(coalesce(order_row.customer_email,'')))<>host_email then raise exception 'order_customer_mismatch'; end if;
  if order_row.updated_at is distinct from p_expected_updated_at then raise exception 'stale_benefit_order'; end if;
  perform 1 from scheduling_private.demo_party_benefit_redemptions
  where request_id=request_uuid and order_id=order_row.id and state='reserved' for update;
  select coalesce(sum(amount_cents),0),min(application)
  into base_reserved,reserved_application
  from scheduling_private.demo_party_benefit_redemptions
  where request_id=request_uuid and order_id=order_row.id and benefit_type='base_machine_discount' and state='reserved';
  if base_reserved<=0 then raise exception 'no_reserved_benefit'; end if;
  pricing_applied:=order_row.pricing_snapshot->'safeMetadata'->>'phase'='demo-party-v1'
    and order_row.pricing_snapshot->'safeMetadata'->>'appointmentId'=request_uuid::text;
  if pricing_applied then
    expected_subtotal:=order_row.subtotal_cents::integer;
    expected_discount:=order_row.discount_cents::integer;
    if p_snapshot is distinct from order_row.pricing_snapshot then raise exception 'benefit_snapshot_mismatch'; end if;
  else
    if order_row.pricing_snapshot->>'purchaseMode'='accessories' or reserved_application<>'machine' or base_reserved<=0 or order_row.discount_cents<>0 then raise exception 'machine_discount_non_stacking'; end if;
    select * into primary_item from checkout_private.order_items where id=p_machine_order_item_id and order_id=order_row.id for update;
    if not found or primary_item.item_type not in ('product','variant','package') or primary_item.quantity<>1 then raise exception 'eligible_machine_not_found'; end if;
    if primary_item.item_type='product' then select display_msrp_price_cents into msrp_cents from public.catalog_products where id=primary_item.product_id;
    elsif primary_item.item_type='variant' then select display_msrp_price_cents into msrp_cents from public.catalog_product_variants where id=primary_item.variant_id;
    else select display_msrp_price_cents into msrp_cents from public.catalog_packages where id=primary_item.package_id; end if;
    if msrp_cents is null or p_machine_unit_cents is distinct from msrp_cents then raise exception 'authoritative_msrp_mismatch'; end if;
    expected_discount:=base_reserved;
    if expected_discount>msrp_cents then raise exception 'benefit_exceeds_machine_msrp'; end if;
    if primary_item.extended_amount_cents<=msrp_cents-expected_discount then raise exception 'existing_price_wins'; end if;
    expected_subtotal:=order_row.subtotal_cents::integer-primary_item.extended_amount_cents::integer+msrp_cents;
  end if;
  if p_subtotal_cents<>expected_subtotal or p_discount_cents<>expected_discount
    or p_total_cents<>p_subtotal_cents-p_discount_cents or p_total_cents<0
    or (p_snapshot->>'subtotalCents')::integer<>p_subtotal_cents
    or (p_snapshot->>'discountCents')::integer<>p_discount_cents
    or (p_snapshot->>'totalCents')::integer<>p_total_cents
    or p_snapshot->>'purchaseMode' is distinct from order_row.pricing_snapshot->>'purchaseMode'
    or p_snapshot->'product' is distinct from order_row.pricing_snapshot->'product'
    or p_snapshot->'safeMetadata'->>'appointmentId' is distinct from request_uuid::text
  then raise exception 'invalid_benefit_pricing'; end if;
  select coalesce(sum((line->>'extendedAmountCents')::bigint),0) into snapshot_sum
  from jsonb_array_elements(p_snapshot->'chargeableItems') line
  where coalesce((line->>'includedInPackagePrice')::boolean,false)=false;
  if snapshot_sum<>p_subtotal_cents then raise exception 'invalid_benefit_line_total'; end if;
  if p_old_attempt_id is not null then
    select * into old_attempt from checkout_private.payment_attempts where id=p_old_attempt_id and order_id=order_row.id for update;
    if not found or old_attempt.attempt_status in ('succeeded','processing','completed') then raise exception 'old_checkout_cannot_be_replaced'; end if;
    update checkout_private.payment_attempts set attempt_status='expired',stripe_session_status='expired',updated_at=now() where id=old_attempt.id;
  elsif exists(select 1 from checkout_private.payment_attempts where order_id=order_row.id and attempt_status in ('creating','open')) then
    raise exception 'active_checkout_must_be_replaced';
  end if;
  if not pricing_applied then
    update checkout_private.orders set subtotal_cents=p_subtotal_cents,discount_cents=p_discount_cents,
      total_cents=p_total_cents,pricing_snapshot=p_snapshot,updated_at=now() where id=order_row.id;
    if p_machine_order_item_id is not null then
      update checkout_private.order_items set unit_amount_cents=p_machine_unit_cents,extended_amount_cents=p_machine_unit_cents,
        metadata_snapshot=metadata_snapshot||jsonb_build_object('demoPartyMsrpRoute',true,'appointmentId',request_uuid)
      where id=p_machine_order_item_id and order_id=order_row.id;
    end if;
  end if;
  select coalesce(max(attempt_number),0)+1 into next_attempt from checkout_private.payment_attempts where order_id=order_row.id;
  insert into checkout_private.payment_attempts(order_id,attempt_number,payment_method,idempotency_key,request_fingerprint,expected_amount_cents,expected_currency)
  values(order_row.id,next_attempt,'card','demo-party-benefit-'||order_row.id::text||'-'||next_attempt,
    md5(p_snapshot::text||request_uuid::text),p_total_cents,'usd') returning * into new_attempt;
  update scheduling_private.demo_party_benefit_redemptions set checkout_attempt_id=new_attempt.id,
    stripe_checkout_session_id=null,checkout_url=null,checkout_expires_at=null,updated_at=now()
  where request_id=request_uuid and order_id=order_row.id and state='reserved';
  insert into scheduling_private.appointment_audit_events(request_id,event_type,actor_type,metadata)
  values(request_uuid,'benefit_checkout_priced','customer',jsonb_build_object('orderId',order_row.id,'attemptId',new_attempt.id,'benefitCents',p_discount_cents));
  return jsonb_build_object('state','create','orderId',order_row.id,'publicReference',order_row.public_reference,
    'attemptId',new_attempt.id,'attemptCreatedAt',new_attempt.created_at,'stripeIdempotencyKey',new_attempt.idempotency_key,
    'customerEmail',order_row.customer_email,'snapshot',p_snapshot,'benefitCents',p_discount_cents,'pricingApplied',true);
end
$$;

create function public.scheduling_link_demo_party_benefit_checkout(
  p_token_hash text,p_attempt_id uuid,p_session_id text,p_checkout_url text,p_expires_at timestamptz
)
returns void
language plpgsql
security invoker
set search_path=pg_catalog,public,scheduling_private,checkout_private
as $$
declare request_uuid uuid; order_uuid uuid;
begin
  select request_id into request_uuid from scheduling_private.appointment_portal_tokens
  where token_hash=p_token_hash and revoked_at is null;
  if not found then raise exception 'portal_unavailable'; end if;
  select order_id into order_uuid from checkout_private.payment_attempts where id=p_attempt_id and stripe_checkout_session_id=p_session_id;
  if not found then raise exception 'checkout_attempt_not_linked'; end if;
  update scheduling_private.demo_party_benefit_redemptions set stripe_checkout_session_id=p_session_id,
    checkout_url=p_checkout_url,checkout_expires_at=p_expires_at,updated_at=now()
  where request_id=request_uuid and order_id=order_uuid and checkout_attempt_id=p_attempt_id and state='reserved';
  if not found then raise exception 'benefit_reservation_not_found'; end if;
end
$$;

create function public.scheduling_finalize_demo_party_order_benefits(
  p_order_id uuid,p_attempt_id uuid,p_event text
)
returns void
language plpgsql
security invoker
set search_path=pg_catalog,public,scheduling_private,checkout_private
as $$
declare redemption scheduling_private.demo_party_benefit_redemptions; benefit scheduling_private.demo_party_benefit_ledger;
begin
  if p_event not in ('paid','expired') then raise exception 'invalid_benefit_order_event'; end if;
  for redemption in select * from scheduling_private.demo_party_benefit_redemptions
    where order_id=p_order_id and checkout_attempt_id=p_attempt_id and state='reserved' for update
  loop
    if p_event='paid' then
      select * into benefit from scheduling_private.demo_party_benefit_ledger where request_id=redemption.request_id
        and benefit_type=redemption.benefit_type and source_key='party' for update;
      if benefit.consumed_cents+redemption.amount_cents>benefit.earned_cents then raise exception 'benefit_double_spend'; end if;
      update scheduling_private.demo_party_benefit_ledger set consumed_cents=consumed_cents+redemption.amount_cents,
        state=case when consumed_cents+redemption.amount_cents=earned_cents then 'consumed' else 'partially_consumed' end,
        linked_order_id=p_order_id,updated_at=now() where id=benefit.id;
      update scheduling_private.demo_party_benefit_redemptions set state='applied',applied_at=now(),updated_at=now() where id=redemption.id;
      insert into scheduling_private.demo_party_benefit_events(request_id,benefit_type,event_type,amount_cents,balance_after_cents,source,linked_order_id)
      values(redemption.request_id,redemption.benefit_type,'redeemed',redemption.amount_cents,
        benefit.earned_cents-benefit.consumed_cents-redemption.amount_cents,'paid_product_order',p_order_id);
    else
      update scheduling_private.demo_party_benefit_redemptions set checkout_attempt_id=null,stripe_checkout_session_id=null,
        checkout_url=null,checkout_expires_at=null,updated_at=now() where id=redemption.id;
    end if;
  end loop;
end
$$;

create function public.scheduling_link_demo_party_referral(
  p_guest_id uuid,p_order_reference text,p_reward jsonb
)
returns uuid
language plpgsql
security invoker
set search_path=pg_catalog,public,scheduling_private,checkout_private
as $$
declare guest scheduling_private.demo_party_guests; request_row public.demo_requests; order_row checkout_private.orders; referral_id uuid; tier_one_reward bigint;
begin
  select * into guest from scheduling_private.demo_party_guests where id=p_guest_id for update;
  if not found or guest.qualification_status<>'qualifying' then raise exception 'qualifying_guest_not_found'; end if;
  if not exists(
    select 1 from (
      select id from scheduling_private.demo_party_guests
      where request_id=guest.request_id and qualification_status='qualifying'
      order by qualification_verified_at,id
      limit 5
    ) qualifying_cap where qualifying_cap.id=guest.id
  ) then raise exception 'guest_outside_qualifying_cap'; end if;
  select * into request_row from public.demo_requests where id=guest.request_id for update;
  if request_row.appointment_type<>'demo' or request_row.demo_format<>'party'
    or request_row.status<>'approved'
    or request_row.payment_status not in ('paid','partially_refunded','refunded')
  then raise exception 'demo_party_referral_unavailable'; end if;
  select * into order_row from checkout_private.orders where public_reference=p_order_reference for update;
  if not found or order_row.payment_status<>'paid' or order_row.paid_at is null then raise exception 'paid_order_not_found'; end if;
  if lower(btrim(coalesce(order_row.customer_email,'')))<>guest.normalized_email then
    raise exception 'referral_guest_order_mismatch';
  end if;
  if coalesce(order_row.pricing_snapshot->>'purchaseMode','')='accessories' then raise exception 'accessory_order_not_referral_eligible'; end if;
  if order_row.paid_at<request_row.requested_start_at or order_row.paid_at>request_row.requested_start_at+interval '14 days' then raise exception 'outside_direct_purchase_window'; end if;
  if p_reward->>'product_id' is distinct from order_row.pricing_snapshot->'product'->>'id'
    or p_reward->>'product_slug_snapshot' is distinct from order_row.pricing_snapshot->'product'->>'slug'
    or p_reward->>'product_name_snapshot' is distinct from order_row.pricing_snapshot->'product'->>'name'
  then raise exception 'referral_reward_product_mismatch'; end if;
  tier_one_reward:=nullif(p_reward->>'tier_one_reward_cents','')::bigint;
  if tier_one_reward is null or not (
    (lower(order_row.pricing_snapshot->'product'->>'slug') like 'lymow%' and p_reward->>'qualifying_brand'='Lymow' and tier_one_reward=5000)
    or (lower(order_row.pricing_snapshot->'product'->>'slug') like 'yarbo%' and p_reward->>'qualifying_brand'='Yarbo' and tier_one_reward=10000)
    or (lower(order_row.pricing_snapshot->'product'->>'slug') like 'pandag%' and p_reward->>'qualifying_brand'='Pandag' and tier_one_reward=75000)
  ) then raise exception 'invalid_demo_party_tier_one_reward'; end if;
  insert into checkout_private.referrals(
    order_id,referrer_name,referrer_email,normalized_referrer_email,qualifying_brand,product_id,
    product_slug_snapshot,product_name_snapshot,base_reward_cents,higher_tier_reward_cents,
    schedule_version,status,purchase_date,return_period_ends_at,
    demo_party_request_id,demo_party_guest_id,demo_party_purchase_window_ends_at
  ) values(
    order_row.id,request_row.customer_name,lower(request_row.customer_email),lower(btrim(request_row.customer_email)),
    p_reward->>'qualifying_brand',(p_reward->>'product_id')::uuid,
    p_reward->>'product_slug_snapshot',p_reward->>'product_name_snapshot',
    tier_one_reward,tier_one_reward,
    p_reward->>'schedule_version','pending',order_row.paid_at,order_row.paid_at+interval '30 days',
    guest.request_id,guest.id,request_row.requested_start_at+interval '14 days'
  ) returning id into referral_id;
  insert into scheduling_private.demo_party_benefit_ledger
    (request_id,benefit_type,source_key,earned_cents,consumed_cents,state,linked_order_id)
  values(guest.request_id,'referral_reward','guest:'||guest.id::text,0,0,'pending',order_row.id);
  insert into scheduling_private.appointment_audit_events(request_id,event_type,actor_type,metadata)
  values(guest.request_id,'direct_referral_linked','admin',jsonb_build_object('guestId',guest.id,'orderId',order_row.id,'referralId',referral_id,'purchaseWindowDays',14,'returnPeriodDays',30,'rewardTier',1,'rewardCents',tier_one_reward));
  return referral_id;
end
$$;

-- Demo Party referrals are a fixed Tier 1 exception to the normal lifetime-tier
-- calculation. Normal referrals retain the existing first-five / higher-tier
-- behavior, while Demo Party qualification never reads the host's lifetime count.
create or replace function public.checkout_admin_list_referrals()
returns jsonb
language sql
security invoker
set search_path=pg_catalog,public,checkout_private
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,
    'referrerName',r.referrer_name,
    'referrerEmail',r.referrer_email,
    'orderIdentifier',o.public_reference,
    'brand',r.qualifying_brand,
    'productName',r.product_name_snapshot,
    'purchaseDate',r.purchase_date,
    'eligibleDate',r.return_period_ends_at,
    'status',r.status,
    'baseRewardCents',r.base_reward_cents,
    'higherTierRewardCents',r.higher_tier_reward_cents,
    'finalRewardCents',r.final_reward_cents,
    'tierApplied',r.tier_applied,
    'qualifiedAt',r.qualified_at,
    'paidAt',r.paid_at,
    'disqualifiedAt',r.disqualified_at,
    'disqualificationReason',r.disqualification_reason,
    'orderStatus',o.order_status,
    'paymentStatus',o.payment_status,
    'isDemoParty',r.demo_party_guest_id is not null
  ) order by
    case
      when r.status='pending' and r.return_period_ends_at<=now() then 0
      when r.status='qualified' then 1
      when r.status='pending' then 2
      when r.status='paid' then 3
      else 4
    end,
    r.purchase_date asc
  ),'[]'::jsonb)
  from checkout_private.referrals r
  join checkout_private.orders o on o.id=r.order_id
  where r.purchase_date is not null and r.return_period_ends_at is not null
$$;

create or replace function public.checkout_admin_mutate_referral(p_referral_id uuid,p_action text,p_reason text default null)
returns jsonb
language plpgsql
security invoker
set search_path=pg_catalog,public,checkout_private
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
  perform pg_advisory_xact_lock(hashtextextended(r.normalized_referrer_email,0));
  select * into o from checkout_private.orders where id=r.order_id for update;

  if p_action='qualify' then
    if r.status<>'pending' then raise exception 'Only pending referrals can be qualified.'; end if;
    if r.purchase_date is null or r.return_period_ends_at is null or o.paid_at is null or now()<r.return_period_ends_at then raise exception 'This referral cannot be qualified before its paid-based 30-day eligibility date.'; end if;
    if o.order_status<>'confirmed' or o.payment_status<>'paid' or o.refunded_cents<>0 then
      raise exception 'The associated order is not completed and fully paid, or it has been refunded.';
    end if;
    if r.demo_party_guest_id is not null then
      chosen_reward:=r.base_reward_cents;
      chosen_tier:='base';
    else
      if exists(
        select 1 from checkout_private.referrals earlier
        where earlier.normalized_referrer_email=r.normalized_referrer_email
          and (earlier.purchase_date,earlier.id)<(r.purchase_date,r.id) and earlier.status='pending'
      ) then
        raise exception 'Resolve this referrer''s earlier pending referral before qualifying this purchase so the reward tier can be calculated correctly.';
      end if;
      select count(*) into earlier_count from checkout_private.referrals earlier
      where earlier.normalized_referrer_email=r.normalized_referrer_email
        and (earlier.purchase_date,earlier.id)<(r.purchase_date,r.id) and earlier.status in ('qualified','paid');
      if earlier_count>=5 then chosen_reward:=r.higher_tier_reward_cents; chosen_tier:='higher';
      else chosen_reward:=r.base_reward_cents; chosen_tier:='base'; end if;
    end if;
    update checkout_private.referrals set status='qualified',final_reward_cents=chosen_reward,
      tier_applied=chosen_tier,qualified_at=now(),updated_at=now() where id=r.id;
    if r.demo_party_guest_id is not null then
      update scheduling_private.demo_party_benefit_ledger set earned_cents=chosen_reward,
        consumed_cents=0,state='earned',updated_at=now()
      where request_id=r.demo_party_request_id and benefit_type='referral_reward'
        and source_key='guest:'||r.demo_party_guest_id::text and linked_order_id=r.order_id;
      if not found then raise exception 'demo_party_referral_ledger_not_found'; end if;
    end if;
  elsif p_action='paid' then
    if r.status<>'qualified' or r.final_reward_cents is null or r.tier_applied is null then raise exception 'Only qualified referrals can be marked paid.'; end if;
    if o.order_status<>'confirmed' or o.payment_status<>'paid' or o.refunded_cents<>0 or o.paid_at is null then
      raise exception 'The associated order is no longer completed and fully paid or has been refunded. The referral cannot be marked paid.';
    end if;
    update checkout_private.referrals set status='paid',paid_at=now(),updated_at=now() where id=r.id;
    if r.demo_party_guest_id is not null then
      update scheduling_private.demo_party_benefit_ledger set consumed_cents=earned_cents,
        state='consumed',updated_at=now()
      where request_id=r.demo_party_request_id and benefit_type='referral_reward'
        and source_key='guest:'||r.demo_party_guest_id::text and linked_order_id=r.order_id;
      if not found then raise exception 'demo_party_referral_ledger_not_found'; end if;
    end if;
  elsif p_action='disqualify' then
    if r.status not in ('pending','qualified') then raise exception 'Only pending or qualified unpaid referrals can be disqualified.'; end if;
    if p_reason is null or length(btrim(p_reason))<1 or length(btrim(p_reason))>500 then raise exception 'A disqualification reason is required.'; end if;
    update checkout_private.referrals set status='disqualified',disqualified_at=now(),
      disqualification_reason=btrim(p_reason),qualified_at=null,final_reward_cents=null,
      tier_applied=null,updated_at=now() where id=r.id;
    if r.demo_party_guest_id is not null then
      update scheduling_private.demo_party_benefit_ledger set earned_cents=0,
        consumed_cents=0,state='voided',updated_at=now()
      where request_id=r.demo_party_request_id and benefit_type='referral_reward'
        and source_key='guest:'||r.demo_party_guest_id::text and linked_order_id=r.order_id;
      if not found then raise exception 'demo_party_referral_ledger_not_found'; end if;
    end if;
  elsif p_action='restore' then
    if r.status<>'disqualified' then raise exception 'Only disqualified referrals can be restored.'; end if;
    update checkout_private.referrals set status='pending',disqualified_at=null,
      disqualification_reason=null,qualified_at=null,final_reward_cents=null,
      tier_applied=null,updated_at=now() where id=r.id;
    if r.demo_party_guest_id is not null then
      update scheduling_private.demo_party_benefit_ledger set earned_cents=0,
        consumed_cents=0,state='pending',updated_at=now()
      where request_id=r.demo_party_request_id and benefit_type='referral_reward'
        and source_key='guest:'||r.demo_party_guest_id::text and linked_order_id=r.order_id;
      if not found then raise exception 'demo_party_referral_ledger_not_found'; end if;
    end if;
  else raise exception 'Unsupported referral action.';
  end if;
  return jsonb_build_object('id',r.id,'success',true);
end
$$;

-- PostgreSQL grants EXECUTE to PUBLIC on new functions by default. These RPCs
-- are deliberately callable only by the service-role server boundary.
revoke all on all functions in schema scheduling_private from public,anon,authenticated;
revoke all on function public.scheduling_create_demo_request(text,text,text,text,timestamptz,text,text,text,text,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.scheduling_transition_appointment(uuid,text,text) from public,anon,authenticated;
revoke all on function public.scheduling_set_portal_token(uuid,text) from public,anon,authenticated;
revoke all on function public.scheduling_revoke_portal_token(uuid) from public,anon,authenticated;
revoke all on function public.scheduling_add_demo_party_guest(text,text,text,text) from public,anon,authenticated;
revoke all on function public.scheduling_update_demo_party_guest(text,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.scheduling_delete_demo_party_guest(text,uuid) from public,anon,authenticated;
revoke all on function public.scheduling_admin_set_demo_party_lock(uuid,boolean,text) from public,anon,authenticated;
revoke all on function public.scheduling_admin_update_demo_party_guest(uuid,text,text,boolean) from public,anon,authenticated;
revoke all on function public.scheduling_admin_set_demo_party_food(uuid,text,text,integer) from public,anon,authenticated;
revoke all on function public.scheduling_prepare_demo_checkout(text) from public,anon,authenticated;
revoke all on function public.scheduling_link_demo_checkout(uuid,uuid,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.scheduling_apply_demo_payment(text,text,text) from public,anon,authenticated;
revoke all on function public.scheduling_expire_demo_checkout(text) from public,anon,authenticated;
revoke all on function public.scheduling_prepare_demo_refund(uuid) from public,anon,authenticated;
revoke all on function public.scheduling_finish_demo_refund(uuid,boolean,text,text) from public,anon,authenticated;
revoke all on function public.scheduling_reserve_demo_party_benefit(text,text,text,text) from public,anon,authenticated;
revoke all on function public.scheduling_set_demo_party_redemption_state(uuid,text) from public,anon,authenticated;
revoke all on function public.scheduling_reconcile_demo_refund(text,integer,text) from public,anon,authenticated;
revoke all on function public.scheduling_prepare_demo_party_benefit_checkout(text,text) from public,anon,authenticated;
revoke all on function public.scheduling_release_demo_party_order_reservations(text,text) from public,anon,authenticated;
revoke all on function public.scheduling_apply_demo_party_benefit_checkout(text,text,timestamptz,jsonb,integer,integer,integer,uuid,integer,uuid) from public,anon,authenticated;
revoke all on function public.scheduling_link_demo_party_benefit_checkout(text,uuid,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.scheduling_finalize_demo_party_order_benefits(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.scheduling_link_demo_party_referral(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.checkout_admin_list_referrals() from public,anon,authenticated;
revoke all on function public.checkout_admin_mutate_referral(uuid,text,text) from public,anon,authenticated;

grant execute on all functions in schema scheduling_private to service_role;
grant execute on function public.scheduling_create_demo_request(text,text,text,text,timestamptz,text,text,text,text,jsonb,uuid) to service_role;
grant execute on function public.scheduling_transition_appointment(uuid,text,text) to service_role;
grant execute on function public.scheduling_set_portal_token(uuid,text) to service_role;
grant execute on function public.scheduling_revoke_portal_token(uuid) to service_role;
grant execute on function public.scheduling_add_demo_party_guest(text,text,text,text) to service_role;
grant execute on function public.scheduling_update_demo_party_guest(text,uuid,text,text,text) to service_role;
grant execute on function public.scheduling_delete_demo_party_guest(text,uuid) to service_role;
grant execute on function public.scheduling_admin_set_demo_party_lock(uuid,boolean,text) to service_role;
grant execute on function public.scheduling_admin_update_demo_party_guest(uuid,text,text,boolean) to service_role;
grant execute on function public.scheduling_admin_set_demo_party_food(uuid,text,text,integer) to service_role;
grant execute on function public.scheduling_prepare_demo_checkout(text) to service_role;
grant execute on function public.scheduling_link_demo_checkout(uuid,uuid,text,text,timestamptz) to service_role;
grant execute on function public.scheduling_apply_demo_payment(text,text,text) to service_role;
grant execute on function public.scheduling_expire_demo_checkout(text) to service_role;
grant execute on function public.scheduling_prepare_demo_refund(uuid) to service_role;
grant execute on function public.scheduling_finish_demo_refund(uuid,boolean,text,text) to service_role;
grant execute on function public.scheduling_reserve_demo_party_benefit(text,text,text,text) to service_role;
grant execute on function public.scheduling_set_demo_party_redemption_state(uuid,text) to service_role;
grant execute on function public.scheduling_reconcile_demo_refund(text,integer,text) to service_role;
grant execute on function public.scheduling_prepare_demo_party_benefit_checkout(text,text) to service_role;
grant execute on function public.scheduling_release_demo_party_order_reservations(text,text) to service_role;
grant execute on function public.scheduling_apply_demo_party_benefit_checkout(text,text,timestamptz,jsonb,integer,integer,integer,uuid,integer,uuid) to service_role;
grant execute on function public.scheduling_link_demo_party_benefit_checkout(text,uuid,text,text,timestamptz) to service_role;
grant execute on function public.scheduling_finalize_demo_party_order_benefits(uuid,uuid,text) to service_role;
grant execute on function public.scheduling_link_demo_party_referral(uuid,text,jsonb) to service_role;
grant execute on function public.checkout_admin_list_referrals() to service_role;
grant execute on function public.checkout_admin_mutate_referral(uuid,text,text) to service_role;

commit;
