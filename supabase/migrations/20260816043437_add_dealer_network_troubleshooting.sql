create table public.dealer_network_troubleshooting_entries (
  id uuid primary key,
  member_id uuid not null references public.dealer_network_members(id) on delete restrict,
  member_name_snapshot text not null check (char_length(member_name_snapshot) between 1 and 160),
  company_name_snapshot text not null check (char_length(company_name_snapshot) between 1 and 180),
  title text not null check (char_length(title) between 3 and 180),
  brand text not null check (char_length(brand) between 1 and 120),
  model text not null check (char_length(model) between 1 and 160),
  issue_date date not null,
  firmware_software_version text not null check (char_length(firmware_software_version) between 1 and 160),
  system_area text not null check (char_length(system_area) between 1 and 160),
  bad_part text check (bad_part is null or char_length(bad_part) between 1 and 200),
  issue_description text not null check (char_length(issue_description) between 1 and 1000),
  fix_description text not null check (char_length(fix_description) between 1 and 1000),
  status text not null default 'pending' check (status in ('pending','approved','denied')),
  approved_at timestamptz,
  denied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  title_search tsvector generated always as (
    to_tsvector('english'::regconfig, coalesce(title, ''))
  ) stored,
  check ((status = 'approved') = (approved_at is not null)),
  check ((status = 'denied') = (denied_at is not null))
);

create index dealer_network_troubleshooting_status_idx
  on public.dealer_network_troubleshooting_entries (status, created_at desc);
create index dealer_network_troubleshooting_member_idx
  on public.dealer_network_troubleshooting_entries (member_id, created_at desc);
create index dealer_network_troubleshooting_title_search_idx
  on public.dealer_network_troubleshooting_entries using gin (title_search);

create table public.dealer_network_troubleshooting_photos (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.dealer_network_troubleshooting_entries(id) on delete restrict,
  photo_kind text not null check (photo_kind in ('issue','fix')),
  storage_path text not null unique,
  content_type text not null default 'image/jpeg' check (content_type = 'image/jpeg'),
  byte_size integer not null check (byte_size between 1 and 15728640),
  original_content_type text not null check (original_content_type in ('image/jpeg','image/png','image/webp','image/heic','image/heif')),
  original_byte_size integer not null check (original_byte_size between 1 and 15728640),
  width integer not null check (width between 1 and 2560),
  height integer not null check (height between 1 and 2560),
  position smallint not null check (position between 0 and 2),
  created_at timestamptz not null default now(),
  unique (entry_id, photo_kind, position),
  check (storage_path ~ '^entries/[0-9a-f-]+/[0-9a-f-]+/(issue|fix)/[0-9a-f-]+\.jpg$')
);

create index dealer_network_troubleshooting_photos_entry_idx
  on public.dealer_network_troubleshooting_photos (entry_id, photo_kind, position);

create table public.dealer_network_troubleshooting_uploads (
  id uuid primary key default gen_random_uuid(),
  owner_member_id uuid not null references public.dealer_network_members(id) on delete restrict,
  storage_path text not null unique,
  photo_kind text not null check (photo_kind in ('issue','fix')),
  position smallint not null check (position between 0 and 2),
  declared_content_type text not null check (declared_content_type in ('image/jpeg','image/png','image/webp','image/heic','image/heif')),
  declared_byte_size integer not null check (declared_byte_size between 1 and 15728640),
  status text not null default 'prepared' check (status in ('prepared','processing','consumed','failed','expired')),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (storage_path ~ '^staging/[0-9a-f-]+/[0-9a-f-]+$'),
  check ((status = 'consumed') = (consumed_at is not null))
);

create index dealer_network_troubleshooting_uploads_owner_idx
  on public.dealer_network_troubleshooting_uploads (owner_member_id, status, expires_at);
