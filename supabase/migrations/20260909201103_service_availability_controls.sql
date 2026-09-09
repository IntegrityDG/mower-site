begin;

create table public.service_availability_settings (
  service_key text primary key check (service_key in (
    'professional_installation',
    'professional_setup',
    'new_remote_support_subscriptions',
    'existing_subscriber_assistance',
    'paid_remote_service',
    'onsite_service'
  )),
  status text not null default 'available' check (status in ('available','currently_unavailable')),
  public_message text not null default '' check (length(public_message) <= 500),
  changed_at timestamptz not null default now(),
  changed_by uuid references public.service_staff(id) on delete set null,
  changed_by_name text not null default 'System'
);

create table public.service_availability_events (
  id uuid primary key default gen_random_uuid(),
  operation_key uuid not null unique,
  service_key text not null references public.service_availability_settings(service_key),
  previous_status text not null check (previous_status in ('available','currently_unavailable')),
  status text not null check (status in ('available','currently_unavailable')),
  previous_public_message text not null,
  public_message text not null,
  changed_by uuid references public.service_staff(id) on delete set null,
  changed_by_name text not null,
  changed_at timestamptz not null default now()
);
create index service_availability_events_key_time on public.service_availability_events(service_key,changed_at desc);
create index service_availability_events_actor on public.service_availability_events(changed_by);

insert into public.service_availability_settings(service_key,status,public_message,changed_by_name) values
  ('professional_installation','available','','Initial production activation'),
  ('professional_setup','available','','Initial production activation'),
  ('new_remote_support_subscriptions','available','','Initial production activation'),
  ('existing_subscriber_assistance','available','','Initial production activation'),
  ('paid_remote_service','available','','Initial production activation'),
  ('onsite_service','available','','Initial production activation');

alter table public.service_availability_settings enable row level security;
alter table public.service_availability_settings force row level security;
alter table public.service_availability_events enable row level security;
alter table public.service_availability_events force row level security;
revoke all on public.service_availability_settings,public.service_availability_events from public,anon,authenticated;
grant select,insert,update,delete on public.service_availability_settings,public.service_availability_events to service_role;

create function public.ids_service_availability_settings_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if current_setting('ids.service_availability_update',true) is distinct from 'allowed' then
    raise exception 'service_availability_write_forbidden' using errcode='42501';
  end if;
  return new;
end; $$;
create trigger service_availability_settings_guard before update or delete on public.service_availability_settings
  for each row execute function public.ids_service_availability_settings_guard();
create trigger service_availability_history_immutable before update or delete on public.service_availability_events
  for each row execute function public.ids_service_immutable_history();

create function public.ids_service_set_availability(
  p_actor uuid,
  p_operation uuid,
  p_service_key text,
  p_status text,
  p_public_message text
) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  actor_name text;
  previous public.service_availability_settings;
  current_row public.service_availability_settings;
  prior_event public.service_availability_events;
  message text:=trim(coalesce(p_public_message,''));
begin
  perform pg_advisory_xact_lock(8152026);
  perform pg_advisory_xact_lock(hashtextextended('service-availability:'||coalesce(p_operation::text,''),0));
  actor_name:=public.ids_service_actor(p_actor,true);
  if p_operation is null or p_status not in ('available','currently_unavailable') or length(message)>500 then
    raise exception 'service_invalid_availability';
  end if;
  select * into prior_event from public.service_availability_events where operation_key=p_operation;
  if found then
    if prior_event.service_key<>p_service_key or prior_event.status<>p_status
      or prior_event.public_message<>message or prior_event.changed_by is distinct from p_actor then
      raise exception 'service_idempotency_conflict';
    end if;
    select * into strict current_row from public.service_availability_settings where service_key=p_service_key;
    return to_jsonb(current_row)||jsonb_build_object('changed',true,'replayed',true);
  end if;
  select * into previous from public.service_availability_settings where service_key=p_service_key for update;
  if previous.service_key is null then raise exception 'service_invalid_availability'; end if;
  if previous.status=p_status and previous.public_message=message then
    return to_jsonb(previous)||jsonb_build_object('changed',false,'replayed',false);
  end if;
  perform set_config('ids.service_availability_update','allowed',true);
  update public.service_availability_settings set status=p_status,public_message=message,
    changed_at=clock_timestamp(),changed_by=p_actor,changed_by_name=actor_name
    where service_key=p_service_key returning * into current_row;
  insert into public.service_availability_events(operation_key,service_key,previous_status,status,
    previous_public_message,public_message,changed_by,changed_by_name,changed_at)
  values(p_operation,p_service_key,previous.status,current_row.status,previous.public_message,
    current_row.public_message,p_actor,actor_name,current_row.changed_at);
  return to_jsonb(current_row)||jsonb_build_object('changed',true,'replayed',false);
