begin;

-- All access is through authenticated Next.js server handlers and service-role
-- RPCs. No public/customer JWT can select these records or execute these RPCs.
create table public.service_staff (
  id uuid primary key default gen_random_uuid(), name text not null, email text not null,
  phone text not null, enabled boolean not null default true,
  can_collect_payments boolean not null default false, can_record_cash boolean not null default false,
  password_hash text, password_salt text, activation_hash text unique, activation_expires_at timestamptz,
  failed_attempts integer not null default 0, locked_until timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (length(trim(name)) between 1 and 200), check (length(email) between 3 and 254)
);
create unique index service_staff_email on public.service_staff(lower(email));
create table public.service_staff_sessions (
  token_hash text primary key, staff_id uuid not null references public.service_staff(id),
  expires_at timestamptz not null, created_at timestamptz not null default now()
);
create index service_staff_sessions_staff on public.service_staff_sessions(staff_id);

create table public.remote_support_subscriptions (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references checkout_private.customers(id),
  source text not null check(source in ('standalone','machine')), order_id uuid unique references checkout_private.orders(id),
  request_key uuid unique, request_fingerprint text,
  stripe_customer_id text, stripe_subscription_id text unique, stripe_checkout_session_id text unique,
  stripe_payment_method_id text, livemode boolean not null,
  status text not null default 'pending_payment' check(status in ('pending_payment','pending_activation','active','suspended','cancelled')),
  public_origin text,
  activation_at timestamptz, paid_through timestamptz, failed_at timestamptz, failed_invoice_id text,
  cancel_at_period_end boolean not null default false, cancelled_at timestamptz,
  manage_token_hash text not null unique, last_reconciled_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check(paid_through is null or activation_at < paid_through)
);
create index remote_support_customer on public.remote_support_subscriptions(customer_id);
create index remote_support_reconcile on public.remote_support_subscriptions(status,failed_at);
create table public.remote_support_cycles (
  id uuid primary key default gen_random_uuid(), subscription_id uuid not null references public.remote_support_subscriptions(id),
  stripe_invoice_id text not null unique, starts_at timestamptz not null, ends_at timestamptz not null,
  paid_at timestamptz not null, created_at timestamptz not null default now(),
  unique(subscription_id,starts_at), check(starts_at < ends_at)
);
create table public.service_cases (
  id uuid primary key default gen_random_uuid(), case_number text not null unique default ('IDS-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
  customer_id uuid not null references checkout_private.customers(id), subscription_id uuid references public.remote_support_subscriptions(id),
  kind text not null check(kind in ('included_support','remote_service','onsite_service','warranty')),
  requested_kind text check(requested_kind in ('remote_service','onsite_service')),
  status text not null default 'requested' check(status in ('requested','warranty_verification','warranty_not_covered_authorization_required','scheduled','active','waiting_manufacturer_parts','customer_controlled_hazard','resolved','cancelled')),
  customer_name text not null, customer_phone text not null, customer_email text,
  equipment jsonb not null default '{}'::jsonb, address text not null default '',
  issue_notes text not null, resolution_notes text not null default '',
  assigned_staff_id uuid references public.service_staff(id),
  warranty_status text not null default 'not_requested' check(warranty_status in ('not_requested','verification','verified','not_covered')),
  warranty_equipment_covered boolean, warranty_service_covered boolean, warranty_review_notes text not null default '',
  arrangement text not null check(arrangement in ('remote','shop_dropoff','onsite_ids_approved','onsite')),
  paid_authorized_at timestamptz, authorized_policy text, payment_method_id text,
  manage_token_hash text not null unique, request_key uuid not null unique, request_fingerprint text not null,
  started_at timestamptz, resolved_at timestamptz, version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (length(trim(customer_name)) between 1 and 200), check(length(issue_notes) between 1 and 8000),
  check (jsonb_typeof(equipment)='object'),
  check (kind <> 'included_support' or (status in ('requested','active','resolved','cancelled') and subscription_id is not null)),
  check (warranty_status <> 'verified' or (warranty_equipment_covered and warranty_service_covered)),
  check (kind <> 'warranty' or arrangement in ('remote','shop_dropoff','onsite_ids_approved'))
);
create index service_cases_assigned on public.service_cases(assigned_staff_id,status,created_at);
create index service_cases_customer on public.service_cases(customer_id);
create index service_cases_subscription on public.service_cases(subscription_id);
create table public.service_appointments (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references public.service_cases(id),
  staff_id uuid not null references public.service_staff(id), starts_at timestamptz not null, ends_at timestamptz not null,
  status text not null default 'scheduled' check(status in ('scheduled','paused','completed','cancelled','no_show')),
  cycle_id uuid references public.remote_support_cycles(id), session_number integer check(session_number between 1 and 4),
  created_at timestamptz not null default now(), check(starts_at < ends_at),
  check((cycle_id is null) = (session_number is null))
);
create index service_appointments_case on public.service_appointments(case_id);
create index service_appointments_staff_time on public.service_appointments(staff_id,starts_at,ends_at) where status in ('scheduled','paused');
create index service_appointments_cycle on public.service_appointments(cycle_id);
create table public.remote_support_sessions (
  cycle_id uuid not null references public.remote_support_cycles(id), number integer not null check(number between 1 and 4),
  status text not null default 'available' check(status in ('available','reserved','consumed')),
  case_id uuid references public.service_cases(id), appointment_id uuid references public.service_appointments(id),
  consumed_at timestamptz, consumed_by uuid references public.service_staff(id), reason text,
  primary key(cycle_id,number), check((status='consumed') = (consumed_at is not null))
);
create index remote_support_sessions_case on public.remote_support_sessions(case_id);
create index remote_support_sessions_appointment on public.remote_support_sessions(appointment_id);
create index remote_support_sessions_staff on public.remote_support_sessions(consumed_by);
create table public.remote_support_penalties (
  id uuid primary key default gen_random_uuid(), subscription_id uuid not null references public.remote_support_subscriptions(id),
  appointment_id uuid not null unique references public.service_appointments(id),
  after_cycle_id uuid not null references public.remote_support_cycles(id),
  applied_cycle_id uuid references public.remote_support_cycles(id), applied_number integer,
  created_at timestamptz not null default now(), applied_at timestamptz,
  check((applied_cycle_id is null) = (applied_at is null))
);
create index remote_support_pending_penalties on public.remote_support_penalties(subscription_id,created_at) where applied_at is null;
create index remote_support_penalty_cycle on public.remote_support_penalties(after_cycle_id);
create index remote_support_penalty_applied on public.remote_support_penalties(applied_cycle_id);
create table public.service_invoices (
  id uuid primary key default gen_random_uuid(), case_id uuid not null unique references public.service_cases(id),
  status text not null default 'draft' check(status in ('draft','submitted_for_master_review','finalized')),
  sheet jsonb not null default '{"diagnosis":"","workPerformed":"","testing":"","resolution":"","labor":[],"travel":[],"supplies":[],"holdNotes":"","authorizationNotes":"","manufacturerReimbursementCents":0}',
  pricing jsonb not null, totals jsonb, report_snapshot jsonb, subscriber_eligible boolean not null default false,
  payment_status text not null default 'not_due' check(payment_status in ('not_due','payment_due','processing','paid','paid_cash','refunded','partially_refunded','payment_review')),
  review_notes text not null default '', finalized_at timestamptz, finalized_by uuid references public.service_staff(id),
  version integer not null default 1, updated_at timestamptz not null default now(),
  check(jsonb_typeof(sheet)='object'), check(jsonb_typeof(pricing)='object')
);
create index service_invoice_finalized_by on public.service_invoices(finalized_by);
create table public.service_pricing_settings (
  id boolean primary key default true check(id),
  pricing jsonb not null default '{"firstHourCents":8000,"additionalHalfHourCents":4000,"initialTravelHalfHourCents":1750,"returnTravelHalfHourCents":500,"hazardTravelHalfHourCents":1750,"warrantyHourlyCents":8000}',
  version integer not null default 1
);
insert into public.service_pricing_settings(id) values(true);
create table public.service_case_events (
  id uuid primary key default gen_random_uuid(), case_id uuid references public.service_cases(id),
  subscription_id uuid references public.remote_support_subscriptions(id), actor_id uuid references public.service_staff(id),
  actor_name text not null, action text not null, details jsonb not null default '{}', created_at timestamptz not null default now()
);
create index service_events_case on public.service_case_events(case_id,created_at);
create index service_events_subscription on public.service_case_events(subscription_id,created_at);
create index service_events_actor on public.service_case_events(actor_id);
create table public.service_operations (
  operation_key uuid primary key, fingerprint text not null, result jsonb not null, created_at timestamptz not null default now()
);
create table public.service_attachments (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references public.service_cases(id),
  name text not null, storage_path text not null unique, uploaded_by uuid references public.service_staff(id),
  status text not null default 'pending' check(status in ('pending','ready','rejected')),
  content_type text not null check(content_type in ('image/jpeg','image/png','image/webp','image/heic','image/heif')),
  expected_bytes integer not null check(expected_bytes between 1 and 15728640),
  expires_at timestamptz not null default(now()+interval '2 hours'), created_at timestamptz not null default now()
);
create index service_attachments_case on public.service_attachments(case_id,status);
create index service_attachments_actor on public.service_attachments(uploaded_by);
create table public.service_payments (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references public.service_cases(id),
  invoice_id uuid references public.service_invoices(id), operation_key uuid not null unique,
  purpose text not null check(purpose in ('authorization','invoice')), method text not null check(method in ('setup','card','link','terminal','cash')),
  amount_cents bigint not null check(amount_cents>=0), currency text not null default 'usd' check(currency='usd'),
  status text not null default 'creating' check(status in ('creating','open','processing','succeeded','failed','expired','refunded')),
  stripe_customer_id text, stripe_session_id text unique, stripe_intent_id text unique,
  livemode boolean not null, actor_id uuid references public.service_staff(id), receipt_reference text, notes text,
  created_at timestamptz not null default now(), paid_at timestamptz
);
create index service_payments_case on public.service_payments(case_id);
create index service_payments_invoice on public.service_payments(invoice_id);
create index service_payments_actor on public.service_payments(actor_id);
create unique index service_one_pending_collection on public.service_payments(invoice_id)
  where purpose='invoice' and status in ('creating','open','processing','succeeded');
create table public.service_outbox (
  id uuid primary key default gen_random_uuid(), semantic_key text not null unique,
  kind text not null check(kind in ('warranty_report','staff_invitation','customer_link','subscription_reconcile','machine_subscription')),
  case_id uuid references public.service_cases(id), subscription_id uuid references public.remote_support_subscriptions(id),
  payload jsonb not null default '{}', status text not null default 'pending' check(status in ('pending','sending','sent','failed','needs_review')),
  attempts integer not null default 0, first_attempt_at timestamptz, leased_at timestamptz, available_at timestamptz not null default now(),
  sent_at timestamptz, last_error text, created_at timestamptz not null default now()
);
create index service_outbox_due on public.service_outbox(status,available_at);
create index service_outbox_case on public.service_outbox(case_id);
create index service_outbox_subscription on public.service_outbox(subscription_id);
create table public.service_webhook_events (
  event_id text primary key, event_type text not null, object_id text not null,
  created_at timestamptz not null default now(), processed_at timestamptz not null default now()
);
-- Provider-confirmed financial exceptions are retained separately from frozen
-- invoice totals and paid-cycle entitlements. Never automatically refund or
-- recollect a refunded/disputed invoice.
create table public.service_financial_reconciliations (
  stripe_object_id text primary key, payment_id uuid references public.service_payments(id),
  subscription_id uuid references public.remote_support_subscriptions(id),
  reason text not null, details jsonb not null, updated_at timestamptz not null default now(),
  check ((payment_id is null) <> (subscription_id is null))
);
create index service_financial_payment on public.service_financial_reconciliations(payment_id);
create index service_financial_subscription on public.service_financial_reconciliations(subscription_id);

-- Only cryptographically verified ownership may bind a Setup job to an existing
-- subscription customer. Email/phone/browser eligibility claims cannot do so.
create table public.service_installation_customers (
  installation_id uuid primary key references public.installations(id),
  customer_id uuid not null references checkout_private.customers(id), verified_at timestamptz not null default now()
);
create index service_installation_customer on public.service_installation_customers(customer_id);

do $$ declare t text; begin
  foreach t in array array['service_staff','service_staff_sessions','remote_support_subscriptions','remote_support_cycles','service_cases','service_appointments','remote_support_sessions','remote_support_penalties','service_invoices','service_pricing_settings','service_case_events','service_operations','service_attachments','service_payments','service_outbox','service_webhook_events','service_installation_customers','service_financial_reconciliations'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select,insert,update,delete on public.%I to service_role',t);
  end loop;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('ids-service-private','ids-service-private',false,15728640,array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict(id) do nothing;

create function public.ids_support_eligible(p_customer uuid,p_now timestamptz default now()) returns boolean
language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.remote_support_subscriptions s where s.customer_id=p_customer
    and s.status in ('active','pending_activation') and s.failed_at is null
    and s.activation_at<=p_now and s.paid_through>p_now);
$$;

create function public.ids_service_actor(p_actor uuid,p_master_only boolean default false) returns text
language plpgsql security invoker set search_path='' as $$
declare n text; begin
  -- NULL denotes the existing Master Admin, supplied only by the authenticated
  -- server DAL. Anonymous/authenticated database roles cannot execute this RPC.
  if p_actor is null then return 'Master Admin'; end if;
  select name into n from public.service_staff where id=p_actor and enabled for share;
  if n is null or p_master_only then raise exception 'service_forbidden' using errcode='42501'; end if;
  return n;
end; $$;

create function public.ids_service_case_access(p_actor uuid,p_case uuid) returns public.service_cases
language plpgsql security invoker set search_path='' as $$
declare c public.service_cases; begin
  perform public.ids_service_actor(p_actor);
  select * into c from public.service_cases where id=p_case for update;
  if c.id is null or (p_actor is not null and c.assigned_staff_id is distinct from p_actor) then
    raise exception 'service_forbidden' using errcode='42501';
  end if;
  return c;
end; $$;

-- Read access rechecks staff enablement/assignment on every request. This also
-- prevents a disabled staff member retaining access through a cached cookie.
create function public.ids_service_read(p_actor uuid,p_case uuid default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.service_cases; begin
  perform public.ids_service_actor(p_actor);
  if p_case is null then
    return jsonb_build_object('cases',coalesce((select jsonb_agg(to_jsonb(x)-array['manage_token_hash','request_fingerprint','request_key'] order by x.created_at desc) from (
      select job.*,i.status invoice_status,i.payment_status from public.service_cases job left join public.service_invoices i on i.case_id=job.id
      where p_actor is null or job.assigned_staff_id=p_actor order by job.created_at desc limit 500) x),'[]'::jsonb),
      'staff',case when p_actor is null then coalesce((select jsonb_agg(to_jsonb(s)-array['password_hash','password_salt','activation_hash','activation_expires_at','failed_attempts','locked_until']) from public.service_staff s),'[]'::jsonb) else '[]'::jsonb end,
      'subscriptions',case when p_actor is null then coalesce((select jsonb_agg(to_jsonb(s)-array['manage_token_hash','request_fingerprint','request_key']||jsonb_build_object('customer_name',cu.name)) from public.remote_support_subscriptions s join checkout_private.customers cu on cu.id=s.customer_id),'[]'::jsonb) else '[]'::jsonb end,
      'pricing',(select pricing from public.service_pricing_settings where id),
      'pricingVersion',(select version from public.service_pricing_settings where id),
      'financialReview',case when p_actor is null then coalesce((select jsonb_agg(to_jsonb(f) order by updated_at desc) from public.service_financial_reconciliations f),'[]'::jsonb) else '[]'::jsonb end,
      'outbox',case when p_actor is null then coalesce((select jsonb_agg(to_jsonb(j)) from (select id,kind,status,attempts,last_error from public.service_outbox where status<>'sent' order by created_at limit 100) j),'[]'::jsonb) else '[]'::jsonb end);
  end if;
  select * into c from public.service_cases where id=p_case;
  if c.id is null or (p_actor is not null and c.assigned_staff_id is distinct from p_actor) then raise exception 'service_forbidden' using errcode='42501'; end if;
  return jsonb_build_object('case',to_jsonb(c)-array['manage_token_hash','request_fingerprint','request_key'],
    'invoice',(select to_jsonb(i) from public.service_invoices i where case_id=c.id),
    'subscription',(select to_jsonb(s)-array['manage_token_hash','request_fingerprint','request_key'] from public.remote_support_subscriptions s where id=c.subscription_id),
    'appointments',coalesce((select jsonb_agg(to_jsonb(a) order by starts_at) from public.service_appointments a where case_id=c.id),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(to_jsonb(e) order by created_at) from public.service_case_events e where case_id=c.id),'[]'::jsonb),
    'attachments',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'status',status)) from public.service_attachments where case_id=c.id and status<>'rejected'),'[]'::jsonb),
    'sessions',coalesce((select jsonb_agg(to_jsonb(s) order by cy.starts_at,s.number) from public.remote_support_sessions s join public.remote_support_cycles cy on cy.id=s.cycle_id where cy.subscription_id=c.subscription_id),'[]'::jsonb));
