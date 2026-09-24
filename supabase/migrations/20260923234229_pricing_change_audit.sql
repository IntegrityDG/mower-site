-- Private, append-only history for every authoritative pricing-row mutation.
-- Effective customer price is intentionally resolved by the shared application
-- policy at read time: schedules and the global pricing program can change it
-- independently of a target row, so storing a duplicated result here would drift.

create table catalog_private.catalog_pricing_change_audit (
  id bigint generated always as identity primary key,
  target_kind text not null,
  target_id text not null,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  before_values jsonb,
  after_values jsonb,
  changed_fields text[] not null default '{}',
  actor text not null default 'server-side catalog mutation',
  created_at timestamptz not null default now()
);

comment on table catalog_private.catalog_pricing_change_audit is
  'Private append-only row history for catalog price authorities. Effective customer and checkout prices are re-resolved by shared application policy.';

create index catalog_pricing_change_audit_target_idx
  on catalog_private.catalog_pricing_change_audit (target_kind, target_id, created_at desc);

alter table catalog_private.catalog_pricing_change_audit enable row level security;
alter table catalog_private.catalog_pricing_change_audit force row level security;

revoke all on table catalog_private.catalog_pricing_change_audit from public, anon, authenticated, service_role;
revoke all on sequence catalog_private.catalog_pricing_change_audit_id_seq from public, anon, authenticated, service_role;
grant usage on schema catalog_private to service_role;
grant select, insert on table catalog_private.catalog_pricing_change_audit to service_role;
grant usage, select on sequence catalog_private.catalog_pricing_change_audit_id_seq to service_role;

create function catalog_private.capture_catalog_pricing_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_row jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  after_row jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  changed text[] := '{}';
begin
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(key order by key), '{}')
      into changed
      from jsonb_each(after_row) as entry(key, value)
     where before_row -> key is distinct from value;
  elsif tg_op = 'INSERT' then
    select coalesce(array_agg(key order by key), '{}')
      into changed
      from jsonb_object_keys(after_row) as entry(key);
  else
    select coalesce(array_agg(key order by key), '{}')
      into changed
      from jsonb_object_keys(before_row) as entry(key);
  end if;

  insert into catalog_private.catalog_pricing_change_audit (
    target_kind,
    target_id,
    operation,
    before_values,
    after_values,
    changed_fields
  ) values (
    tg_argv[0],
    coalesce(after_row ->> 'id', before_row ->> 'id'),
    tg_op,
    before_row,
    after_row,
    changed
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function catalog_private.capture_catalog_pricing_change() from public, anon, authenticated;

create trigger catalog_products_pricing_audit
after insert or update or delete on public.catalog_products
for each row execute function catalog_private.capture_catalog_pricing_change('products');

create trigger catalog_product_variants_pricing_audit
after insert or update or delete on public.catalog_product_variants
for each row execute function catalog_private.capture_catalog_pricing_change('variants');

create trigger catalog_packages_pricing_audit
after insert or update or delete on public.catalog_packages
for each row execute function catalog_private.capture_catalog_pricing_change('packages');

create trigger catalog_package_core_prices_pricing_audit
after insert or update or delete on public.catalog_package_core_prices
for each row execute function catalog_private.capture_catalog_pricing_change('package-core-prices');

create trigger catalog_options_pricing_audit
after insert or update or delete on public.catalog_options
for each row execute function catalog_private.capture_catalog_pricing_change('options');

create trigger catalog_services_pricing_audit
after insert or update or delete on public.catalog_services
for each row execute function catalog_private.capture_catalog_pricing_change('services');

create trigger catalog_service_payment_options_pricing_audit
after insert or update or delete on public.catalog_service_payment_options
for each row execute function catalog_private.capture_catalog_pricing_change('service-payment-options');

create trigger catalog_product_services_pricing_audit
after insert or update or delete on public.catalog_product_services
for each row execute function catalog_private.capture_catalog_pricing_change('product-services');

create trigger catalog_price_schedules_pricing_audit
after insert or update or delete on public.catalog_price_schedules
for each row execute function catalog_private.capture_catalog_pricing_change('schedules');

create trigger catalog_pricing_settings_pricing_audit
after insert or update or delete on catalog_private.catalog_pricing_settings
for each row execute function catalog_private.capture_catalog_pricing_change('pricing-program');