end; $$;

create function public.ids_service_require_availability(p_service_key text) returns void
language plpgsql security invoker set search_path='' as $$
declare availability_status text;
begin
  perform pg_advisory_xact_lock(8152026);
  select status into availability_status from public.service_availability_settings
    where service_key=p_service_key for share;
  if availability_status is distinct from 'available' then
    raise exception 'service_currently_unavailable:%',coalesce(p_service_key,'unknown');
  end if;
end; $$;

create function public.ids_service_guard_new_availability() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_table_schema='public' and tg_table_name='installations' then
    perform public.ids_service_require_availability('professional_installation');
    if new.setup_selected then perform public.ids_service_require_availability('professional_setup'); end if;
  elsif tg_table_schema='public' and tg_table_name='remote_support_subscriptions' then
    perform public.ids_service_require_availability('new_remote_support_subscriptions');
  elsif tg_table_schema='public' and tg_table_name='service_cases' then
    if new.kind='included_support' then
      perform public.ids_service_require_availability('existing_subscriber_assistance');
    elsif new.kind='remote_service' then
      perform public.ids_service_require_availability('paid_remote_service');
    elsif new.kind='onsite_service' then
      perform public.ids_service_require_availability('onsite_service');
    end if;
  elsif tg_table_schema='checkout_private' and tg_table_name='orders'
    and not (old.pricing_snapshot ? 'optionalServices') and new.pricing_snapshot ? 'optionalServices' then
    if coalesce((new.pricing_snapshot->'optionalServices'->>'install')::boolean,false) then
      perform public.ids_service_require_availability('professional_installation');
    end if;
    if coalesce((new.pricing_snapshot->'optionalServices'->>'setup')::boolean,false) then
      perform public.ids_service_require_availability('professional_setup');
    end if;
    if coalesce((new.pricing_snapshot->'optionalServices'->>'remoteSupport')::boolean,false) then
      perform public.ids_service_require_availability('new_remote_support_subscriptions');
    end if;
  end if;
  return new;
end; $$;

create trigger installation_availability_guard before insert on public.installations
  for each row execute function public.ids_service_guard_new_availability();
create trigger support_subscription_availability_guard before insert on public.remote_support_subscriptions
  for each row execute function public.ids_service_guard_new_availability();
create trigger service_case_availability_guard before insert on public.service_cases
  for each row execute function public.ids_service_guard_new_availability();
create trigger machine_optional_service_availability_guard before update of pricing_snapshot on checkout_private.orders
  for each row when (new.pricing_snapshot is distinct from old.pricing_snapshot)
  execute function public.ids_service_guard_new_availability();

revoke all on function public.ids_service_availability_settings_guard(),public.ids_service_set_availability(uuid,uuid,text,text,text),
  public.ids_service_require_availability(text),public.ids_service_guard_new_availability() from public,anon,authenticated;
grant execute on function public.ids_service_availability_settings_guard(),public.ids_service_set_availability(uuid,uuid,text,text,text),
  public.ids_service_require_availability(text),public.ids_service_guard_new_availability() to service_role;

commit;