end; $$;

create function public.ids_service_intake(p_key uuid,p_fingerprint text,p_token_hash text,p_data jsonb,p_verified_customer uuid default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare cid uuid; sid uuid; c public.service_cases; k text:=p_data->>'kind'; w text:=p_data->>'warranty'; begin
  perform pg_advisory_xact_lock(hashtextextended('service-intake:'||p_key,0));
  select * into c from public.service_cases where request_key=p_key;
  if c.id is not null then
    if c.request_fingerprint<>p_fingerprint then raise exception 'service_conflict'; end if;
    return jsonb_build_object('id',c.id,'caseNumber',c.case_number);
  end if;
  if k not in ('included_support','remote_service','onsite_service') or length(p_token_hash)<>64
    or length(trim(coalesce(p_data->>'name',''))) not between 1 and 200 or length(coalesce(p_data->>'issue','')) not between 1 and 8000 then raise exception 'service_invalid_intake'; end if;
  if k='included_support' then
    -- Contact lookup links the request to existing website records. It grants no
    -- usage or status change; only assigned staff can start an eligible session.
    select s.customer_id,s.id into cid,sid from public.remote_support_subscriptions s join checkout_private.customers cu on cu.id=s.customer_id
      where right(regexp_replace(cu.phone,'[^0-9]','','g'),10)=p_data->>'phone'
      order by public.ids_support_eligible(cu.id) desc,s.created_at desc limit 1;
    if sid is null then raise exception 'service_subscription_not_found'; end if;
  else
    if p_verified_customer is not null and exists(select 1 from public.remote_support_subscriptions where customer_id=p_verified_customer) then cid:=p_verified_customer;
    else insert into checkout_private.customers(name,email,normalized_email,phone) values(p_data->>'name',p_data->>'email',lower(p_data->>'email'),p_data->>'phone') returning id into cid; end if;
  end if;
  insert into public.service_cases(customer_id,subscription_id,kind,requested_kind,status,customer_name,customer_phone,customer_email,equipment,address,issue_notes,warranty_status,arrangement,manage_token_hash,request_key,request_fingerprint)
  values(cid,sid,case when k<>'included_support' and w in ('yes','unsure') then 'warranty' else k end,
    case when k<>'included_support' then k end,case when k<>'included_support' and w in ('yes','unsure') then 'warranty_verification' else 'requested' end,
    p_data->>'name',p_data->>'phone',p_data->>'email',coalesce(p_data->'equipment','{}'),coalesce(p_data->>'address',''),p_data->>'issue',
    case when k<>'included_support' and w in ('yes','unsure') then 'verification' else 'not_requested' end,
    case when k<>'included_support' and w in ('yes','unsure') then 'shop_dropoff' when k='onsite_service' then 'onsite' else 'remote' end,p_token_hash,p_key,p_fingerprint)
  returning * into c;
  if c.kind<>'included_support' then
    insert into public.service_invoices(case_id,pricing) select c.id,pricing from public.service_pricing_settings where id;
  end if;
  insert into public.service_case_events(case_id,actor_name,action,details) values(c.id,'Customer','requested',jsonb_build_object('warrantyAnswer',w));
  return jsonb_build_object('id',c.id,'caseNumber',c.case_number);
end; $$;

-- The subscription row is locked before cycle/session changes. Four numbered
-- slots are allocated per paid cycle; penalties are applied before availability.
create function public.ids_support_apply_penalties(p_subscription uuid,p_cycle uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare pen public.remote_support_penalties; n integer; begin
  perform 1 from public.remote_support_subscriptions where id=p_subscription for update;
  for pen in select p.* from public.remote_support_penalties p join public.remote_support_cycles old on old.id=p.after_cycle_id join public.remote_support_cycles fresh on fresh.id=p_cycle
    where p.subscription_id=p_subscription and p.applied_at is null and fresh.starts_at>old.starts_at order by p.created_at,p.id for update of p loop
    select number into n from public.remote_support_sessions where cycle_id=p_cycle and status='available' order by number limit 1 for update;
    if n is null then exit; end if;
    update public.remote_support_sessions set status='consumed',consumed_at=now(),reason='carried_no_show_penalty' where cycle_id=p_cycle and number=n;
    update public.remote_support_penalties set applied_cycle_id=p_cycle,applied_number=n,applied_at=now() where id=pen.id;
  end loop;
end; $$;

create function public.ids_support_active_cycle(p_subscription uuid,p_at timestamptz default now()) returns uuid
language plpgsql security invoker set search_path='' as $$
declare s public.remote_support_subscriptions; cy uuid; begin
  select * into s from public.remote_support_subscriptions where id=p_subscription for update;
  if s.id is null or s.status not in ('active','pending_activation') or s.failed_at is not null or s.activation_at is null or s.paid_through is null or s.activation_at>now() or s.paid_through<=now() then raise exception 'service_subscription_inactive'; end if;
  select id into cy from public.remote_support_cycles where subscription_id=s.id and starts_at<=p_at and ends_at>p_at order by starts_at desc limit 1;
  if cy is null then raise exception 'service_no_paid_cycle'; end if;
  perform public.ids_support_apply_penalties(s.id,cy);
  return cy;
end; $$;

create function public.ids_support_consume(p_subscription uuid,p_case uuid,p_actor uuid,p_appointment uuid default null,p_reason text default 'started') returns integer
language plpgsql security invoker set search_path='' as $$
declare cy uuid; slot public.remote_support_sessions; begin
  cy:=public.ids_support_active_cycle(p_subscription);
  if p_appointment is not null then
    select s.* into slot from public.remote_support_sessions s join public.service_appointments a on a.cycle_id=s.cycle_id and a.session_number=s.number
      join public.remote_support_cycles c on c.id=s.cycle_id
      where a.id=p_appointment and a.case_id=p_case and c.subscription_id=p_subscription for update of s;
  else
    select * into slot from public.remote_support_sessions where cycle_id=cy and case_id=p_case and status='reserved' order by number limit 1 for update;
    if slot.cycle_id is null then select * into slot from public.remote_support_sessions where cycle_id=cy and status='available' order by number limit 1 for update; end if;
  end if;
  if slot.cycle_id is null then raise exception 'service_sessions_exhausted'; end if;
  if slot.status='consumed' then return slot.number; end if;
  update public.remote_support_sessions set status='consumed',case_id=p_case,consumed_at=now(),consumed_by=p_actor,reason=p_reason where cycle_id=slot.cycle_id and number=slot.number;
  return slot.number;
end; $$;

-- Append-only audit history (including actor display name) survives disablement
-- and reassignment. Service-role clients also cannot edit historical records.
create function public.ids_service_immutable_history() returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception 'service_history_is_immutable'; end; $$;
create trigger service_history_immutable before update or delete on public.service_case_events for each row execute function public.ids_service_immutable_history();

-- Work-sheet totals are independently calculated in the transaction. Client
-- totals, discounts, rates and elapsed status durations are never authoritative.
create function public.ids_service_totals(p_sheet jsonb,p_pricing jsonb,p_remote boolean,p_warranty boolean,p_eligible boolean) returns jsonb
language plpgsql immutable security invoker set search_path='' as $$
declare l jsonb; mins numeric:=0; labor bigint; travel bigint:=0; parts bigint:=0; materials bigint:=0; consumables bigint:=0;
  amount bigint; quantity numeric; outbound integer; return_minutes integer; billable integer; blocks integer; rate bigint;
  initial_count integer:=0; trip_lines jsonb:='[]'; discount bigint; total bigint;
begin
  if jsonb_typeof(p_sheet->'labor')<>'array' or jsonb_typeof(p_sheet->'travel')<>'array' or jsonb_typeof(p_sheet->'supplies')<>'array'
    or jsonb_array_length(p_sheet->'labor')>200 or jsonb_array_length(p_sheet->'travel')>100 or jsonb_array_length(p_sheet->'supplies')>200 then raise exception 'service_invalid_sheet'; end if;
  for l in select value from jsonb_array_elements(p_sheet->'labor') loop
    quantity:=(l->>'minutes')::numeric;
    if quantity is null or quantity<>trunc(quantity) or quantity<1 or quantity>525600 then raise exception 'service_invalid_labor'; end if;
    mins:=mins+quantity;
  end loop;
  if mins>525600 then raise exception 'service_invalid_labor'; end if;
  labor:=case when p_warranty then round(mins*(p_pricing->>'warrantyHourlyCents')::bigint/60)
    when mins=0 then 0 else (p_pricing->>'firstHourCents')::bigint+ceil(greatest(0,mins-60)/30)*(p_pricing->>'additionalHalfHourCents')::bigint end;
  for l in select value from jsonb_array_elements(p_sheet->'travel') loop
    if p_remote then raise exception 'service_remote_has_no_travel'; end if;
    outbound:=(l->>'outboundMinutes')::integer; return_minutes:=(l->>'returnMinutes')::integer;
    if outbound is null or return_minutes is null or outbound<0 or return_minutes<0 or outbound>10080 or return_minutes>10080 then raise exception 'service_invalid_travel'; end if;
    if l->>'category'='initial' then
      initial_count:=initial_count+1; billable:=greatest(0,outbound-60)+greatest(0,return_minutes-60); rate:=(p_pricing->>'initialTravelHalfHourCents')::bigint;
    elsif l->>'category'='legitimate_return' then billable:=outbound+return_minutes; rate:=(p_pricing->>'returnTravelHalfHourCents')::bigint;
    elsif l->>'category'='hazard_return' then billable:=outbound+return_minutes; rate:=(p_pricing->>'hazardTravelHalfHourCents')::bigint;
    else raise exception 'service_invalid_trip_category'; end if;
    if initial_count>1 then raise exception 'service_duplicate_initial_trip'; end if;
    blocks:=ceil(billable::numeric/30); amount:=blocks*rate; travel:=travel+amount;
    trip_lines:=trip_lines||jsonb_build_array(jsonb_build_object('id',l->>'id','billableMinutes',billable,'blocks',blocks,'rateCents',rate,'amountCents',amount));
  end loop;
  for l in select value from jsonb_array_elements(p_sheet->'supplies') loop
    quantity:=(l->>'quantity')::numeric; rate:=(l->>'unitCents')::bigint;
    if quantity is null or quantity<=0 or quantity>10000 or quantity<>round(quantity,3) or rate is null or rate<0 or rate>10000000 then raise exception 'service_invalid_supply'; end if;
    amount:=round(quantity*rate);
    if l->>'kind'='part' then parts:=parts+amount;
    elsif l->>'kind'='material' then materials:=materials+amount;
    elsif l->>'kind'='consumable' then consumables:=consumables+amount;
    else raise exception 'service_invalid_supply_category'; end if;
  end loop;
  discount:=case when p_eligible and not p_warranty then round((labor+travel)*0.25) else 0 end;
  total:=labor+travel+parts+materials+consumables;
  if total>99999999 then raise exception 'service_invoice_limit'; end if;
  return jsonb_build_object('activeMinutes',mins,'additionalLaborBlocks',case when p_warranty then 0 else ceil(greatest(0,mins-60)/30) end,
    'laborCents',labor,'travelCents',travel,'travelLines',trip_lines,'eligibleSubtotalCents',labor+travel,'discountCents',discount,
    'partsCents',parts,'materialsCents',materials,'consumablesCents',consumables,'serviceValueCents',total,'customerDueCents',case when p_warranty then 0 else total-discount end);
end; $$;

create function public.ids_service_queue_warranty(p_case uuid) returns void
language sql security invoker set search_path='' as $$
  update public.service_invoices i set report_snapshot=jsonb_build_object('case',to_jsonb(c)-array['manage_token_hash','request_fingerprint'],
    'invoice',to_jsonb(i)-'report_snapshot','technicians',coalesce((select jsonb_object_agg(st.id::text,st.name) from public.service_staff st where st.id=c.assigned_staff_id or exists(select 1 from jsonb_array_elements(i.sheet->'labor') line where line->>'technicianId'=st.id::text)),'{}'::jsonb))
  from public.service_cases c where c.id=i.case_id and c.id=p_case and c.status='resolved' and c.warranty_status='verified' and i.status='finalized' and i.report_snapshot is null;
  insert into public.service_outbox(semantic_key,kind,case_id,payload)
  select 'warranty-final:'||i.id,'warranty_report',c.id,jsonb_build_object('invoiceId',i.id)
  from public.service_cases c join public.service_invoices i on i.case_id=c.id
  where c.id=p_case and c.status='resolved' and c.warranty_status='verified' and i.status='finalized'
  on conflict(semantic_key) do nothing;
$$;

create function public.ids_service_action(p_actor uuid,p_case uuid,p_action text,p_key uuid,p_version integer,p_data jsonb default '{}',p_customer_token_hash text default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.service_cases; i public.service_invoices; a public.service_appointments; s public.remote_support_sessions;
  actor_name text; fp text; previous public.service_operations; result jsonb; cy uuid; n integer;
  eligible boolean; computed_totals jsonb; aid uuid; staff uuid; starts timestamptz; ends timestamptz; notes text:=coalesce(p_data->>'notes','');
begin
  -- Same ordering as the existing shared IDS calendar, then the service ledger.
  perform pg_advisory_xact_lock(7242026);
  perform pg_advisory_xact_lock(8152026);
  actor_name:=public.ids_service_actor(p_actor);
  c:=public.ids_service_case_access(p_actor,p_case);
  if p_customer_token_hash is not null then
    if p_actor is not null or p_action<>'cancel_appointment' or c.manage_token_hash is distinct from p_customer_token_hash then raise exception 'service_forbidden' using errcode='42501'; end if;
    actor_name:='Customer';
  end if;
  fp:=md5(jsonb_build_object('actor',p_actor,'customer',p_customer_token_hash is not null,'case',p_case,'action',p_action,'data',p_data,'version',p_version)::text);
  select * into previous from public.service_operations where operation_key=p_key;
  if previous.operation_key is not null then
    if previous.fingerprint<>fp then raise exception 'service_idempotency_conflict'; end if;
    return previous.result;
  end if;
  if c.version<>p_version then raise exception 'service_version_conflict'; end if;
  select * into i from public.service_invoices where case_id=c.id for update;
  if p_action='assign' then
    perform public.ids_service_actor(p_actor,true);
    staff:=(p_data->>'staffId')::uuid;
    if not exists(select 1 from public.service_staff where id=staff and enabled) then raise exception 'service_invalid_staff'; end if;
    update public.service_cases set assigned_staff_id=staff where id=c.id;
    -- Appointment owner follows handoff only after checking their calendar.
    if exists(select 1 from public.service_appointments own join public.service_appointments other on other.staff_id=staff and other.id<>own.id and other.status in ('scheduled','paused') and tstzrange(own.starts_at,own.ends_at,'[)')&&tstzrange(other.starts_at,other.ends_at,'[)') where own.case_id=c.id and own.status in ('scheduled','paused')) then raise exception 'service_schedule_conflict'; end if;
    update public.service_appointments set staff_id=staff where case_id=c.id and status in ('scheduled','paused');
  elsif p_action='note' then
    if length(trim(notes)) not between 1 and 8000 then raise exception 'service_notes_required'; end if;
  elsif p_action='start_session' then
    if c.kind<>'included_support' or c.status not in ('requested','active') then raise exception 'service_invalid_transition'; end if;
    perform public.ids_support_active_cycle(c.subscription_id);
    if c.started_at is null then
      n:=public.ids_support_consume(c.subscription_id,c.id,p_actor);
      update public.service_cases set status='active',started_at=now() where id=c.id;
      update public.service_appointments set status='completed' where case_id=c.id and status='scheduled';
    end if;
  elsif p_action='resolve' then
    if length(trim(notes)) not between 1 and 8000 or c.status in ('cancelled','resolved','warranty_verification','warranty_not_covered_authorization_required') then raise exception 'service_resolution_required'; end if;
    if c.kind='included_support' then
      perform public.ids_support_active_cycle(c.subscription_id);
      if c.started_at is null then raise exception 'service_start_session_first'; end if;
    elsif c.started_at is null then raise exception 'service_work_not_started'; end if;
    update public.service_cases set status='resolved',resolution_notes=notes,resolved_at=coalesce(resolved_at,now()) where id=c.id;
    update public.service_appointments set status='completed' where case_id=c.id and status in ('scheduled','paused');
  elsif p_action='schedule' then
    perform public.ids_service_actor(p_actor,true);
    staff:=c.assigned_staff_id; starts:=(p_data->>'startsAt')::timestamptz; ends:=(p_data->>'endsAt')::timestamptz;
    if staff is null or not exists(select 1 from public.service_staff where id=staff and enabled) or starts is null or ends is null or starts<now() or ends<=starts or ends>starts+interval '12 hours'
      or c.status in ('cancelled','resolved','warranty_verification','warranty_not_covered_authorization_required') then raise exception 'service_invalid_schedule'; end if;
    if c.kind not in ('included_support','warranty') and (c.paid_authorized_at is null or c.payment_method_id is null) then raise exception 'service_payment_authorization_required'; end if;
    if c.kind='warranty' and c.warranty_status<>'verified' then raise exception 'service_warranty_verification_required'; end if;
    if exists(select 1 from public.service_appointments where staff_id=staff and status in ('scheduled','paused') and tstzrange(starts_at,ends_at,'[)')&&tstzrange(starts,ends,'[)')) then raise exception 'service_schedule_conflict'; end if;
    if c.kind='included_support' then
      cy:=public.ids_support_active_cycle(c.subscription_id,starts);
      -- An unresolved started issue retains its session across later visits.
      if c.started_at is null then
        if exists(select 1 from public.service_appointments where case_id=c.id and status in ('scheduled','paused')) then raise exception 'service_existing_appointment'; end if;
        select * into s from public.remote_support_sessions where cycle_id=cy and status='available' order by number limit 1 for update;
        if s.cycle_id is null then raise exception 'service_sessions_exhausted'; end if;
        n:=s.number;
      else
        select * into s from public.remote_support_sessions where case_id=c.id and status='consumed' and reason='started' order by consumed_at limit 1;
        if s.cycle_id is null then raise exception 'service_started_session_missing'; end if;
        cy:=s.cycle_id; n:=s.number;
      end if;
    end if;
    insert into public.service_appointments(case_id,staff_id,starts_at,ends_at,cycle_id,session_number) values(c.id,staff,starts,ends,cy,n) returning id into aid;
    if n is not null and c.started_at is null then update public.remote_support_sessions set status='reserved',case_id=c.id,appointment_id=aid where cycle_id=cy and number=n; end if;
    if c.kind<>'included_support' then update public.service_cases set status='scheduled' where id=c.id; end if;
  elsif p_action in ('cancel_appointment','no_show') then
    select * into a from public.service_appointments where id=(p_data->>'appointmentId')::uuid and case_id=c.id for update;
    if a.id is null then raise exception 'service_appointment_not_found'; end if;
    if a.status not in ('cancelled','no_show') then
      if a.status<>'scheduled' then raise exception 'service_appointment_unavailable'; end if;
      if p_action='no_show' and a.starts_at>now() then raise exception 'service_no_show_not_started'; end if;
      if c.kind='included_support' and a.session_number is not null then
        if p_action='no_show' or a.starts_at-now()<interval '24 hours' then
          n:=public.ids_support_consume(c.subscription_id,c.id,p_actor,a.id,p_action);
          if p_action='no_show' then
            cy:=public.ids_support_active_cycle(c.subscription_id);
            select * into s from public.remote_support_sessions where cycle_id=cy and status='available' order by number limit 1 for update;
            if s.cycle_id is not null then
              update public.remote_support_sessions set status='consumed',consumed_at=now(),consumed_by=p_actor,reason='no_show_penalty' where cycle_id=s.cycle_id and number=s.number;
            else
              insert into public.remote_support_penalties(subscription_id,appointment_id,after_cycle_id) values(c.subscription_id,a.id,cy) on conflict(appointment_id) do nothing;
              for cy in select fresh.id from public.remote_support_cycles fresh where fresh.subscription_id=c.subscription_id and fresh.starts_at>(select starts_at from public.remote_support_cycles where id=cy) order by fresh.starts_at loop
                perform public.ids_support_apply_penalties(c.subscription_id,cy);
              end loop;
            end if;
          end if;
        else
          update public.remote_support_sessions set status='available',case_id=null,appointment_id=null where appointment_id=a.id and status='reserved';
        end if;
      end if;
      update public.service_appointments set status=case when p_action='no_show' then 'no_show' else 'cancelled' end where id=a.id;
    end if;
  elsif p_action='begin_service' then
    if c.kind='included_support' or c.status not in ('requested','scheduled','active') then raise exception 'service_invalid_transition'; end if;
    if c.kind='warranty' then
      if c.warranty_status<>'verified' then raise exception 'service_warranty_verification_required'; end if;
    elsif c.paid_authorized_at is null or c.payment_method_id is null then raise exception 'service_payment_authorization_required'; end if;
    if length(trim(notes))=0 then raise exception 'service_actual_assistance_confirmation_required'; end if;
    update public.service_cases set status='active',started_at=coalesce(started_at,now()) where id=c.id;
  elsif p_action='hold' then
    if c.kind='included_support' or c.status<>'active' or p_data->>'reason' not in ('waiting_manufacturer_parts','customer_controlled_hazard') or length(trim(notes))=0 then raise exception 'service_invalid_hold'; end if;
    update public.service_cases set status=p_data->>'reason' where id=c.id;
  elsif p_action='resume' then
    if c.kind='included_support' or c.status not in ('waiting_manufacturer_parts','customer_controlled_hazard') or length(trim(notes))=0 then raise exception 'service_invalid_resume'; end if;
    update public.service_cases set status='active' where id=c.id;
  elsif p_action='warranty_review' then
    perform public.ids_service_actor(p_actor,true);
    if c.kind<>'warranty' or c.status not in ('warranty_verification','warranty_not_covered_authorization_required') or length(trim(notes))=0
      or jsonb_typeof(p_data->'equipmentCovered')<>'boolean' or jsonb_typeof(p_data->'serviceCovered')<>'boolean' then raise exception 'service_invalid_warranty_review'; end if;
    eligible:=(p_data->>'equipmentCovered')::boolean and (p_data->>'serviceCovered')::boolean;
    if p_data->>'arrangement' not in ('shop_dropoff','onsite_ids_approved','remote') then raise exception 'service_invalid_warranty_arrangement'; end if;
    update public.service_cases set warranty_equipment_covered=(p_data->>'equipmentCovered')::boolean,warranty_service_covered=(p_data->>'serviceCovered')::boolean,
      warranty_status=case when eligible then 'verified' else 'not_covered' end,warranty_review_notes=notes,
      status=case when eligible then 'requested' else 'warranty_not_covered_authorization_required' end,
      arrangement=p_data->>'arrangement' where id=c.id;
  elsif p_action in ('save_invoice','submit_invoice','return_invoice','finalize_invoice') then
    if i.id is null then raise exception 'service_no_invoice_for_included_support'; end if;
    if i.status='finalized' then raise exception 'service_final_invoice_immutable'; end if;
    if p_action in ('return_invoice','finalize_invoice') then perform public.ids_service_actor(p_actor,true); end if;
    if p_action='return_invoice' then
      if i.status<>'submitted_for_master_review' or length(trim(notes))=0 then raise exception 'service_review_notes_required'; end if;
      update public.service_invoices set status='draft',review_notes=notes,version=version+1,updated_at=now() where id=i.id;
    else
      if p_action='finalize_invoice' and i.status<>'submitted_for_master_review' then raise exception 'service_submit_invoice_first'; end if;
      if p_action<>'finalize_invoice' then
        if i.status<>'draft' then raise exception 'service_invoice_under_review'; end if;
        i.sheet:=p_data->'sheet';
      end if;
      if p_action<>'save_invoice' and (length(trim(coalesce(i.sheet->>'diagnosis','')))=0 or length(trim(coalesce(i.sheet->>'workPerformed','')))=0 or length(trim(coalesce(i.sheet->>'testing','')))=0 or length(trim(coalesce(i.sheet->>'resolution','')))=0) then raise exception 'service_complete_work_sheet_required'; end if;
      if c.kind='warranty' and c.warranty_status<>'verified' then raise exception 'service_warranty_verification_required'; end if;
      if c.arrangement='shop_dropoff' and jsonb_array_length(i.sheet->'travel')>0 then raise exception 'service_dropoff_has_no_travel'; end if;
      eligible:=public.ids_support_eligible(c.customer_id);
      computed_totals:=public.ids_service_totals(i.sheet,i.pricing,c.kind='remote_service' or c.arrangement='remote',c.warranty_status='verified',eligible);
      update public.service_invoices set sheet=i.sheet,totals=computed_totals,subscriber_eligible=eligible,
        status=case when p_action='save_invoice' then 'draft' when p_action='submit_invoice' then 'submitted_for_master_review' else 'finalized' end,
        payment_status=case when p_action='finalize_invoice' and (computed_totals->>'customerDueCents')::bigint>0 then 'payment_due' else payment_status end,
        finalized_at=case when p_action='finalize_invoice' then now() end,finalized_by=case when p_action='finalize_invoice' then p_actor end,
        version=version+1,updated_at=now() where id=i.id;
    end if;
  else raise exception 'service_unknown_action'; end if;
  update public.service_cases set version=version+1,updated_at=now() where id=c.id;
  insert into public.service_case_events(case_id,subscription_id,actor_id,actor_name,action,details) values(c.id,c.subscription_id,p_actor,actor_name,p_action,p_data);
  perform public.ids_service_queue_warranty(c.id);
  result:=jsonb_build_object('id',c.id,'version',c.version+1,'sessionNumber',n,'appointmentId',aid);
  insert into public.service_operations(operation_key,fingerprint,result) values(p_key,fp,result);
  return result;
end; $$;

create function public.ids_support_checkout_draft(p_key uuid,p_fingerprint text,p_token_hash text,p_customer jsonb,p_live boolean,p_order uuid default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s public.remote_support_subscriptions; cid uuid; o checkout_private.orders; begin
  perform pg_advisory_xact_lock(8152026);
  select * into s from public.remote_support_subscriptions where request_key=p_key or (p_order is not null and order_id=p_order);
  if s.id is not null then
    if s.request_fingerprint is distinct from p_fingerprint or s.livemode<>p_live then raise exception 'service_idempotency_conflict'; end if;
    return to_jsonb(s);
  end if;
  if length(p_token_hash)<>64 then raise exception 'service_invalid_token'; end if;
  if p_order is not null then
    select * into o from checkout_private.orders where id=p_order;
    if o.id is null or not coalesce((o.pricing_snapshot->'optionalServices'->>'remoteSupport')::boolean,false) then raise exception 'service_order_has_no_subscription'; end if;
    cid:=o.customer_id;
  else
    insert into checkout_private.customers(name,email,normalized_email,phone) values(p_customer->>'name',p_customer->>'email',lower(p_customer->>'email'),p_customer->>'phone') returning id into cid;
  end if;
  insert into public.remote_support_subscriptions(customer_id,source,order_id,request_key,request_fingerprint,livemode,manage_token_hash,public_origin)
  values(cid,case when p_order is null then 'standalone' else 'machine' end,p_order,p_key,p_fingerprint,p_live,p_token_hash,p_customer->>'origin') returning * into s;
  return to_jsonb(s);
end; $$;

-- Every canonical paid cycle is persisted once. The server validates Stripe
-- identity/mode/amount and fetches current remote state before this RPC.
create function public.ids_support_paid_cycle(p_subscription uuid,p_event text,p_invoice text,p_stripe_customer text,p_stripe_subscription text,p_payment_method text,p_live boolean,p_paid_at timestamptz,p_start timestamptz,p_end timestamptz) returns jsonb
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
  insert into public.remote_support_sessions(cycle_id,number) select cy,generate_series(1,4);
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

create function public.ids_support_state(p_subscription uuid,p_live boolean,p_stripe_subscription text,p_state text,p_invoice text,p_failed_at timestamptz,p_cancel_at_period_end boolean) returns void
language plpgsql security invoker set search_path='' as $$
declare s public.remote_support_subscriptions; begin
  perform pg_advisory_xact_lock(7242026); perform pg_advisory_xact_lock(8152026);
  select * into s from public.remote_support_subscriptions where id=p_subscription for update;
  if s.id is null or s.livemode<>p_live or s.stripe_subscription_id is distinct from p_stripe_subscription then raise exception 'service_subscription_identity_mismatch'; end if;
  if p_state='suspended' and not exists(select 1 from public.remote_support_cycles where stripe_invoice_id=p_invoice) and s.status<>'cancelled' then
    update public.remote_support_subscriptions set status='suspended',failed_at=coalesce(failed_at,p_failed_at),failed_invoice_id=p_invoice,updated_at=now() where id=s.id;
    update public.service_appointments a set status='paused' from public.service_cases c where c.id=a.case_id and c.subscription_id=s.id and a.status='scheduled';
  elsif p_state='cancelled' then
    update public.remote_support_subscriptions set status='cancelled',cancelled_at=coalesce(cancelled_at,now()),updated_at=now() where id=s.id;
    update public.service_appointments a set status='paused' from public.service_cases c where c.id=a.case_id and c.subscription_id=s.id and a.status='scheduled';
  elsif p_state not in ('active','pending_activation','suspended') then raise exception 'service_invalid_subscription_state'; end if;
  -- Active never clears an unpaid failure; only a paid invoice can restore it.
  update public.remote_support_subscriptions set cancel_at_period_end=p_cancel_at_period_end,last_reconciled_at=now() where id=s.id;
end; $$;

-- Scheduler-independent expiration: benefit checks use timestamps, while this
-- durable reconciliation queue guarantees remote cancellation/retry work.
create function public.ids_support_reconcile_due() returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
  perform pg_advisory_xact_lock(7242026); perform pg_advisory_xact_lock(8152026);
  update public.remote_support_subscriptions set status='active' where status='pending_activation' and activation_at<=now() and paid_through>now() and failed_at is null;
  update public.remote_support_subscriptions set status='cancelled',cancelled_at=coalesce(cancelled_at,now())
    where cancel_at_period_end and paid_through<=now() and status in ('active','pending_activation');
  update public.service_appointments a set status='paused' from public.service_cases c join public.remote_support_subscriptions s on s.id=c.subscription_id
    where a.case_id=c.id and a.status='scheduled' and (s.status in ('suspended','cancelled') or s.paid_through<=now());
  return coalesce((select jsonb_agg(to_jsonb(s)-'manage_token_hash' order by s.last_reconciled_at nulls first,s.created_at) from public.remote_support_subscriptions s
    where (s.status<>'pending_payment' or s.stripe_subscription_id is not null)
    and (s.last_reconciled_at is null or s.last_reconciled_at<now()-interval '5 minutes')),'[]'::jsonb);
end; $$;

create function public.ids_service_customer_action(p_token_hash text,p_action text,p_key uuid,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.service_cases; result jsonb; fp text; previous public.service_operations; begin
  perform pg_advisory_xact_lock(7242026); perform pg_advisory_xact_lock(8152026);
  select * into c from public.service_cases where manage_token_hash=p_token_hash for update;
  if c.id is null then raise exception 'service_forbidden' using errcode='42501'; end if;
  fp:=md5(jsonb_build_object('customer',c.id,'action',p_action,'data',p_data)::text);
  select * into previous from public.service_operations where operation_key=p_key;
  if previous.operation_key is not null then
    if previous.fingerprint<>fp then raise exception 'service_idempotency_conflict'; end if;
    return previous.result;
  end if;
  if p_action='authorize_paid' then
    if c.status<>'warranty_not_covered_authorization_required' or p_data->>'decision' not in ('proceed','cancel') then raise exception 'service_invalid_authorization'; end if;
    if p_data->>'decision'='proceed' then
      update public.service_cases set kind=requested_kind,status='requested',arrangement=case when requested_kind='remote_service' then 'remote' else 'onsite' end,version=version+1 where id=c.id;
    else update public.service_cases set status='cancelled',version=version+1 where id=c.id; end if;
  elsif p_action='cancel_appointment' then
    -- The shared cancellation rule runs only after token ownership is proven.
    result:=public.ids_service_action(null,c.id,'cancel_appointment',gen_random_uuid(),c.version,p_data,p_token_hash);
  else raise exception 'service_unknown_customer_action'; end if;
  if p_action<>'cancel_appointment' then insert into public.service_case_events(case_id,actor_name,action,details) values(c.id,'Customer',p_action,p_data); end if;
  result:=jsonb_build_object('id',c.id,'ok',true);
  insert into public.service_operations(operation_key,fingerprint,result) values(p_key,fp,result);
  return result;
end; $$;

-- Both independent private links are required. This stores an ownership link,
-- never an eligibility flag or a manually asserted subscription.
create function public.ids_support_bind_installation(p_support_hash text,p_installation_token uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare customer uuid; job uuid; prior uuid; begin
  perform pg_advisory_xact_lock(8152026);
  select customer_id into customer from public.remote_support_subscriptions where manage_token_hash=p_support_hash;
  select id into job from public.installations where public_token=p_installation_token;
  if customer is null or job is null then raise exception 'service_forbidden' using errcode='42501'; end if;
  select customer_id into prior from public.service_installation_customers where installation_id=job;
  if prior is not null and prior<>customer then raise exception 'service_customer_link_conflict'; end if;
  if prior is null then
    insert into public.service_installation_customers(installation_id,customer_id) values(job,customer);
    insert into public.service_case_events(actor_name,action,details) values('Customer','installation_ownership_linked',jsonb_build_object('installationId',job,'customerId',customer));
  end if;
  return jsonb_build_object('linked',true,'eligible',public.ids_support_eligible(customer));
end; $$;

-- Preserve the released equipment/ACH/referral functions. Add a fixed $100
-- service line atomically after their normal equipment-price validation.
create function public.ids_service_machine_checkout_draft(p_idempotency text,p_fingerprint text,p_key uuid,p_customer jsonb,p_snapshot jsonb,p_referral jsonb,p_live boolean,p_token_hash text,p_origin text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare base jsonb; result jsonb; o checkout_private.orders; item jsonb; amount bigint; sub jsonb; method text:=p_snapshot->>'paymentMethod'; services jsonb:=p_snapshot->'optionalServices'; begin
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency,8152026));
  if jsonb_typeof(services) is distinct from 'object' or (select count(*) from jsonb_object_keys(services))<>4
    or jsonb_typeof(services->'install') is distinct from 'boolean' or jsonb_typeof(services->'setup') is distinct from 'boolean'
    or jsonb_typeof(services->'remoteSupport') is distinct from 'boolean' or jsonb_typeof(services->'acceptedSupportTerms') is distinct from 'boolean'
    or p_snapshot->>'purchaseMode'='accessories' then raise exception 'service_invalid_optional_services'; end if;
  amount:=case when (services->>'remoteSupport')::boolean then 10000 else 0 end;
  if amount>0 and (method not in ('card','ach_debit') or not (services->>'acceptedSupportTerms')::boolean or length(trim(coalesce(p_customer->>'email','')))=0 or length(trim(coalesce(p_customer->>'phone','')))=0) then raise exception 'service_monthly_authorization_required'; end if;
  if (select count(*) from jsonb_array_elements(p_snapshot->'chargeableItems') x where x->>'itemType'='fee')<>(case when amount>0 then 1 else 0 end) then raise exception 'service_invalid_service_line'; end if;
  if amount>0 then
    select x into item from jsonb_array_elements(p_snapshot->'chargeableItems') x where x->>'itemType'='fee';
    if item->>'sourceId'<>'ids-remote-support-v1' or (item->>'quantity')::integer<>1 or (item->>'unitAmountCents')::bigint<>10000 or (item->>'extendedAmountCents')::bigint<>10000 or (item->>'includedInPackagePrice')::boolean then raise exception 'service_invalid_service_line'; end if;
  end if;
  base:=(p_snapshot-'optionalServices')||jsonb_build_object('subtotalCents',(p_snapshot->>'subtotalCents')::bigint-amount,'totalCents',(p_snapshot->>'totalCents')::bigint-amount,
    'chargeableItems',(select jsonb_agg(x) from jsonb_array_elements(p_snapshot->'chargeableItems') x where x->>'itemType'<>'fee'));
  if method='card' then result:=public.checkout_create_card_draft_with_referral(p_idempotency,p_fingerprint,p_customer,base,p_referral);
  elsif method='ach_debit' then result:=public.checkout_create_ach_draft_with_referral(p_idempotency,p_fingerprint,p_customer,base,p_referral);
  elsif method='wire_transfer' then result:=public.checkout_create_wire_draft_with_referral(p_idempotency,p_fingerprint,p_customer,base,p_referral);
  else raise exception 'service_invalid_payment_method'; end if;
  select * into o from checkout_private.orders where id=(result->>'orderId')::uuid for update;
  if o.pricing_snapshot ? 'optionalServices' then return result||jsonb_build_object('snapshot',o.pricing_snapshot); end if;
  if o.payment_status<>(case when method='wire_transfer' then 'awaiting_customer_funds' else 'unpaid' end) then raise exception 'service_order_already_paid'; end if;
  update checkout_private.orders set subtotal_cents=subtotal_cents+amount,total_cents=total_cents+amount,pricing_snapshot=p_snapshot where id=o.id;
  update checkout_private.payment_attempts set expected_amount_cents=expected_amount_cents+amount where id=(result->>'attemptId')::uuid;
  if amount>0 then
    insert into checkout_private.order_items(order_id,item_type,sku,name_snapshot,description_snapshot,quantity,unit_amount_cents,extended_amount_cents,included_in_package_price,metadata_snapshot)
    values(o.id,'fee','IDS-REMOTE-SUPPORT',item->>'name',item->>'description',1,10000,10000,false,jsonb_build_object('policy','ids-service-v1','service','remote_support'));
    sub:=public.ids_support_checkout_draft(p_key,p_fingerprint,p_token_hash,p_customer||jsonb_build_object('origin',p_origin),p_live,o.id);
  end if;
  return result||jsonb_build_object('snapshot',p_snapshot);
end; $$;

create function public.ids_service_machine_order(p_subscription uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('id',o.id,'status',o.payment_status,'paidAt',o.paid_at,'totalCents',o.total_cents,'currency',o.currency,
    'customerId',o.customer_id,'stripeCustomerId',cu.stripe_customer_id,'sessionId',a.stripe_checkout_session_id,'intentId',a.stripe_payment_intent_id,'snapshot',o.pricing_snapshot)
  from public.remote_support_subscriptions s join checkout_private.orders o on o.id=s.order_id join checkout_private.customers cu on cu.id=o.customer_id
  join checkout_private.payment_attempts a on a.order_id=o.id where s.id=p_subscription order by (a.attempt_status='succeeded') desc,a.attempt_number desc limit 1;
$$;
create function public.ids_service_machine_paid_queue() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.payment_status='paid' and coalesce((new.pricing_snapshot->'optionalServices'->>'remoteSupport')::boolean,false) then
    insert into public.service_outbox(semantic_key,kind,subscription_id)
    select 'support-recurring:'||s.id,'machine_subscription',s.id from public.remote_support_subscriptions s where s.order_id=new.id
    on conflict(semantic_key) do nothing;
  end if;
  return new;
end; $$;
create trigger ids_service_machine_payment after update of payment_status on checkout_private.orders for each row execute function public.ids_service_machine_paid_queue();

create function public.ids_service_attachment_reserve(p_actor uuid,p_case uuid,p_id uuid,p_name text,p_type text,p_bytes integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.service_cases; a public.service_attachments; begin
  perform pg_advisory_xact_lock(8152026); c:=public.ids_service_case_access(p_actor,p_case);
  select * into a from public.service_attachments where id=p_id;
  if a.id is not null then
    if a.case_id<>c.id or a.uploaded_by is distinct from p_actor or a.expected_bytes<>p_bytes or a.content_type<>p_type then raise exception 'service_idempotency_conflict'; end if;
    return to_jsonb(a);
  end if;
  update public.service_attachments set status='rejected' where case_id=c.id and status='pending' and expires_at<=now();
  if (select count(*) from public.service_attachments where case_id=c.id and status in ('pending','ready'))>=3 then raise exception 'service_attachment_limit'; end if;
  insert into public.service_attachments(id,case_id,name,storage_path,uploaded_by,content_type,expected_bytes)
    values(p_id,c.id,p_name,'pending/'||c.id||'/'||p_id,p_actor,p_type,p_bytes) returning * into a;
  return to_jsonb(a);
end; $$;

create function public.ids_service_attachment_finish(p_actor uuid,p_case uuid,p_id uuid,p_success boolean) returns void
language plpgsql security invoker set search_path='' as $$
declare c public.service_cases; a public.service_attachments; begin
  perform pg_advisory_xact_lock(8152026); c:=public.ids_service_case_access(p_actor,p_case);
  select * into a from public.service_attachments where id=p_id and case_id=c.id for update;
  if a.id is null or a.status='rejected' or (a.status='pending' and a.expires_at<=now()) then raise exception 'service_attachment_expired'; end if;
  if a.status='ready' then return; end if;
  update public.service_attachments set status=case when p_success then 'ready' else 'rejected' end,
    storage_path=case when p_success then 'ready/'||c.id||'/'||a.id||'.jpg' else storage_path end where id=a.id;
  insert into public.service_case_events(case_id,actor_id,actor_name,action,details) values(c.id,p_actor,public.ids_service_actor(p_actor),'attachment',jsonb_build_object('id',a.id,'accepted',p_success));
end; $$;

create function public.ids_service_outbox_claim(p_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare o public.service_outbox; begin
  select * into o from public.service_outbox where id=p_id for update;
  if o.id is null or o.status='sent' or o.available_at>now() or (o.status='sending' and o.leased_at>now()-interval '5 minutes') then return null; end if;
  if o.status='needs_review' then return null; end if;
  update public.service_outbox set status='sending',leased_at=now(),first_attempt_at=coalesce(first_attempt_at,now()),attempts=attempts+1 where id=o.id returning * into o;
  return to_jsonb(o);
end; $$;

create function public.ids_service_staff_login_failure(p_staff uuid) returns void
language sql security invoker set search_path='' as $$
  update public.service_staff set failed_attempts=failed_attempts+1,
    locked_until=case when failed_attempts+1>=10 then now()+interval '15 minutes' else locked_until end where id=p_staff;
$$;
create function public.ids_service_staff_session(p_staff uuid,p_hash text) returns void
language plpgsql security invoker set search_path='' as $$
begin
  perform 1 from public.service_staff where id=p_staff and enabled and (locked_until is null or locked_until<=now()) for update;
  if not found then raise exception 'service_forbidden' using errcode='42501'; end if;
  insert into public.service_staff_sessions(token_hash,staff_id,expires_at) values(p_hash,p_staff,now()+interval '12 hours');
  update public.service_staff set failed_attempts=0,locked_until=null where id=p_staff;
end; $$;
create function public.ids_service_staff_activate(p_token_hash text,p_password_hash text,p_password_salt text) returns void
language plpgsql security invoker set search_path='' as $$
declare staff uuid; begin
  select id into staff from public.service_staff where enabled and activation_hash=p_token_hash and activation_expires_at>now() for update;
  if staff is null then raise exception 'service_activation_invalid_or_expired'; end if;
  update public.service_staff set password_hash=p_password_hash,password_salt=p_password_salt,activation_hash=null,activation_expires_at=null,failed_attempts=0,locked_until=null where id=staff;
  delete from public.service_staff_sessions where staff_id=staff;
end; $$;

create function public.ids_service_manage_staff(p_actor uuid,p_key uuid,p_staff uuid,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s public.service_staff; fp text; previous public.service_operations; result jsonb; begin
  perform pg_advisory_xact_lock(8152026); perform public.ids_service_actor(p_actor,true);
  fp:=md5(jsonb_build_object('staff',p_staff,'data',p_data)::text);
  select * into previous from public.service_operations where operation_key=p_key;
  if previous.operation_key is not null then
    if previous.fingerprint<>fp then raise exception 'service_idempotency_conflict'; end if;
    return previous.result;
  end if;
  if p_staff is null then
    insert into public.service_staff(name,email,phone,activation_hash,activation_expires_at)
    values(p_data->>'name',lower(p_data->>'email'),p_data->>'phone',p_data->>'activationHash',now()+interval '48 hours') returning * into s;
  else
    select * into s from public.service_staff where id=p_staff for update;
    if s.id is null then raise exception 'service_staff_not_found'; end if;
    update public.service_staff set name=p_data->>'name',phone=p_data->>'phone',enabled=(p_data->>'enabled')::boolean,
      can_collect_payments=(p_data->>'canCollectPayments')::boolean,can_record_cash=(p_data->>'canRecordCash')::boolean,
      activation_hash=coalesce(p_data->>'activationHash',activation_hash),activation_expires_at=case when p_data->>'activationHash' is not null then now()+interval '48 hours' else activation_expires_at end,updated_at=now() where id=s.id returning * into s;
    if not s.enabled or p_data->>'activationHash' is not null then delete from public.service_staff_sessions where staff_id=s.id; end if;
  end if;
  insert into public.service_case_events(actor_name,action,details) values('Master Admin','staff_changed',jsonb_build_object('staffId',s.id,'name',s.name,'enabled',s.enabled,'canCollectPayments',s.can_collect_payments,'canRecordCash',s.can_record_cash));
  result:=jsonb_build_object('id',s.id);
  insert into public.service_operations(operation_key,fingerprint,result) values(p_key,fp,result);
  return result;
end; $$;

create function public.ids_service_payment_reserve(p_actor uuid,p_case uuid,p_key uuid,p_method text,p_live boolean,p_receipt text default null,p_notes text default null,p_customer_authorized boolean default false) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.service_cases; i public.service_invoices; p public.service_payments; actor_name text; staff public.service_staff; amount bigint; begin
  perform pg_advisory_xact_lock(8152026);
  actor_name:=public.ids_service_actor(p_actor); c:=public.ids_service_case_access(p_actor,p_case);
  if p_actor is not null then
    select * into staff from public.service_staff where id=p_actor;
    if (p_method='cash' and not staff.can_record_cash) or (p_method<>'cash' and not staff.can_collect_payments) then raise exception 'service_forbidden' using errcode='42501'; end if;
  end if;
  select * into p from public.service_payments where operation_key=p_key;
  if p.id is not null then
    if p.case_id<>c.id or p.method<>p_method or p.livemode<>p_live or p.actor_id is distinct from p_actor or p.receipt_reference is distinct from p_receipt or p.notes is distinct from p_notes then raise exception 'service_idempotency_conflict'; end if;
    return to_jsonb(p);
  end if;
  if p_method='setup' then
    if not p_customer_authorized or c.kind in ('included_support','warranty') or c.status in ('cancelled','warranty_not_covered_authorization_required') then raise exception 'service_customer_authorization_required'; end if;
    amount:=0;
  else
    select * into i from public.service_invoices where case_id=c.id for update;
    if i.id is null or i.status<>'finalized' or i.payment_status<>'payment_due' or (i.totals->>'customerDueCents')::bigint<=0 then raise exception 'service_finalized_unpaid_invoice_required'; end if;
    amount:=(i.totals->>'customerDueCents')::bigint;
    if exists(select 1 from public.service_payments where invoice_id=i.id and purpose='invoice' and status in ('creating','open','processing','succeeded')) then raise exception 'service_existing_payment_attempt'; end if;
  end if;
  if p_method='cash' and (length(trim(coalesce(p_receipt,'')))=0 or length(trim(coalesce(p_notes,'')))=0) then raise exception 'service_cash_receipt_required'; end if;
  insert into public.service_payments(case_id,invoice_id,operation_key,purpose,method,amount_cents,livemode,actor_id,receipt_reference,notes,status,paid_at)
  values(c.id,i.id,p_key,case when p_method='setup' then 'authorization' else 'invoice' end,p_method,amount,p_live,p_actor,p_receipt,p_notes,
    case when p_method='cash' then 'succeeded' else 'creating' end,case when p_method='cash' then now() end) returning * into p;
  if p_method='cash' then update public.service_invoices set payment_status='paid_cash' where id=i.id; end if;
  insert into public.service_case_events(case_id,actor_id,actor_name,action,details) values(c.id,p_actor,case when p_customer_authorized then 'Customer' else actor_name end,
    case when p_method='cash' then 'cash_recorded' else 'payment_requested' end,jsonb_build_object('paymentId',p.id,'method',p_method,'amountCents',amount,'receipt',p_receipt,'notes',p_notes));
  return to_jsonb(p);
end; $$;

create function public.ids_service_payment_apply(p_payment uuid,p_event text,p_status text,p_live boolean,p_customer text,p_intent text,p_session text,p_amount bigint,p_currency text,p_method text default null) returns void
language plpgsql security invoker set search_path='' as $$
declare p public.service_payments; c public.service_cases; i public.service_invoices; begin
  perform pg_advisory_xact_lock(8152026);
  select * into p from public.service_payments where id=p_payment for update;
  if p.id is null or p.livemode<>p_live or p.amount_cents<>p_amount or p.currency<>p_currency
    or (p.stripe_customer_id is not null and p.stripe_customer_id is distinct from p_customer)
    or (p.stripe_intent_id is not null and p.stripe_intent_id is distinct from p_intent)
    or (p.stripe_session_id is not null and p_session is not null and p.stripe_session_id<>p_session)
    or p.method='cash' or p_status not in ('open','processing','succeeded','failed','expired','refunded') then raise exception 'service_payment_identity_mismatch'; end if;
  if exists(select 1 from public.service_webhook_events where event_id=p_event) then return; end if;
  if p.status in ('succeeded','refunded') and p_status not in ('succeeded','refunded') then return; end if;
  if p.status in ('succeeded','expired','refunded') and p_status=p.status then
    insert into public.service_webhook_events(event_id,event_type,object_id) values(p_event,'service_payment_duplicate',coalesce(p_intent,p_session,p.id::text));
    return;
  end if;
  if p.status='refunded' and p_status='succeeded' then return; end if;
  select * into c from public.service_cases where id=p.case_id for update;
  if p.purpose='authorization' and p_status='succeeded' then
    if p_method is null or c.kind in ('included_support','warranty') then raise exception 'service_invalid_payment_authorization'; end if;
    update public.service_cases set payment_method_id=p_method,paid_authorized_at=now(),authorized_policy='ids-service-v1',version=version+1 where id=c.id;
    update checkout_private.customers set stripe_customer_id=coalesce(stripe_customer_id,p_customer) where id=c.customer_id;
  elsif p.purpose='invoice' then
    select * into i from public.service_invoices where id=p.invoice_id for update;
    if i.status<>'finalized' or (i.totals->>'customerDueCents')::bigint<>p_amount then raise exception 'service_invoice_payment_mismatch'; end if;
    if p_status='succeeded' and i.payment_status='paid_cash' then raise exception 'service_duplicate_collection_requires_review'; end if;
    if i.payment_status in ('paid','paid_cash','refunded') and p_status not in ('succeeded','refunded') then return; end if;
    update public.service_invoices set payment_status=case when p_status='succeeded' then 'paid' when p_status='processing' then 'processing' when p_status='refunded' then 'refunded' else 'payment_due' end where id=i.id;
  end if;
  update public.service_payments set status=p_status,stripe_customer_id=p_customer,stripe_intent_id=coalesce(p_intent,stripe_intent_id),stripe_session_id=coalesce(p_session,stripe_session_id),paid_at=case when p_status='succeeded' then coalesce(paid_at,now()) else paid_at end where id=p.id;
  insert into public.service_webhook_events(event_id,event_type,object_id) values(p_event,'service_payment',coalesce(p_intent,p_session,p.id::text));
  insert into public.service_case_events(case_id,actor_name,action,details) values(c.id,'Stripe','payment_'||p_status,jsonb_build_object('paymentId',p.id,'amountCents',p_amount));
end; $$;

create function public.ids_service_customer(p_case uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('id',cu.id,'name',cu.name,'email',cu.email,'stripe_customer_id',cu.stripe_customer_id)
  from checkout_private.customers cu join public.service_cases c on c.customer_id=cu.id where c.id=p_case;
$$;

create function public.ids_service_financial_reconcile(p_reference uuid,p_support boolean,p_object text,p_event text,p_live boolean,p_customer text,p_intent text,p_amount bigint,p_refunded bigint,p_review boolean,p_details jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare p public.service_payments; s public.remote_support_subscriptions; previous jsonb; begin
  perform pg_advisory_xact_lock(8152026);
  if p_refunded<0 or p_refunded>p_amount or p_amount<=0 then raise exception 'service_payment_identity_mismatch'; end if;
  if p_support then
    select * into s from public.remote_support_subscriptions where id=p_reference for update;
    if s.id is null or s.livemode<>p_live or s.stripe_customer_id is distinct from p_customer or p_amount<>10000 then raise exception 'service_payment_identity_mismatch'; end if;
  else
    select * into p from public.service_payments where id=p_reference for update;
    if p.id is null or p.purpose<>'invoice' or p.method='cash' or p.livemode<>p_live or p.stripe_customer_id is distinct from p_customer or p.stripe_intent_id is distinct from p_intent or p.amount_cents<>p_amount then raise exception 'service_payment_identity_mismatch'; end if;
    update public.service_invoices set payment_status=case when p_review then 'payment_review' when p_refunded=p_amount then 'refunded' when p_refunded>0 then 'partially_refunded' else 'paid' end where id=p.invoice_id;
    if p_refunded=p_amount then update public.service_payments set status='refunded' where id=p.id; end if;
  end if;
  select details into previous from public.service_financial_reconciliations where stripe_object_id=p_object;
  insert into public.service_financial_reconciliations(stripe_object_id,payment_id,subscription_id,reason,details)
    values(p_object,p.id,s.id,'stripe_financial_adjustment',p_details)
    on conflict(stripe_object_id) do update set details=excluded.details,updated_at=now();
  if previous is distinct from p_details then
    insert into public.service_case_events(case_id,subscription_id,actor_name,action,details)
      values(p.case_id,s.id,'Stripe','financial_adjustment',p_details);
  end if;
  insert into public.service_webhook_events(event_id,event_type,object_id) values(p_event,'financial_adjustment',p_object) on conflict(event_id) do nothing;
end; $$;
create function public.ids_service_customer_link(p_customer uuid,p_stripe_customer text) returns void
language plpgsql security invoker set search_path='' as $$
begin
  perform 1 from checkout_private.customers where id=p_customer and (stripe_customer_id is null or stripe_customer_id=p_stripe_customer) for update;
  if not found then raise exception 'service_customer_identity_mismatch'; end if;
  update checkout_private.customers set stripe_customer_id=p_stripe_customer,stripe_customer_created_at=coalesce(stripe_customer_created_at,now()) where id=p_customer;
end; $$;

create function public.ids_service_save_pricing(p_actor uuid,p_key uuid,p_version integer,p_pricing jsonb,p_reason text) returns void
language plpgsql security invoker set search_path='' as $$
declare v integer; prior jsonb; item record; begin
  perform pg_advisory_xact_lock(8152026); perform public.ids_service_actor(p_actor,true);
  if exists(select 1 from public.service_operations where operation_key=p_key and fingerprint=md5(p_pricing::text||p_reason)) then return; end if;
  select version,pricing into v,prior from public.service_pricing_settings where id for update;
  if v<>p_version or length(trim(p_reason))=0 or (select count(*) from jsonb_object_keys(p_pricing))<>6 then raise exception 'service_pricing_conflict'; end if;
  for item in select * from jsonb_each_text(p_pricing) loop
    if item.key not in ('firstHourCents','additionalHalfHourCents','initialTravelHalfHourCents','returnTravelHalfHourCents','hazardTravelHalfHourCents','warrantyHourlyCents') or item.value::numeric<>trunc(item.value::numeric) or item.value::numeric<0 or item.value::numeric>1000000 then raise exception 'service_invalid_pricing'; end if;
  end loop;
  update public.service_pricing_settings set pricing=p_pricing,version=version+1 where id;
  insert into public.service_case_events(actor_name,action,details) values('Master Admin','pricing_changed',jsonb_build_object('previous',prior,'pricing',p_pricing,'reason',p_reason));
  insert into public.service_operations(operation_key,fingerprint,result) values(p_key,md5(p_pricing::text||p_reason),'{}');
end; $$;

-- Physical on-site appointments share IDS field capacity with Demo/Installation;
-- remote work additionally uses the assigned technician's independent calendar.
create function public.ids_service_schedule_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
declare arrangement text; begin
  if new.status not in ('scheduled','paused') then return new; end if;
  if exists(select 1 from public.service_appointments a where a.id<>new.id and a.staff_id=new.staff_id and a.status in ('scheduled','paused') and tstzrange(a.starts_at,a.ends_at,'[)')&&tstzrange(new.starts_at,new.ends_at,'[)')) then raise exception 'service_schedule_conflict'; end if;
  select c.arrangement into arrangement from public.service_cases c where id=new.case_id;
  if arrangement in ('onsite','onsite_ids_approved') and (
    exists(select 1 from public.demo_requests where status in ('pending','approved') and tstzrange(requested_start_at,requested_end_at,'[)')&&tstzrange(new.starts_at,new.ends_at,'[)'))
    or exists(select 1 from public.installations where status in ('requested','approved','deposit_due','scheduled','balance_due','ready','in_progress','suspended') and tstzrange(requested_start_at,requested_end_at,'[)')&&tstzrange(new.starts_at,new.ends_at,'[)'))
    or exists(select 1 from public.demo_availability_exceptions where tstzrange(starts_at,ends_at,'[)')&&tstzrange(new.starts_at,new.ends_at,'[)'))
    or exists(select 1 from public.service_appointments a join public.service_cases c on c.id=a.case_id where a.id<>new.id and a.status in ('scheduled','paused') and c.arrangement in ('onsite','onsite_ids_approved') and tstzrange(a.starts_at,a.ends_at,'[)')&&tstzrange(new.starts_at,new.ends_at,'[)'))
  ) then raise exception 'service_schedule_conflict'; end if;
  return new;
end; $$;
create trigger service_schedule_statement_lock before insert or update or delete on public.service_appointments for each statement execute function public.ids_lock_shared_schedule();
create trigger service_schedule_available before insert or update of starts_at,ends_at,status,staff_id on public.service_appointments for each row execute function public.ids_service_schedule_guard();
create function public.ids_service_guard_other_schedule() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if (tg_table_name='demo_requests' and new.status not in ('pending','approved')) or (tg_table_name='installations' and new.status not in ('requested','approved','deposit_due','scheduled','balance_due','ready','in_progress','suspended')) then return new; end if;
  if exists(select 1 from public.service_appointments a join public.service_cases c on c.id=a.case_id where a.status in ('scheduled','paused') and c.arrangement in ('onsite','onsite_ids_approved') and tstzrange(a.starts_at,a.ends_at,'[)')&&tstzrange(new.requested_start_at,new.requested_end_at,'[)')) then raise exception 'service_schedule_conflict'; end if;
  return new;
end; $$;
create trigger demo_service_overlap before insert or update of requested_start_at,requested_end_at,status on public.demo_requests for each row execute function public.ids_service_guard_other_schedule();
create trigger installation_service_overlap before insert or update of requested_start_at,requested_end_at,status on public.installations for each row execute function public.ids_service_guard_other_schedule();

-- Restrict function execution explicitly; PostgreSQL otherwise grants PUBLIC.
-- Include occupied field Service time in the existing Installation slot list.
alter function public.ids_installation_slot_available(timestamptz,timestamptz,uuid,timestamptz) rename to ids_installation_slot_available_before_service;
create function public.ids_installation_slot_available(p_start timestamptz,p_end timestamptz,p_exclude uuid default null,p_now timestamptz default clock_timestamp()) returns boolean
language sql stable security invoker set search_path='' as $$
  select public.ids_installation_slot_available_before_service(p_start,p_end,p_exclude,p_now)
    and not exists(select 1 from public.service_appointments a join public.service_cases c on c.id=a.case_id
      where a.status in ('scheduled','paused') and c.arrangement in ('onsite','onsite_ids_approved')
      and tstzrange(a.starts_at,a.ends_at,'[)')&&tstzrange(p_start,p_end,'[)'));
$$;
revoke all on function public.ids_installation_slot_available(timestamptz,timestamptz,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.ids_installation_slot_available(timestamptz,timestamptz,uuid,timestamptz) to service_role;

create function public.ids_service_field_occupancy(p_start timestamptz,p_end timestamptz) returns table(requested_start_at timestamptz,requested_end_at timestamptz,status text)
language sql stable security invoker set search_path='' as $$
  select a.starts_at,a.ends_at,'scheduled'::text from public.service_appointments a join public.service_cases c on c.id=a.case_id
    where a.status in ('scheduled','paused') and c.arrangement in ('onsite','onsite_ids_approved') and a.starts_at<p_end and a.ends_at>p_start;
$$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'ids_service_%' or p.proname like 'ids_support_%') loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
commit;
