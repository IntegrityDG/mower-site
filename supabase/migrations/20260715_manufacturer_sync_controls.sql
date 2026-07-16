-- Review-only controls and run audit for manufacturer catalog monitoring.
alter table catalog_private.catalog_source_targets
  add column if not exists allow_automated_fetch boolean not null default false,
  add column if not exists allow_image_download boolean not null default false;

create table if not exists catalog_private.catalog_sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running' check (status in ('running', 'completed', 'completed_with_errors', 'failed')),
  products_checked integer not null default 0 check (products_checked >= 0),
  changes_detected integer not null default 0 check (changes_detected >= 0),
  errors_count integer not null default 0 check (errors_count >= 0),
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table catalog_private.catalog_sync_runs enable row level security;
revoke all on table catalog_private.catalog_sync_runs from anon, authenticated;
grant all on table catalog_private.catalog_sync_runs to service_role;

comment on column catalog_private.catalog_source_targets.allow_automated_fetch is 'Explicit IDS approval for server-side automated checks. False by default.';
comment on column catalog_private.catalog_source_targets.allow_image_download is 'Dealer-use permission for image download. Detection does not require or imply download.';
