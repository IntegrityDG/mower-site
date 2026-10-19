begin;

-- A single bounded document extends the existing primary Sales & Specials row.
-- Array order is message sequence; a save cannot leave orphan/partial messages.
create or replace function public.valid_homepage_sales_ticker(p_ticker jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = pg_catalog, public
as $$
declare
  item jsonb;
  key text;
  seen_ids text[] := array[]::text[];
  link text;
  start_time timestamptz;
  end_time timestamptz;
begin
  if jsonb_typeof(p_ticker) is distinct from 'object'
    or not (p_ticker ?& array['enabled','speed','backgroundColor','textColor','accentColor','pauseOnHover','messages'])
    or (p_ticker - array['enabled','speed','backgroundColor','textColor','accentColor','pauseOnHover','messages']) <> '{}'::jsonb
    or jsonb_typeof(p_ticker->'enabled') is distinct from 'boolean'
    or jsonb_typeof(p_ticker->'pauseOnHover') is distinct from 'boolean'
    or jsonb_typeof(p_ticker->'speed') is distinct from 'number'
    or (p_ticker->>'speed') !~ '^[0-9]{2,3}$'
    or (p_ticker->>'speed')::integer not between 20 and 120
    or jsonb_typeof(p_ticker->'messages') is distinct from 'array'
  then return false; end if;
  if jsonb_array_length(p_ticker->'messages') > 50 then return false; end if;
  foreach key in array array['backgroundColor','textColor','accentColor'] loop
    if jsonb_typeof(p_ticker->key) is distinct from 'string' or (p_ticker->>key) !~ '^#[0-9A-Fa-f]{6}$' then return false; end if;
  end loop;
  for item in select value from jsonb_array_elements(p_ticker->'messages') loop
    if jsonb_typeof(item) is distinct from 'object'
      or not (item ?& array['id','message','active','link','startsAt','endsAt'])
      or (item - array['id','message','active','link','startsAt','endsAt']) <> '{}'::jsonb
      or jsonb_typeof(item->'id') is distinct from 'string'
      or (item->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or lower(item->>'id') = any(seen_ids)
      or jsonb_typeof(item->'message') is distinct from 'string'
      or char_length(btrim(item->>'message')) not between 1 and 200
      or (item->>'message') ~ '[[:cntrl:]]'
      or jsonb_typeof(item->'active') is distinct from 'boolean'
    then return false; end if;
    seen_ids := array_append(seen_ids, lower(item->>'id'));
    if item->'link' <> 'null'::jsonb then
      link := item->>'link';
      if jsonb_typeof(item->'link') is distinct from 'string'
        or char_length(link) not between 1 and 2048
        or link ~ '[[:space:][:cntrl:]]' or strpos(link, chr(92)) > 0
        or not (link ~ '^/[^/]' or link = '/' or link ~* '^https?://[^/@?#]+([/?#]|$)')
      then return false; end if;
    end if;
    start_time := null;
    end_time := null;
    foreach key in array array['startsAt','endsAt'] loop
      if item->key <> 'null'::jsonb then
        -- The server normalizes explicit offsets (including Chicago DST) to UTC.
        if jsonb_typeof(item->key) is distinct from 'string'
          or (item->>key) !~ '^[2-9][0-9]{3}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
        then return false; end if;
        if key = 'startsAt' then start_time := (item->>key)::timestamptz;
        else end_time := (item->>key)::timestamptz; end if;
        if to_char((item->>key)::timestamptz at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') <> item->>key then return false; end if;
      end if;
    end loop;
    if start_time is not null and end_time is not null and end_time <= start_time then return false; end if;
  end loop;
  return true;
exception when others then
  return false;
end;
$$;

revoke all on function public.valid_homepage_sales_ticker(jsonb) from public, anon, authenticated;
grant execute on function public.valid_homepage_sales_ticker(jsonb) to service_role;

alter table public.homepage_sales_specials
  add column ticker jsonb not null default '{"enabled":false,"speed":50,"backgroundColor":"#0F172A","textColor":"#FFFFFF","accentColor":"#FACC15","pauseOnHover":true,"messages":[]}'::jsonb,
  add column ticker_revision bigint not null default 0,
  add column ticker_updated_at timestamptz,
  add column ticker_updated_by text,
  add constraint homepage_sales_ticker_valid check (public.valid_homepage_sales_ticker(ticker)),
  add constraint homepage_sales_ticker_revision_valid check (ticker_revision between 0 and 9007199254740991),
  add constraint homepage_sales_ticker_actor_valid check (ticker_updated_by is null or ticker_updated_by = 'IDS Administrator');

create or replace function public.save_homepage_sales_ticker(p_ticker jsonb, p_revision bigint)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  saved public.homepage_sales_specials;
  saved_at timestamptz := clock_timestamp();
begin
  if p_revision is null or p_revision not between 0 and 9007199254740990
    or not public.valid_homepage_sales_ticker(p_ticker)
  then raise exception 'Invalid homepage sales ticker settings' using errcode = '22023'; end if;

  update public.homepage_sales_specials
  set ticker = p_ticker,
      ticker_revision = ticker_revision + 1,
      ticker_updated_at = saved_at,
      ticker_updated_by = 'IDS Administrator',
      updated_at = saved_at
  where id = 'homepage' and ticker_revision = p_revision
  returning * into saved;
  if not found then return null; end if;
  return jsonb_build_object('ticker', saved.ticker, 'revision', saved.ticker_revision);
end;
$$;

-- Admin authentication remains in the existing server-only Admin API. No
-- browser role can read unpublished content or invoke the write function.
alter table public.homepage_sales_specials enable row level security;
revoke all on table public.homepage_sales_specials from public, anon, authenticated;
revoke all on function public.save_homepage_sales_ticker(jsonb,bigint) from public, anon, authenticated;
grant execute on function public.save_homepage_sales_ticker(jsonb,bigint) to service_role;

comment on column public.homepage_sales_specials.ticker is 'Homepage ticker settings and ordered messages. Disabled and empty until explicitly saved by Admin.';
comment on column public.homepage_sales_specials.ticker_updated_by is 'Shared IDS Administrator actor from the existing Admin password authentication model.';

commit;
