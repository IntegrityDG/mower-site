-- Homepage creative scheduling is managed exclusively by authenticated server routes.
-- Public consumers receive a filtered DTO and an active-only image proxy, never table access.
create table public.homepage_slides (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 120),
  alt_text text not null check (length(btrim(alt_text)) between 1 and 500),
  button_label text check (button_label is null or length(btrim(button_label)) between 1 and 80),
  button_href text check (button_href is null or (length(button_href) between 1 and 1000 and (button_href = '/' or button_href ~ '^/[^/\\[:space:]]') and button_href !~ '[\\[:cntrl:]]')),
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  enabled boolean not null default false,
  sort_order integer not null default 100 check (sort_order between 0 and 100000),
  dwell_seconds integer not null default 8 check (dwell_seconds between 4 and 30),
  image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default clock_timestamp(),
  check ((button_label is null) = (button_href is null)),
  check (not enabled or image_path is not null),
  check (image_path is null or image_path ~ ('^slides/' || id::text || '/[0-9a-f-]{36}\.webp$'))
);
alter table public.homepage_slides enable row level security;
revoke all on public.homepage_slides from public, anon, authenticated;
grant all on public.homepage_slides to service_role;
create index homepage_slides_schedule_idx on public.homepage_slides (enabled, ends_at, starts_at, sort_order);

-- Match existing price-window semantics: inclusive start, exclusive end.
-- Calendar dates are Chicago wall dates, independently resolved across DST.
create function public.homepage_slides_dates() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.starts_at := (new.start_date + time '00:01') at time zone 'America/Chicago';
  new.ends_at := (new.end_date + time '23:59') at time zone 'America/Chicago';
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function public.homepage_slides_dates() from public, anon, authenticated;
grant execute on function public.homepage_slides_dates() to service_role;
create trigger homepage_slides_dates_before_write before insert or update on public.homepage_slides
for each row execute function public.homepage_slides_dates();

-- Raw signed uploads and verified renderable images share a PRIVATE bucket.
-- No anonymous/authenticated object policies are added. Signed upload URLs target
-- server-generated, unique paths; only decoded/re-encoded images are attached.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('homepage-slide-images', 'homepage-slide-images', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