create index dealer_network_troubleshooting_uploads_expiry_idx
  on public.dealer_network_troubleshooting_uploads (status, expires_at);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'dealer_network_troubleshooting_entries',
    'dealer_network_troubleshooting_photos',
    'dealer_network_troubleshooting_uploads'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', table_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
  end loop;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'dealer-network-troubleshooting-private',
  'dealer-network-troubleshooting-private',
  false,
  15728640,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create function public.dealer_network_create_troubleshooting_entry(
  p_entry_id uuid,
  p_member_id uuid,
  p_title text,
  p_brand text,
  p_model text,
  p_issue_date date,
  p_firmware_software_version text,
  p_system_area text,
  p_bad_part text,
  p_issue_description text,
  p_fix_description text,
  p_photos jsonb
) returns uuid language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
  member public.dealer_network_members;
  photo jsonb;
  photo_total integer := coalesce(jsonb_array_length(coalesce(p_photos, '[]'::jsonb)), 0);
  issue_photo_total integer;
  fix_photo_total integer;
begin
  select * into member from public.dealer_network_members
  where id=p_member_id and status='active' and account_locked=false;
  if not found then raise exception 'member_unavailable'; end if;

  if p_entry_id is null
    or char_length(btrim(coalesce(p_title, ''))) not between 3 and 180
    or char_length(btrim(coalesce(p_brand, ''))) not between 1 and 120
    or char_length(btrim(coalesce(p_model, ''))) not between 1 and 160
    or p_issue_date is null or p_issue_date > current_date
    or char_length(btrim(coalesce(p_firmware_software_version, ''))) not between 1 and 160
    or char_length(btrim(coalesce(p_system_area, ''))) not between 1 and 160
    or char_length(btrim(coalesce(p_bad_part, ''))) > 200
    or char_length(btrim(coalesce(p_issue_description, ''))) not between 1 and 1000
    or char_length(btrim(coalesce(p_fix_description, ''))) not between 1 and 1000
    or photo_total > 6
  then raise exception 'invalid_troubleshooting_entry'; end if;

  select count(*) filter (where value->>'photoKind'='issue'),
         count(*) filter (where value->>'photoKind'='fix')
  into issue_photo_total,fix_photo_total
  from jsonb_array_elements(coalesce(p_photos, '[]'::jsonb));
  if issue_photo_total > 3 or fix_photo_total > 3
    or issue_photo_total + fix_photo_total <> photo_total
  then raise exception 'invalid_troubleshooting_photos'; end if;

  insert into public.dealer_network_troubleshooting_entries(
    id,member_id,member_name_snapshot,company_name_snapshot,title,brand,model,
    issue_date,firmware_software_version,system_area,bad_part,
    issue_description,fix_description
  ) values(
    p_entry_id,p_member_id,member.member_name,member.company_name,
    btrim(p_title),btrim(p_brand),btrim(p_model),p_issue_date,
    btrim(p_firmware_software_version),btrim(p_system_area),
    nullif(btrim(coalesce(p_bad_part, '')), ''),
    btrim(p_issue_description),btrim(p_fix_description)
  );

  for photo in select value from jsonb_array_elements(coalesce(p_photos, '[]'::jsonb)) loop
    if photo->>'storagePath' not like
      'entries/'||p_member_id::text||'/'||p_entry_id::text||'/'||(photo->>'photoKind')||'/%'
    then raise exception 'invalid_troubleshooting_photo_path'; end if;
    insert into public.dealer_network_troubleshooting_photos(
      entry_id,photo_kind,storage_path,content_type,byte_size,
      original_content_type,original_byte_size,width,height,position
    ) values(
      p_entry_id,photo->>'photoKind',photo->>'storagePath',photo->>'contentType',
      (photo->>'byteSize')::integer,photo->>'originalContentType',
      (photo->>'originalByteSize')::integer,(photo->>'width')::integer,
      (photo->>'height')::integer,(photo->>'position')::smallint
    );
  end loop;
  return p_entry_id;
end $$;

revoke all on function public.dealer_network_create_troubleshooting_entry(
  uuid,uuid,text,text,text,date,text,text,text,text,text,jsonb
) from public,anon,authenticated;
grant execute on function public.dealer_network_create_troubleshooting_entry(
  uuid,uuid,text,text,text,date,text,text,text,text,text,jsonb
) to service_role;
