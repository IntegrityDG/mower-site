begin;

-- A package remains one catalog record. Its Y40 row inherits the existing
-- catalog_packages price; only a Core-specific override stores a second price.
create unique index if not exists catalog_packages_id_product_idx
  on public.catalog_packages (id, product_id);
create unique index if not exists catalog_product_variants_id_product_idx
  on public.catalog_product_variants (id, product_id);

create table public.catalog_package_core_prices (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  package_id uuid not null,
  core_variant_id uuid not null,
  price_mode text not null check (price_mode in ('package', 'core_specific')),
  regular_price_cents integer check (regular_price_cents is null or regular_price_cents >= 0),
  sale_price_cents integer check (sale_price_cents is null or sale_price_cents >= 0),
  sale_starts_at timestamptz,
  sale_ends_at timestamptz,
  promotion_label text,
  show_public_price boolean not null default true,
  contact_for_pricing boolean not null default false,
  public_status text not null default 'active'
    check (public_status in ('active', 'unavailable', 'coming_soon', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (package_id, core_variant_id),
  foreign key (package_id, product_id)
    references public.catalog_packages (id, product_id) on delete cascade,
  foreign key (core_variant_id, product_id)
    references public.catalog_product_variants (id, product_id) on delete cascade,
  check (
    (price_mode = 'package' and regular_price_cents is null and sale_price_cents is null
      and sale_starts_at is null and sale_ends_at is null and promotion_label is null)
    or (price_mode = 'core_specific' and regular_price_cents is not null)
  ),
  check (sale_price_cents is null or (sale_starts_at is not null and sale_ends_at is not null)),
  check (sale_ends_at is null or (sale_starts_at is not null and sale_ends_at > sale_starts_at))
);

create index catalog_package_core_prices_variant_idx
  on public.catalog_package_core_prices (core_variant_id, package_id);

alter table public.catalog_package_core_prices enable row level security;
revoke all on public.catalog_package_core_prices from public, anon, authenticated;
grant select (
  id, product_id, package_id, core_variant_id, price_mode,
  regular_price_cents, sale_price_cents, sale_starts_at, sale_ends_at,
  promotion_label, show_public_price, contact_for_pricing, public_status
) on public.catalog_package_core_prices to anon, authenticated;
grant all on public.catalog_package_core_prices to service_role;

create policy "Public reads visible package Core prices"
  on public.catalog_package_core_prices for select
  to anon, authenticated
  using (
    public_status <> 'hidden'
    and show_public_price
    and not contact_for_pricing
    and exists (
      select 1 from public.catalog_products p
      join public.catalog_packages pkg on pkg.product_id = p.id
      join public.catalog_product_variants core on core.product_id = p.id
      where p.id = catalog_package_core_prices.product_id
        and pkg.id = catalog_package_core_prices.package_id
        and core.id = catalog_package_core_prices.core_variant_id
        and p.public_status <> 'hidden'
        and pkg.public_status <> 'hidden'
        and core.public_status <> 'hidden'
    )
  );

-- Coming Soon Core specifications must remain publicly readable while the
-- existing catalog/checkout status still prevents purchase.
drop policy if exists "Public reads published active variant specifications"
  on public.catalog_variant_spec_values;
create policy "Public reads published visible variant specifications"
  on public.catalog_variant_spec_values for select
  to anon, authenticated
  using (
    is_public
    and exists (
      select 1 from public.catalog_product_variants variant
      join public.catalog_products product on product.id = variant.product_id
      where variant.id = catalog_variant_spec_values.variant_id
        and variant.public_status in ('active', 'coming_soon')
        and product.public_status in ('active', 'coming_soon')
    )
    and exists (
      select 1 from public.catalog_spec_definitions definition
      where definition.id = catalog_variant_spec_values.specification_definition_id
        and definition.public_status = 'active'
    )
  );

-- Apply only to the exact reviewed Yarbo catalog state. The Y40 catalog
-- product/package prices are checked but never updated here.
create temporary table yarbo_y40p_seed (
  package_slug text primary key,
  approved_y40_cents integer not null,
  y40p_msrp_cents integer not null,
  y40p_early_access_cents integer not null,
  module_slugs text[] not null
) on commit drop;

insert into yarbo_y40p_seed values
  ('yarbo-snow-blower', 479900, 779900, 709900, array['yarbo-snow-blower-module']),
  ('yarbo-lawn-mower-pro', 579900, 759900, 689900, array['yarbo-lawn-mower-pro-module']),
  ('yarbo-leaf-blower', 459900, 669900, 599900, array['yarbo-leaf-blower-module']),
  ('yarbo-snow-leaf', 579900, 889900, 809900, array['yarbo-leaf-blower-module','yarbo-snow-blower-module']),
  ('yarbo-pro-snow', 699900, 979900, 899900, array['yarbo-lawn-mower-pro-module','yarbo-snow-blower-module']),
  ('yarbo-pro-leaf', 679900, 869900, 789900, array['yarbo-lawn-mower-pro-module','yarbo-leaf-blower-module']),
  ('yarbo-pro-snow-leaf', 779900, 1089900, 999900, array['yarbo-lawn-mower-pro-module','yarbo-leaf-blower-module','yarbo-snow-blower-module']);

do $$
declare yarbo_id uuid;
begin
  select id into strict yarbo_id from public.catalog_products
  where slug = 'yarbo' and brand = 'Yarbo' and public_status = 'active';
  if (select count(*) from public.catalog_packages where product_id = yarbo_id and public_status = 'active') <> 7 then
    raise exception 'Yarbo active package count differs from the seven approved mappings';
  end if;
  if exists (
    select 1 from yarbo_y40p_seed seed
    left join public.catalog_packages pkg on pkg.product_id = yarbo_id and pkg.package_slug = seed.package_slug
    where pkg.id is null or pkg.public_status <> 'active'
      or pkg.regular_price_cents is distinct from seed.approved_y40_cents
      or (select array_agg(option.option_slug order by option.option_slug)
          from public.catalog_package_items item
          join public.catalog_options option on option.id = item.option_id
          where item.package_id = pkg.id) is distinct from seed.module_slugs
  ) then
    raise exception 'Yarbo package identity, modules, or approved Y40 prices changed';
  end if;
  if exists (select 1 from public.catalog_product_variants where product_id = yarbo_id and variant_slug in ('yarbo-y40', 'yarbo-y40p')) then
    raise exception 'Yarbo Core variants already exist; review before applying this migration';
  end if;
end $$;

insert into public.catalog_product_variants (
  product_id, variant_slug, sku, name, description, public_status,
  regular_price_cents, sale_price_cents, sale_starts_at, sale_ends_at,
  promotion_label, display_msrp_price_cents, show_public_price, contact_for_pricing, sort_order
)
select id, 'yarbo-y40', null, 'Y40 Core', 'Proven Y-Series Core. Core-only pricing inherits the existing Yarbo product.',
  'active', null, null, null, null, null, null, true, false, 10
from public.catalog_products where slug = 'yarbo'
union all
select id, 'yarbo-y40p', null, 'Y40P Core', 'Premium next-generation Y-Series Core with gearbox-free dual hub motors.',
  'coming_soon', 559900, 499900,
  '2026-09-15 00:00:00 America/Chicago'::timestamptz,
  '2026-10-07 00:00:00 America/Chicago'::timestamptz,
  'Early Access', 559900, true, false, 20
from public.catalog_products where slug = 'yarbo';

-- Existing module rows are shared by both Cores. Trimmer remains unavailable
-- under its existing catalog status; no module availability is changed here.
insert into public.catalog_variant_options (variant_id, option_id, relationship_type)
select core.id, module.id, 'compatible'
from public.catalog_product_variants core
join public.catalog_options module on module.product_id = core.product_id
where core.variant_slug in ('yarbo-y40', 'yarbo-y40p')
  and module.option_slug in (
    'yarbo-lawn-mower-pro-module', 'yarbo-snow-blower-module',
    'yarbo-leaf-blower-module', 'yarbo-trimmer-module'
  );

insert into public.catalog_package_core_prices (
  product_id, package_id, core_variant_id, price_mode, regular_price_cents,
  sale_price_cents, sale_starts_at, sale_ends_at, promotion_label,
  show_public_price, contact_for_pricing, public_status
)
select pkg.product_id, pkg.id, core.id,
  case when core.variant_slug = 'yarbo-y40' then 'package' else 'core_specific' end,
  case when core.variant_slug = 'yarbo-y40' then null else seed.y40p_msrp_cents end,
  case when core.variant_slug = 'yarbo-y40' then null else seed.y40p_early_access_cents end,
  case when core.variant_slug = 'yarbo-y40' then null else '2026-09-15 00:00:00 America/Chicago'::timestamptz end,
  case when core.variant_slug = 'yarbo-y40' then null else '2026-10-07 00:00:00 America/Chicago'::timestamptz end,
  case when core.variant_slug = 'yarbo-y40' then null else 'Early Access' end,
  true, false, 'active'
from yarbo_y40p_seed seed
join public.catalog_packages pkg on pkg.package_slug = seed.package_slug
join public.catalog_product_variants core on core.product_id = pkg.product_id
  and core.variant_slug in ('yarbo-y40', 'yarbo-y40p');

insert into public.catalog_spec_definitions (
  specification_slug, public_label, category, data_type, canonical_unit, sort_order, public_status
)
values
  ('yarbo_drive_system', 'Drive system', 'power', 'text', null, 10, 'active'),
  ('yarbo_max_drive_speed', 'Maximum drive speed', 'performance', 'text', null, 20, 'active'),
  ('yarbo_mowing_per_charge', 'Lawn mowing per charge', 'performance', 'text', null, 30, 'active'),
  ('yarbo_daily_mowing', 'Daily mowing', 'performance', 'text', null, 40, 'active'),
  ('yarbo_weekly_coverage', 'Weekly mowing coverage', 'performance', 'text', null, 50, 'active'),
  ('yarbo_snow_per_charge', 'Snow clearing per charge', 'performance', 'text', null, 60, 'active'),
  ('yarbo_efficiency', 'Overall efficiency', 'performance', 'text', null, 70, 'active'),
  ('yarbo_max_climb', 'Maximum climb', 'performance', 'text', null, 80, 'active'),
  ('yarbo_operating_noise', 'Operating noise', 'performance', 'text', null, 90, 'active');

with source_values(variant_slug, specification_slug, display_value) as (
  values
    ('yarbo-y40','yarbo_drive_system','Dual Drive Motors'),
    ('yarbo-y40p','yarbo_drive_system','Dual Hub Motors; gearbox-free drivetrain'),
    ('yarbo-y40','yarbo_max_drive_speed','0.65 m/s'),
    ('yarbo-y40p','yarbo_max_drive_speed','1.2 m/s'),
    ('yarbo-y40','yarbo_mowing_per_charge','Up to 0.25 acre'),
    ('yarbo-y40p','yarbo_mowing_per_charge','Up to 0.3 acre'),
    ('yarbo-y40','yarbo_daily_mowing','Up to 1.7 acres/day'),
    ('yarbo-y40p','yarbo_daily_mowing','Up to 2 acres/day'),
    ('yarbo-y40','yarbo_weekly_coverage','Up to 6 acres'),
    ('yarbo-y40p','yarbo_weekly_coverage','Up to 7 acres'),
    ('yarbo-y40','yarbo_snow_per_charge','Up to 6,000 sq ft'),
    ('yarbo-y40p','yarbo_snow_per_charge','Up to 7,000 sq ft'),
    ('yarbo-y40','yarbo_efficiency','Reference'),
    ('yarbo-y40p','yarbo_efficiency','Approximately 15% higher'),
    ('yarbo-y40','yarbo_max_climb','Up to 70% (35 degrees)'),
    ('yarbo-y40p','yarbo_max_climb','Up to 70% (35 degrees)'),
    ('yarbo-y40','yarbo_operating_noise','Approximately 60 dB'),
    ('yarbo-y40p','yarbo_operating_noise','Approximately 60 dB')
)
insert into public.catalog_variant_spec_values (
  variant_id, specification_definition_id, text_value, public_display_value,
  verification_status, provenance_note, is_public
)
select core.id, definition.id, source_values.display_value, source_values.display_value,
  'owner_approved', 'New Y40P Core.pdf, supplied by IDS, September 2026', true
from source_values
join public.catalog_products product on product.slug = 'yarbo'
join public.catalog_product_variants core on core.product_id = product.id
  and core.variant_slug = source_values.variant_slug
join public.catalog_spec_definitions definition on definition.specification_slug = source_values.specification_slug;

commit;
