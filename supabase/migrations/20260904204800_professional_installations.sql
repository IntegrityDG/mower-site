begin;

create table public.installation_pricing_settings (
  id boolean primary key default true check (id),
  labor_cents integer not null default 80000 check (labor_cents >= 0),
  materials_allowance_cents integer not null default 20000 check (materials_allowance_cents >= 0),
  deposit_cents integer not null default 25000 check (deposit_cents >= 0),
  included_labor_minutes integer not null default 240 check (included_labor_minutes >= 0),
  additional_labor_hourly_cents integer not null default 12500 check (additional_labor_hourly_cents >= 0),
  labor_increment_minutes integer not null default 15 check (labor_increment_minutes = 15),
  underground_per_segment_cents integer not null default 5000 check (underground_per_segment_cents >= 0),
  underground_segment_feet integer not null default 10 check (underground_segment_feet > 0),
  travel_hourly_cents integer not null default 0 check (travel_hourly_cents >= 0),
  balance_due_hours integer not null default 72 check (balance_due_hours = 72),
  invoice_lead_days integer not null default 7 check (invoice_lead_days >= 0),
  timezone text not null default 'America/Chicago' check (timezone = 'America/Chicago'),
  updated_at timestamptz not null default now()
);
insert into public.installation_pricing_settings(id) values(true);

create table public.installations (
  id uuid primary key default gen_random_uuid(),
  public_token uuid not null default gen_random_uuid() unique,
  customer_name text not null check (char_length(customer_name) between 1 and 160),
  customer_email text not null check (char_length(customer_email) between 3 and 320),
  customer_phone text not null check (char_length(customer_phone) between 7 and 80),
  property_address text not null check (char_length(property_address) between 5 and 500),
  equipment text check (equipment is null or char_length(equipment) <= 200),
  preferred_location text check (preferred_location is null or char_length(preferred_location) <= 1000),
  internet_availability text not null check (internet_availability in ('yes','no','unsure')),
  underground_requested boolean not null default false,
  estimated_underground_feet numeric(8,2) not null default 0 check (estimated_underground_feet >= 0),
  requested_start_at timestamptz not null,
  requested_end_at timestamptz not null,
  status text not null default 'requested' check (status in ('requested','approved','deposit_due','scheduled','balance_due','ready','in_progress','suspended','completed','declined','cancelled','terminated')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','deposit_paid','partially_paid','paid','refund_pending','partially_refunded','refunded','forfeited')),
  cash_status text not null default 'not_requested' check (cash_status in ('not_requested','requested','approved','denied','revoked')),
  special_cash_failure_reschedule boolean not null default false,
  reschedule_opportunity_used boolean not null default false,
  grounding_acknowledged_at timestamptz not null,
  responsibilities_acknowledged_at timestamptz not null,
  underground_acknowledged_at timestamptz,
  terms_version text not null default '2026-09-04',
  pricing_snapshot jsonb,
  deposit_due_cents integer check (deposit_due_cents is null or deposit_due_cents >= 0),
  balance_due_at timestamptz,
  approved_at timestamptz,
  completed_at timestamptz,
  admin_notes text check (admin_notes is null or char_length(admin_notes) <= 5000),
  idempotency_key uuid not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requested_start_at < requested_end_at),
  check (not underground_requested or underground_acknowledged_at is not null)
);
create index installations_admin_idx on public.installations(status,requested_start_at);
create index installations_customer_idx on public.installations(lower(customer_email),created_at desc);
alter table public.installations add constraint installations_no_overlap exclude using gist
  (tstzrange(requested_start_at,requested_end_at,'[)') with &&)
  where (status in ('requested','approved','deposit_due','scheduled','balance_due','ready','in_progress','suspended'));

