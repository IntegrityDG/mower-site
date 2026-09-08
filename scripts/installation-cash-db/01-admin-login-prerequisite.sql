-- Local fixture ONLY: exact existing admin-login rate-limit dependency. No dealer/catalog/storage data.
begin;
create schema if not exists dealer_network_private;
revoke all on schema dealer_network_private from public, anon, authenticated;
grant usage on schema dealer_network_private to service_role;

create table dealer_network_private.rate_limits (
  scope text not null check (char_length(scope) between 1 and 80),
  key_hash text not null check (char_length(key_hash) = 64),
  window_started_at timestamptz not null default now(),
  hit_count integer not null default 1 check (hit_count > 0),
  updated_at timestamptz not null default now(),
  primary key (scope, key_hash)
);

alter table dealer_network_private.rate_limits enable row level security;
alter table dealer_network_private.rate_limits force row level security;
revoke all on dealer_network_private.rate_limits from public,anon,authenticated,service_role;
grant select,insert,update on dealer_network_private.rate_limits to service_role;
create function public.dealer_network_consume_rate_limit(p_scope text, p_key_hash text, p_max_hits integer, p_window_seconds integer)
returns boolean language plpgsql security invoker set search_path=pg_catalog,public,dealer_network_private as $$
declare current_row dealer_network_private.rate_limits;
begin
  if p_max_hits < 1 or p_window_seconds < 1 then raise exception 'invalid_rate_limit'; end if;
  insert into dealer_network_private.rate_limits(scope,key_hash) values(p_scope,p_key_hash)
  on conflict(scope,key_hash) do update set
    hit_count=case when dealer_network_private.rate_limits.window_started_at <= now()-make_interval(secs=>p_window_seconds) then 1 else dealer_network_private.rate_limits.hit_count+1 end,
    window_started_at=case when dealer_network_private.rate_limits.window_started_at <= now()-make_interval(secs=>p_window_seconds) then now() else dealer_network_private.rate_limits.window_started_at end,
    updated_at=now()
  returning * into current_row;
  return current_row.hit_count <= p_max_hits;
end $$;

revoke all on function public.dealer_network_consume_rate_limit(text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.dealer_network_consume_rate_limit(text,text,integer,integer) to service_role;
commit;
