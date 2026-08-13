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

create table public.demo_notification_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.demo_requests(id) on delete restrict,
  event_type text not null check (event_type in ('ids_new_request','customer_approved','ids_calendar_invite','customer_denied')),
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  claimed_at timestamptz, sent_at timestamptz, last_error text check (last_error is null or char_length(last_error)<=100),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(request_id,event_type)
);

alter table public.demo_settings enable row level security;
alter table public.demo_availability_rules enable row level security;
alter table public.demo_availability_exceptions enable row level security;
alter table public.demo_requests enable row level security;
alter table public.demo_notification_events enable row level security;
revoke all on table public.demo_settings,public.demo_availability_rules,public.demo_availability_exceptions,public.demo_requests,public.demo_notification_events from public,anon,authenticated,service_role;
grant select,update on table public.demo_settings to service_role;
grant select,insert,update,delete on table public.demo_availability_rules,public.demo_availability_exceptions to service_role;
grant select,insert,update on table public.demo_requests,public.demo_notification_events to service_role;

create function public.demo_create_request(p_name text,p_email text,p_phone text,p_address text,p_start_at timestamptz,p_end_at timestamptz,p_source text,p_equipment_interest text,p_idempotency_key uuid)
returns uuid language plpgsql security invoker set search_path=pg_catalog,public as $$
declare v_id uuid;v_local timestamp;v_rule public.demo_availability_rules;v_settings public.demo_settings;
begin
 select * into v_settings from public.demo_settings where id=true;
 select id into v_id from public.demo_requests where idempotency_key=p_idempotency_key;
 if found then return v_id;end if;
 if p_end_at<>p_start_at+make_interval(mins=>v_settings.duration_minutes) or p_start_at<=now() or p_start_at>now()+make_interval(days=>v_settings.scheduling_horizon_days) then raise exception 'slot_unavailable';end if;
 v_local:=p_start_at at time zone v_settings.timezone;
 select * into v_rule from public.demo_availability_rules where weekday=extract(dow from v_local)::smallint and enabled;
 if not found or v_local::time<v_rule.start_time or (p_end_at at time zone v_settings.timezone)::date<>v_local::date or (p_end_at at time zone v_settings.timezone)::time>v_rule.end_time then raise exception 'slot_unavailable';end if;
 if exists(select 1 from public.demo_availability_exceptions where tstzrange(starts_at,ends_at,'[)')&&tstzrange(p_start_at,p_end_at,'[)')) then raise exception 'slot_unavailable';end if;
 if exists(select 1 from public.demo_requests where created_at>now()-interval '5 minutes' and idempotency_key<>p_idempotency_key and (lower(customer_email)=lower(p_email) or regexp_replace(customer_phone,'[^0-9]','','g')=regexp_replace(p_phone,'[^0-9]','','g'))) then raise exception 'request_throttled';end if;
 insert into public.demo_requests(customer_name,customer_email,customer_phone,property_address,requested_start_at,requested_end_at,source,equipment_interest,idempotency_key)
 values(p_name,p_email,p_phone,p_address,p_start_at,p_end_at,p_source,p_equipment_interest,p_idempotency_key)
 on conflict(idempotency_key) do update set idempotency_key=excluded.idempotency_key returning id into v_id;
 return v_id;
exception when exclusion_violation then raise exception 'slot_conflict';end;$$;

create function public.demo_transition_request(p_request_id uuid,p_action text,p_message text default null)
returns text language plpgsql security invoker set search_path=pg_catalog,public as $$
declare v_status text;
begin
 select status into v_status from public.demo_requests where id=p_request_id for update;
 if not found then raise exception 'request_not_found';end if;
 if p_action='approve' then
   if v_status='approved' then return 'unchanged';end if;
   if v_status<>'pending' then raise exception 'invalid_transition';end if;
   update public.demo_requests set status='approved',approved_at=now(),denied_at=null,cancelled_at=null,admin_message=null,updated_at=now() where id=p_request_id;
 elsif p_action='deny' then
   if v_status='denied' then return 'unchanged';end if;
   if v_status<>'pending' or nullif(btrim(p_message),'') is null then raise exception 'invalid_transition';end if;
   update public.demo_requests set status='denied',denied_at=now(),approved_at=null,cancelled_at=null,admin_message=left(btrim(p_message),2000),updated_at=now() where id=p_request_id;
 elsif p_action='cancel' then
   if v_status='cancelled' then return 'unchanged';end if;
   if v_status<>'approved' then raise exception 'invalid_transition';end if;
   update public.demo_requests set status='cancelled',cancelled_at=now(),approved_at=null,updated_at=now() where id=p_request_id;
 else raise exception 'invalid_action';end if;
 return 'changed';
end;$$;

create function public.demo_claim_notification(p_request_id uuid,p_event_type text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare e public.demo_notification_events;
begin
 insert into public.demo_notification_events(request_id,event_type,status,attempt_count,claimed_at) values(p_request_id,p_event_type,'pending',1,now()) on conflict(request_id,event_type) do nothing returning * into e;
 if found then return jsonb_build_object('claimed',true,'eventId',e.id,'claimedAt',e.claimed_at);end if;
 select * into e from public.demo_notification_events where request_id=p_request_id and event_type=p_event_type for update;
 if e.status='sent' then return jsonb_build_object('claimed',false,'eventId',e.id,'claimedAt',e.claimed_at);end if;
 if e.status='failed' or(e.status='pending' and e.claimed_at<now()-interval '10 minutes')then update public.demo_notification_events set status='pending',attempt_count=attempt_count+1,claimed_at=now(),last_error=null,updated_at=now() where id=e.id returning * into e;return jsonb_build_object('claimed',true,'eventId',e.id,'claimedAt',e.claimed_at);end if;
 return jsonb_build_object('claimed',false,'eventId',e.id,'claimedAt',e.claimed_at);
end;$$;
create function public.demo_finish_notification(p_event_id uuid,p_claimed_at timestamptz,p_status text,p_error text default null)
returns void language plpgsql security invoker set search_path=pg_catalog,public as $$ begin if p_status not in('sent','failed')then raise exception 'invalid_status';end if;update public.demo_notification_events set status=p_status,sent_at=case when p_status='sent' then now() else null end,last_error=case when p_status='failed' then left(coalesce(p_error,'SEND_FAILED'),100) else null end,updated_at=now() where id=p_event_id and status='pending' and claimed_at=p_claimed_at;if not found then raise exception 'stale_claim';end if;end;$$;

revoke all on function public.demo_create_request(text,text,text,text,timestamptz,timestamptz,text,text,uuid),public.demo_transition_request(uuid,text,text),public.demo_claim_notification(uuid,text),public.demo_finish_notification(uuid,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.demo_create_request(text,text,text,text,timestamptz,timestamptz,text,text,uuid),public.demo_transition_request(uuid,text,text),public.demo_claim_notification(uuid,text),public.demo_finish_notification(uuid,timestamptz,text,text) to service_role;
commit;
