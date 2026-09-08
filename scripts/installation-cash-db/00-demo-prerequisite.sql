-- LOCAL TEST STRUCTURAL DEPENDENCIES ONLY. No historical data replay.
-- Exact relevant definitions extracted from the three immutable source files
-- recorded in schema-provenance.json. No catalog/order/payment history.
begin;

create extension if not exists btree_gist;

create table public.demo_settings (
  id boolean primary key default true check (id),
  timezone text not null default 'America/Chicago' check (timezone = 'America/Chicago'),
  duration_minutes integer not null default 60 check (duration_minutes = 60),
  scheduling_horizon_days integer not null default 90 check (scheduling_horizon_days between 7 and 180),
  updated_at timestamptz not null default now()
);
insert into public.demo_settings(id) values(true);

create table public.demo_availability_rules (
  id uuid primary key default gen_random_uuid(),
  weekday smallint not null unique check (weekday between 0 and 6),
  enabled boolean not null default false,
  start_time time not null default '09:00',
  end_time time not null default '16:00',
  updated_at timestamptz not null default now(),
  check (start_time < end_time)
);
insert into public.demo_availability_rules(weekday) select generate_series(0,6);

create table public.demo_availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  reason text check (reason is null or char_length(reason) <= 300),
  created_at timestamptz not null default now(),
  check (starts_at < ends_at)
);

create table public.demo_requests (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null check (char_length(customer_name) between 1 and 160),
  customer_email text not null check (char_length(customer_email) between 3 and 320),
  customer_phone text not null check (char_length(customer_phone) between 7 and 80),
  property_address text not null check (char_length(property_address) between 5 and 500),
  requested_start_at timestamptz not null,
  requested_end_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','approved','denied','cancelled')),
  source text not null check (source in ('featured_lymow','featured_yarbo','meet_or_beat','ids_in_action')),
  equipment_interest text check (equipment_interest is null or equipment_interest in ('Lymow One Plus','Yarbo Core')),
  admin_message text check (admin_message is null or char_length(admin_message) <= 2000),
  idempotency_key uuid not null unique,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  approved_at timestamptz, denied_at timestamptz, cancelled_at timestamptz,
  check (requested_start_at < requested_end_at),
  check ((status='approved')=(approved_at is not null)),
  check ((status='denied')=(denied_at is not null)),
  check ((status='cancelled')=(cancelled_at is not null))
);
alter table public.demo_requests add constraint demo_requests_no_overlap exclude using gist
  (tstzrange(requested_start_at,requested_end_at,'[)') with &&)
  where (status in ('pending','approved'));
create index demo_requests_admin_idx on public.demo_requests(status,requested_start_at);
create index demo_exceptions_range_idx on public.demo_availability_exceptions using gist(tstzrange(starts_at,ends_at,'[)'));

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

-- Demo appointments remain four customer-facing hours. This second exclusion
-- constraint reserves one additional operational hour only between active Demo
-- appointments; the existing raw-range constraint continues to govern every
-- appointment type without adding a buffer to other types or blackouts.
alter table public.demo_requests
  add constraint demo_requests_demo_buffer_no_overlap
  exclude using gist (
    tsrange(
      requested_start_at at time zone 'UTC',
      (requested_end_at at time zone 'UTC') + interval '1 hour',
      '[)'
    ) with &&
  )
  where (appointment_type='demo' and status in ('pending','approved'));

alter table public.demo_settings enable row level security;
alter table public.demo_availability_rules enable row level security;
alter table public.demo_availability_exceptions enable row level security;
alter table public.demo_requests enable row level security;
revoke all on public.demo_settings,public.demo_availability_rules,public.demo_availability_exceptions,public.demo_requests from public,anon,authenticated,service_role;
grant select,update on public.demo_settings to service_role;
grant select,insert,update,delete on public.demo_availability_rules,public.demo_availability_exceptions to service_role;
grant select,insert,update on public.demo_requests to service_role;
commit;
