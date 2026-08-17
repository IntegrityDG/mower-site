-- Global IDS pricing-program control.
-- Defaults ON so applying this migration does not change current storefront
-- or checkout behavior until an IDS administrator explicitly disables it.

create table if not exists catalog_private.catalog_pricing_settings (
  id text primary key,
  everyday_low_price_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  check (id = 'default')
);

insert into catalog_private.catalog_pricing_settings (
  id,
  everyday_low_price_enabled
)
values ('default', true)
on conflict (id) do nothing;

alter table catalog_private.catalog_pricing_settings enable row level security;
alter table catalog_private.catalog_pricing_settings force row level security;

revoke all on catalog_private.catalog_pricing_settings from anon, authenticated;
