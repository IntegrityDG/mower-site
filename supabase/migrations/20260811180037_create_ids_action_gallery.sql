create table public.ids_action_entries (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  description text check (description is null or char_length(description) <= 2000),
  category text not null check (category in ('Equipment Demo','Customer Delivery','Installation / Deployment','Commercial Project','Service / Support','Event','Other')),
  location text check (location is null or char_length(location) <= 120),
  event_date date,
  featured boolean not null default false,
  published boolean not null default false,
  customer_permission_confirmed boolean not null default false,
  sort_order integer not null default 100 check (sort_order between 0 and 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ids_action_customer_permission check (
    not published or category not in ('Customer Delivery','Installation / Deployment') or customer_permission_confirmed
  )
);

create table public.ids_action_media (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.ids_action_entries(id) on delete cascade,
  media_type text not null check (media_type in ('image','video')),
  media_url text not null check (char_length(media_url) between 1 and 2000),
  storage_path text check (storage_path is null or char_length(storage_path) <= 500),
  thumbnail_url text check (thumbnail_url is null or char_length(thumbnail_url) <= 2000),
  alt_text text not null default '' check (char_length(alt_text) <= 200),
  sort_order integer not null default 100 check (sort_order between 0 and 100000),
  created_at timestamptz not null default now()
);

create index ids_action_entries_public_idx on public.ids_action_entries (featured desc, event_date desc nulls last, created_at desc) where published;
create index ids_action_media_entry_idx on public.ids_action_media (entry_id, sort_order, created_at);

alter table public.ids_action_entries enable row level security;
alter table public.ids_action_media enable row level security;
revoke all on public.ids_action_entries, public.ids_action_media from public, anon, authenticated;
grant select, insert, update, delete on public.ids_action_entries, public.ids_action_media to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ids-action-media', 'ids-action-media', true, 15728640, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
