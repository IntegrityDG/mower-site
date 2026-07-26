begin;

-- Reusable public catalog specification definitions.
create table if not exists public.catalog_spec_definitions (
  id uuid primary key default gen_random_uuid(),
  specification_slug text not null unique,
  public_label text not null,
  category text not null
    check (category in ('applications', 'power', 'performance', 'battery', 'cutting_height', 'physical')),
  data_type text not null
    check (data_type in ('numeric', 'text', 'boolean', 'text_list')),
  canonical_unit text,
  sort_order integer not null default 0,
  public_status text not null default 'hidden'
    check (public_status in ('active', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One typed, independently sourced specification value per variant and definition.
create table if not exists public.catalog_variant_spec_values (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.catalog_product_variants(id) on delete cascade,
  specification_definition_id uuid not null references public.catalog_spec_definitions(id) on delete cascade,
  numeric_value numeric,
  text_value text,
  boolean_value boolean,
  text_values text[],
  public_display_value text,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'owner_approved', 'manufacturer_verified')),
  provenance_note text,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (variant_id, specification_definition_id),
  check (num_nonnulls(numeric_value, text_value, boolean_value, text_values) = 1)
);

create index if not exists catalog_variant_spec_values_variant_idx
  on public.catalog_variant_spec_values (variant_id, is_public);

alter table public.catalog_spec_definitions enable row level security;
alter table public.catalog_variant_spec_values enable row level security;

revoke all privileges on table public.catalog_spec_definitions from anon, authenticated;
revoke all privileges on table public.catalog_variant_spec_values from anon, authenticated;
grant select (
  id, specification_slug, public_label, category, data_type,
  canonical_unit, sort_order, public_status
) on public.catalog_spec_definitions to anon, authenticated;
grant select (
  id, variant_id, specification_definition_id, numeric_value, text_value,
  boolean_value, text_values, public_display_value, is_public
) on public.catalog_variant_spec_values to anon, authenticated;

-- The server-only service role retains full catalog-management access.
grant all privileges on table public.catalog_spec_definitions to service_role;
grant all privileges on table public.catalog_variant_spec_values to service_role;

drop policy if exists "Public reads active catalog specification definitions"
  on public.catalog_spec_definitions;
create policy "Public reads active catalog specification definitions"
  on public.catalog_spec_definitions for select
  to anon, authenticated
  using (public_status = 'active');

drop policy if exists "Public reads published active variant specifications"
  on public.catalog_variant_spec_values;
create policy "Public reads published active variant specifications"
  on public.catalog_variant_spec_values for select
  to anon, authenticated
  using (
    is_public
    and exists (
      select 1
      from public.catalog_product_variants variant
      join public.catalog_products product on product.id = variant.product_id
      where variant.id = catalog_variant_spec_values.variant_id
        and variant.public_status = 'active'
        and product.public_status = 'active'
    )
    and exists (
      select 1
      from public.catalog_spec_definitions definition
      where definition.id = catalog_variant_spec_values.specification_definition_id
        and definition.public_status = 'active'
    )
  );

do $$
begin
  if not exists (
    select 1 from public.catalog_products
    where id = '6364d86a-d5e5-4f17-8849-cea66cb6ff0c'
      and slug = 'pandag-g1'
      and brand = 'Pandag'
  ) then
    raise exception 'Expected Pandag G1 parent product was not found';
  end if;

  if not exists (
    select 1 from public.catalog_product_variants
    where id = '17be81bd-cf7b-424a-a57e-95423e7a10db'
      and product_id = '6364d86a-d5e5-4f17-8849-cea66cb6ff0c'
      and variant_slug = 'pandag-g1-m1500-sd'
      and name = 'Pandag G1 M1500 SD'
  ) then
    raise exception 'Expected Pandag G1 M1500 SD variant was not found';
  end if;

  if not exists (
    select 1 from public.catalog_product_variants
    where id = '9fcc8558-576b-4df7-93bd-12ceff29dcb2'
      and product_id = '6364d86a-d5e5-4f17-8849-cea66cb6ff0c'
      and variant_slug = 'pandag-g1-m1500-rd'
      and name = 'Pandag G1 M1500 RD'
  ) then
    raise exception 'Expected Pandag G1 M1500 RD variant was not found';
  end if;

  if not exists (
    select 1 from public.catalog_product_variants
    where id = '7dd2ce98-59a7-4a0d-b912-8d4916efa415'
      and product_id = '6364d86a-d5e5-4f17-8849-cea66cb6ff0c'
      and variant_slug = 'pandag-g1-pro-m3000'
      and name = 'Pandag G1 PRO M3000'
  ) then
    raise exception 'Expected Pandag G1 PRO M3000 variant was not found';
  end if;
end
$$;

insert into public.catalog_spec_definitions (
  id, specification_slug, public_label, category, data_type,
  canonical_unit, sort_order, public_status
)
values
  (md5('catalog-spec:recommended_applications')::uuid, 'recommended_applications', 'Recommended Applications', 'applications', 'text_list', null, 10, 'active'),
  (md5('catalog-spec:discharge_type')::uuid, 'discharge_type', 'Discharge Type', 'applications', 'text', null, 20, 'active'),
  (md5('catalog-spec:blade_type')::uuid, 'blade_type', 'Blade Type', 'applications', 'text', null, 30, 'active'),
  (md5('catalog-spec:rated_power')::uuid, 'rated_power', 'Rated Power', 'power', 'numeric', 'watts', 10, 'active'),
  (md5('catalog-spec:cutting_deck_power')::uuid, 'cutting_deck_power', 'Cutting-Deck Power', 'power', 'numeric', 'watts', 20, 'active'),
  (md5('catalog-spec:cutting_motor_configuration')::uuid, 'cutting_motor_configuration', 'Cutting Motors', 'power', 'text', null, 30, 'active'),
  (md5('catalog-spec:maximum_runtime')::uuid, 'maximum_runtime', 'Maximum Runtime', 'performance', 'numeric', 'hours', 10, 'active'),
  (md5('catalog-spec:mowable_acreage_per_day')::uuid, 'mowable_acreage_per_day', 'Mowable Acreage', 'performance', 'numeric', 'acres_per_day', 20, 'active'),
  (md5('catalog-spec:maximum_speed')::uuid, 'maximum_speed', 'Maximum Speed', 'performance', 'numeric', 'kilometers_per_hour', 30, 'active'),
  (md5('catalog-spec:maximum_climbing_slope')::uuid, 'maximum_climbing_slope', 'Maximum Climbing Slope', 'performance', 'numeric', 'degrees', 40, 'active'),
  (md5('catalog-spec:grade_equivalent')::uuid, 'grade_equivalent', 'Grade Equivalent', 'performance', 'numeric', 'percent', 50, 'active'),
  (md5('catalog-spec:battery_chemistry')::uuid, 'battery_chemistry', 'Battery Chemistry', 'battery', 'text', null, 10, 'active'),
  (md5('catalog-spec:battery_capacity')::uuid, 'battery_capacity', 'Battery Capacity', 'battery', 'numeric', 'kilowatt_hours', 20, 'active'),
  (md5('catalog-spec:suggested_cutting_height')::uuid, 'suggested_cutting_height', 'Suggested Cutting Height', 'cutting_height', 'numeric', 'inches', 10, 'active'),
  (md5('catalog-spec:minimum_cutting_height')::uuid, 'minimum_cutting_height', 'Minimum Cutting Height', 'cutting_height', 'numeric', 'inches', 20, 'active'),
  (md5('catalog-spec:maximum_cutting_height')::uuid, 'maximum_cutting_height', 'Maximum Cutting Height', 'cutting_height', 'numeric', 'inches', 30, 'active'),
  (md5('catalog-spec:weight')::uuid, 'weight', 'Weight', 'physical', 'numeric', 'kilograms', 10, 'active')
on conflict (specification_slug) do update
set public_label = excluded.public_label,
    category = excluded.category,
    data_type = excluded.data_type,
    canonical_unit = excluded.canonical_unit,
    sort_order = excluded.sort_order,
    public_status = excluded.public_status,
    updated_at = now();

with approved_values (
  variant_id, variant_slug, specification_slug,
  numeric_value, text_value, boolean_value, text_values, public_display_value
) as (
  values
    ('17be81bd-cf7b-424a-a57e-95423e7a10db'::uuid, 'pandag-g1-m1500-sd', 'recommended_applications', null::numeric, null::text, null::boolean, array['Golf Courses','Fine Turf Tracks']::text[], null::text),
    ('17be81bd-cf7b-424a-a57e-95423e7a10db'::uuid, 'pandag-g1-m1500-sd', 'discharge_type', null, 'Side Discharge', null, null, 'Side Discharge'),
    ('17be81bd-cf7b-424a-a57e-95423e7a10db'::uuid, 'pandag-g1-m1500-sd', 'blade_type', null, 'Bar Blade', null, null, 'Bar Blade'),
    ('17be81bd-cf7b-424a-a57e-95423e7a10db'::uuid, 'pandag-g1-m1500-sd', 'rated_power', 7500, null, null, null, '7,500W'),
    ('17be81bd-cf7b-424a-a57e-95423e7a10db'::uuid, 'pandag-g1-m1500-sd', 'cutting_deck_power', 4500, null, null, null, '4,500W'),
    ('17be81bd-cf7b-424a-a57e-95423e7a10db'::uuid, 'pandag-g1-m1500-sd', 'cutting_motor_configuration', null, '3 × 1,500W', null, null, '3 × 1,500W'),
    ('17be81bd-cf7b-424a-a57e-95423e7a10db'::uuid, 'pandag-g1-m1500-sd', 'maximum_runtime', 4, null, null, null, 'Up To 4 Hours'),
    ('17be81bd-cf7b-424a-a57e-95423e7a10db'::uuid, 'pandag-g1-m1500-sd', 'mowable_acreage_per_day', 8, null, null, null, 'Up To 8 Acres per Day'),
    ('17be81bd-cf7b-424a-a57e-95423e7a10db'::uuid, 'pandag-g1-m1500-sd', 'maximum_speed', 4.5, null, null, null, 'Under 4.5 km/h'),
    ('17be81bd-cf7b-424a-a57e-95423e7a10db'::uuid, 'pandag-g1-m1500-sd', 'maximum_climbing_slope', 42, null, null, null, '42°'),
    ('17be81bd-cf7b-424a-a57e-95423e7a10db'::uuid, 'pandag-g1-m1500-sd', 'grade_equivalent', 80, null, null, null, '80%'),
    ('17be81bd-cf7b-424a-a57e-95423e7a10db'::uuid, 'pandag-g1-m1500-sd', 'battery_chemistry', null, 'Ternary Lithium', null, null, 'Ternary Lithium'),
    ('17be81bd-cf7b-424a-a57e-95423e7a10db'::uuid, 'pandag-g1-m1500-sd', 'battery_capacity', 8, null, null, null, '8 kWh'),
    ('17be81bd-cf7b-424a-a57e-95423e7a10db'::uuid, 'pandag-g1-m1500-sd', 'suggested_cutting_height', 1.3, null, null, null, '1.3 inches'),
    ('17be81bd-cf7b-424a-a57e-95423e7a10db'::uuid, 'pandag-g1-m1500-sd', 'minimum_cutting_height', 1.3, null, null, null, '1.3 inches'),
    ('17be81bd-cf7b-424a-a57e-95423e7a10db'::uuid, 'pandag-g1-m1500-sd', 'maximum_cutting_height', 3.9, null, null, null, '3.9 inches'),
    ('17be81bd-cf7b-424a-a57e-95423e7a10db'::uuid, 'pandag-g1-m1500-sd', 'weight', 330, null, null, null, '330 kg'),

    ('9fcc8558-576b-4df7-93bd-12ceff29dcb2'::uuid, 'pandag-g1-m1500-rd', 'recommended_applications', null, null, null, array['Municipal Parks','Playing Fields','Orchards','Airports','Solar Farms']::text[], null),
    ('9fcc8558-576b-4df7-93bd-12ceff29dcb2'::uuid, 'pandag-g1-m1500-rd', 'discharge_type', null, 'Rear Discharge', null, null, 'Rear Discharge'),
    ('9fcc8558-576b-4df7-93bd-12ceff29dcb2'::uuid, 'pandag-g1-m1500-rd', 'blade_type', null, 'Swing Blade', null, null, 'Swing Blade'),
    ('9fcc8558-576b-4df7-93bd-12ceff29dcb2'::uuid, 'pandag-g1-m1500-rd', 'rated_power', 7500, null, null, null, '7,500W'),
    ('9fcc8558-576b-4df7-93bd-12ceff29dcb2'::uuid, 'pandag-g1-m1500-rd', 'cutting_deck_power', 4500, null, null, null, '4,500W'),
    ('9fcc8558-576b-4df7-93bd-12ceff29dcb2'::uuid, 'pandag-g1-m1500-rd', 'cutting_motor_configuration', null, '3 × 1,500W', null, null, '3 × 1,500W'),
    ('9fcc8558-576b-4df7-93bd-12ceff29dcb2'::uuid, 'pandag-g1-m1500-rd', 'maximum_runtime', 6, null, null, null, 'Up To 6 Hours'),
    ('9fcc8558-576b-4df7-93bd-12ceff29dcb2'::uuid, 'pandag-g1-m1500-rd', 'mowable_acreage_per_day', 12, null, null, null, 'Up To 12 Acres per Day'),
    ('9fcc8558-576b-4df7-93bd-12ceff29dcb2'::uuid, 'pandag-g1-m1500-rd', 'maximum_speed', 4.5, null, null, null, 'Under 4.5 km/h'),
    ('9fcc8558-576b-4df7-93bd-12ceff29dcb2'::uuid, 'pandag-g1-m1500-rd', 'maximum_climbing_slope', 42, null, null, null, '42°'),
    ('9fcc8558-576b-4df7-93bd-12ceff29dcb2'::uuid, 'pandag-g1-m1500-rd', 'grade_equivalent', 80, null, null, null, '80%'),
    ('9fcc8558-576b-4df7-93bd-12ceff29dcb2'::uuid, 'pandag-g1-m1500-rd', 'battery_chemistry', null, 'Ternary Lithium', null, null, 'Ternary Lithium'),
    ('9fcc8558-576b-4df7-93bd-12ceff29dcb2'::uuid, 'pandag-g1-m1500-rd', 'battery_capacity', 8, null, null, null, '8 kWh'),
    ('9fcc8558-576b-4df7-93bd-12ceff29dcb2'::uuid, 'pandag-g1-m1500-rd', 'suggested_cutting_height', 2.25, null, null, null, '2.25 inches'),
    ('9fcc8558-576b-4df7-93bd-12ceff29dcb2'::uuid, 'pandag-g1-m1500-rd', 'minimum_cutting_height', 1.5, null, null, null, '1.5 inches'),
    ('9fcc8558-576b-4df7-93bd-12ceff29dcb2'::uuid, 'pandag-g1-m1500-rd', 'maximum_cutting_height', 4.5, null, null, null, '4.5 inches'),
    ('9fcc8558-576b-4df7-93bd-12ceff29dcb2'::uuid, 'pandag-g1-m1500-rd', 'weight', 315, null, null, null, '315 kg'),

    ('7dd2ce98-59a7-4a0d-b912-8d4916efa415'::uuid, 'pandag-g1-pro-m3000', 'recommended_applications', null, null, null, array['Land Reclamation','Overgrown Ground','Scrub-Covered Slopes','Rough or Tall Vegetation']::text[], null),
    ('7dd2ce98-59a7-4a0d-b912-8d4916efa415'::uuid, 'pandag-g1-pro-m3000', 'discharge_type', null, 'Rear Discharge', null, null, 'Rear Discharge'),
    ('7dd2ce98-59a7-4a0d-b912-8d4916efa415'::uuid, 'pandag-g1-pro-m3000', 'blade_type', null, 'Swing Blade', null, null, 'Swing Blade'),
    ('7dd2ce98-59a7-4a0d-b912-8d4916efa415'::uuid, 'pandag-g1-pro-m3000', 'rated_power', 12000, null, null, null, '12,000W'),
    ('7dd2ce98-59a7-4a0d-b912-8d4916efa415'::uuid, 'pandag-g1-pro-m3000', 'cutting_deck_power', 9000, null, null, null, '9,000W'),
    ('7dd2ce98-59a7-4a0d-b912-8d4916efa415'::uuid, 'pandag-g1-pro-m3000', 'cutting_motor_configuration', null, '3 × 3,000W', null, null, '3 × 3,000W'),
    ('7dd2ce98-59a7-4a0d-b912-8d4916efa415'::uuid, 'pandag-g1-pro-m3000', 'maximum_runtime', 8, null, null, null, 'Up To 8 Hours'),
    ('7dd2ce98-59a7-4a0d-b912-8d4916efa415'::uuid, 'pandag-g1-pro-m3000', 'mowable_acreage_per_day', 11, null, null, null, 'Up To 11 Acres per Day'),
    ('7dd2ce98-59a7-4a0d-b912-8d4916efa415'::uuid, 'pandag-g1-pro-m3000', 'maximum_speed', 4.15, null, null, null, 'Under 4.15 km/h'),
    ('7dd2ce98-59a7-4a0d-b912-8d4916efa415'::uuid, 'pandag-g1-pro-m3000', 'maximum_climbing_slope', 38, null, null, null, '38°'),
    ('7dd2ce98-59a7-4a0d-b912-8d4916efa415'::uuid, 'pandag-g1-pro-m3000', 'grade_equivalent', 78, null, null, null, '78%'),
    ('7dd2ce98-59a7-4a0d-b912-8d4916efa415'::uuid, 'pandag-g1-pro-m3000', 'battery_chemistry', null, 'LiFePO4', null, null, 'LiFePO4'),
    ('7dd2ce98-59a7-4a0d-b912-8d4916efa415'::uuid, 'pandag-g1-pro-m3000', 'battery_capacity', 16, null, null, null, '16 kWh'),
    ('7dd2ce98-59a7-4a0d-b912-8d4916efa415'::uuid, 'pandag-g1-pro-m3000', 'suggested_cutting_height', 5.9, null, null, null, '5.9 inches'),
    ('7dd2ce98-59a7-4a0d-b912-8d4916efa415'::uuid, 'pandag-g1-pro-m3000', 'minimum_cutting_height', 1.9, null, null, null, '1.9 inches'),
    ('7dd2ce98-59a7-4a0d-b912-8d4916efa415'::uuid, 'pandag-g1-pro-m3000', 'maximum_cutting_height', 5.9, null, null, null, '5.9 inches'),
    ('7dd2ce98-59a7-4a0d-b912-8d4916efa415'::uuid, 'pandag-g1-pro-m3000', 'weight', 410, null, null, null, '410 kg')
), resolved_values as (
  select
    md5('pandag-spec:' || approved.variant_id::text || ':' || approved.specification_slug)::uuid as id,
    approved.variant_id,
    definition.id as specification_definition_id,
    approved.numeric_value,
    approved.text_value,
    approved.boolean_value,
    approved.text_values,
    approved.public_display_value
  from approved_values approved
  join public.catalog_product_variants variant
    on variant.id = approved.variant_id
   and variant.variant_slug = approved.variant_slug
   and variant.product_id = '6364d86a-d5e5-4f17-8849-cea66cb6ff0c'
  join public.catalog_spec_definitions definition
    on definition.specification_slug = approved.specification_slug
)
insert into public.catalog_variant_spec_values (
  id, variant_id, specification_definition_id, numeric_value, text_value,
  boolean_value, text_values, public_display_value, verification_status,
  provenance_note, is_public
)
select
  id, variant_id, specification_definition_id, numeric_value, text_value,
  boolean_value, text_values, public_display_value, 'owner_approved',
  'Owner-approved Pandag model-reference images supplied July 25, 2026.', true
from resolved_values
on conflict (variant_id, specification_definition_id) do update
set numeric_value = excluded.numeric_value,
    text_value = excluded.text_value,
    boolean_value = excluded.boolean_value,
    text_values = excluded.text_values,
    public_display_value = excluded.public_display_value,
    verification_status = excluded.verification_status,
    provenance_note = excluded.provenance_note,
    is_public = excluded.is_public,
    updated_at = now();

do $$
declare
  seeded_count integer;
begin
  select count(*) into seeded_count
  from public.catalog_variant_spec_values value
  join public.catalog_product_variants variant on variant.id = value.variant_id
  join public.catalog_spec_definitions definition
    on definition.id = value.specification_definition_id
  where variant.product_id = '6364d86a-d5e5-4f17-8849-cea66cb6ff0c'
    and value.verification_status = 'owner_approved'
    and value.is_public
    and definition.specification_slug in (
      'recommended_applications', 'discharge_type', 'blade_type', 'rated_power',
      'cutting_deck_power', 'cutting_motor_configuration', 'maximum_runtime',
      'mowable_acreage_per_day', 'maximum_speed', 'maximum_climbing_slope',
      'grade_equivalent', 'battery_chemistry', 'battery_capacity',
      'suggested_cutting_height', 'minimum_cutting_height',
      'maximum_cutting_height', 'weight'
    );

  if seeded_count <> 51 then
    raise exception 'Expected 51 public owner-approved Pandag specification values, found %', seeded_count;
  end if;
end
$$;

commit;

-- Verification queries (read-only; run only after separate migration approval).
select specification_slug, public_label, category, data_type, canonical_unit,
       sort_order, public_status
from public.catalog_spec_definitions
where specification_slug in (
  'recommended_applications', 'discharge_type', 'blade_type', 'rated_power',
  'cutting_deck_power', 'cutting_motor_configuration', 'maximum_runtime',
  'mowable_acreage_per_day', 'maximum_speed', 'maximum_climbing_slope',
  'grade_equivalent', 'battery_chemistry', 'battery_capacity',
  'suggested_cutting_height', 'minimum_cutting_height',
  'maximum_cutting_height', 'weight'
)
order by category, sort_order;

select variant.variant_slug, definition.specification_slug,
       value.numeric_value, value.text_value, value.text_values,
       value.public_display_value, value.verification_status, value.is_public
from public.catalog_variant_spec_values value
join public.catalog_product_variants variant on variant.id = value.variant_id
join public.catalog_spec_definitions definition
  on definition.id = value.specification_definition_id
where variant.product_id = '6364d86a-d5e5-4f17-8849-cea66cb6ff0c'
order by variant.sort_order, definition.category, definition.sort_order;

-- Rollback (NOT EXECUTED): the tables are new in Phase 3C.
-- begin;
-- drop table if exists public.catalog_variant_spec_values;
-- drop table if exists public.catalog_spec_definitions;
-- commit;
