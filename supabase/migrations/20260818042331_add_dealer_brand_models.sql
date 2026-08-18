alter table public.dealer_network_brands
  add column if not exists models text[] not null default '{}'::text[];

comment on column public.dealer_network_brands.models is
  'IDS-managed robotic mower models associated with this brand. Individual model names are limited to 30 characters by the admin API.';