create table public.installation_adjustments (
 id uuid primary key default gen_random_uuid(), installation_id uuid not null references public.installations(id) on delete restrict,
 kind text not null check(kind in ('underground_labor','travel_time','additional_labor','material','credit','other')),
 description text not null check(char_length(description) between 1 and 500), amount_cents integer not null,
 quantity numeric(10,2), unit text, created_by text not null, created_at timestamptz not null default now()
);
create table public.installation_work_sessions (
 id uuid primary key default gen_random_uuid(), installation_id uuid not null references public.installations(id) on delete restrict,
 technician text not null check(char_length(technician) between 1 and 160), started_at timestamptz not null,
 ended_at timestamptz, duration_minutes integer check(duration_minutes is null or duration_minutes >= 0),
 status text not null default 'running' check(status in ('running','paused','suspended','completed','corrected')),
 notes text check(notes is null or char_length(notes)<=2000), corrected_from_id uuid references public.installation_work_sessions(id), created_at timestamptz not null default now(),
 check ((status='running' and ended_at is null and duration_minutes is null) or (status<>'running' and ended_at is not null and duration_minutes is not null))
);
create unique index installation_one_running_session on public.installation_work_sessions(installation_id) where status='running';
create table public.installation_payments (
 id uuid primary key default gen_random_uuid(), installation_id uuid not null references public.installations(id) on delete restrict,
 purpose text not null check(purpose in ('deposit','balance','additional','cash','refund')),
 method text not null check(method in ('stripe','cash','manual_credit')),
 status text not null check(status in ('pending','paid','failed','cancelled','refunded','partially_refunded')),
 amount_cents integer not null check(amount_cents >= 0), refunded_cents integer not null default 0 check(refunded_cents >= 0 and refunded_cents <= amount_cents),
 stripe_session_id text unique, stripe_payment_intent_id text unique, idempotency_key text not null unique,
 notes text, created_at timestamptz not null default now(), paid_at timestamptz, updated_at timestamptz not null default now()
);
create table public.installation_audit_events (
 id bigint generated always as identity primary key, installation_id uuid not null references public.installations(id) on delete restrict,
 event_type text not null, actor text not null, details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);

create function public.ids_check_shared_schedule() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 perform pg_advisory_xact_lock(7242026);
 if tg_table_name='installations' then
  if new.status in ('requested','approved','deposit_due','scheduled','balance_due','ready','in_progress','suspended') and exists(select 1 from public.demo_requests d where d.status in ('pending','approved') and tstzrange(d.requested_start_at,d.requested_end_at,'[)') && tstzrange(new.requested_start_at,new.requested_end_at,'[)')) then raise exception 'slot_conflict'; end if;
 else
  if new.status in ('pending','approved') and exists(select 1 from public.installations i where i.status in ('requested','approved','deposit_due','scheduled','balance_due','ready','in_progress','suspended') and tstzrange(i.requested_start_at,i.requested_end_at,'[)') && tstzrange(new.requested_start_at,new.requested_end_at,'[)')) then raise exception 'slot_conflict'; end if;
 end if;
 return new;
end;$$;
create trigger installations_shared_schedule before insert or update of requested_start_at,requested_end_at,status on public.installations for each row execute function public.ids_check_shared_schedule();
create trigger demos_shared_schedule before insert or update of requested_start_at,requested_end_at,status on public.demo_requests for each row execute function public.ids_check_shared_schedule();

alter table public.installation_pricing_settings enable row level security;
alter table public.installations enable row level security;
alter table public.installation_adjustments enable row level security;
alter table public.installation_work_sessions enable row level security;
alter table public.installation_payments enable row level security;
alter table public.installation_audit_events enable row level security;
revoke all on table public.installation_pricing_settings,public.installations,public.installation_adjustments,public.installation_work_sessions,public.installation_payments,public.installation_audit_events from public,anon,authenticated,service_role;
grant select,insert,update,delete on table public.installation_pricing_settings,public.installations,public.installation_adjustments,public.installation_work_sessions,public.installation_payments,public.installation_audit_events to service_role;
grant usage,select on sequence public.installation_audit_events_id_seq to service_role;
revoke all on function public.ids_check_shared_schedule() from public,anon,authenticated;
grant execute on function public.ids_check_shared_schedule() to service_role;
commit;
