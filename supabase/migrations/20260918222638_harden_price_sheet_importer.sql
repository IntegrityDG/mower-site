begin;

-- Persist parser evidence that must remain reviewable after the upload request.
-- Existing history remains unchanged and receives only neutral null/empty values.
alter table catalog_private.catalog_sale_imports
  add column detected_manufacturer_brand text,
  add column pricing_scope text,
  add column promotion_label text,
  add column promotion_starts_at timestamptz,
  add column promotion_ends_at timestamptz,
  add column header_sheet_name text,
  add column header_row_number integer,
  add column column_mapping jsonb not null default '{}'::jsonb;

alter table catalog_private.catalog_sale_imports
  add constraint catalog_sale_imports_detected_brand_length_check
    check (
      detected_manufacturer_brand is null
      or char_length(trim(detected_manufacturer_brand)) between 1 and 120
    ),
  add constraint catalog_sale_imports_pricing_scope_check
    check (pricing_scope is null or pricing_scope in ('generic', 'y40', 'y40p')),
  add constraint catalog_sale_imports_promotion_label_length_check
    check (promotion_label is null or char_length(promotion_label) <= 160),
  add constraint catalog_sale_imports_header_sheet_length_check
    check (header_sheet_name is null or char_length(header_sheet_name) <= 120),
  add constraint catalog_sale_imports_header_row_check
    check (header_row_number is null or header_row_number > 0),
  add constraint catalog_sale_imports_column_mapping_object_check
    check (jsonb_typeof(column_mapping) = 'object'),
  add constraint catalog_sale_imports_promotion_window_check
    check (
      (promotion_starts_at is null and promotion_ends_at is null)
      or (
        promotion_starts_at is not null
        and promotion_ends_at is not null
        and promotion_ends_at > promotion_starts_at
      )
    );

alter table catalog_private.catalog_sale_import_rows
  add column proposed_discount_cents integer,
  add column proposed_promotion_label text,
  add column match_method text,
  add column match_reason text,
  add column validation_errors jsonb not null default '[]'::jsonb;

alter table catalog_private.catalog_sale_import_rows
  add constraint catalog_sale_import_rows_discount_check
    check (proposed_discount_cents is null or proposed_discount_cents >= 0),
  add constraint catalog_sale_import_rows_promotion_label_length_check
    check (proposed_promotion_label is null or char_length(proposed_promotion_label) <= 160),
  add constraint catalog_sale_import_rows_match_method_check
    check (
      match_method is null
      or match_method in (
        'exact_sku',
        'exact_name',
        'exact_alias',
        'exact_base_name',
        'component_signature',
        'verified_alias',
        'manual'
      )
    ),
  add constraint catalog_sale_import_rows_match_reason_length_check
    check (match_reason is null or char_length(match_reason) <= 500),
  add constraint catalog_sale_import_rows_validation_errors_array_check
    check (jsonb_typeof(validation_errors) = 'array');

comment on column catalog_private.catalog_sale_imports.column_mapping is
  'Semantic source-header mapping retained for IDS review; it contains headings, not source row values.';
comment on column catalog_private.catalog_sale_import_rows.validation_errors is
  'Blocking source validation findings. A row with any entry cannot be approved or applied.';
comment on column catalog_private.catalog_sale_import_rows.proposed_discount_cents is
  'Manufacturer discount retained for reconciliation/audit; it is never itself applied as a catalog price.';

-- Cover importer foreign keys used by target revalidation and source-import
-- cleanup. Partial indexes keep the sparse polymorphic target columns small.
create index catalog_sale_import_rows_product_id_idx
  on catalog_private.catalog_sale_import_rows (product_id)
  where product_id is not null;
create index catalog_sale_import_rows_variant_id_idx
  on catalog_private.catalog_sale_import_rows (variant_id)
  where variant_id is not null;
create index catalog_sale_import_rows_option_id_idx
  on catalog_private.catalog_sale_import_rows (option_id)
  where option_id is not null;
create index catalog_sale_import_rows_package_id_idx
  on catalog_private.catalog_sale_import_rows (package_id)
  where package_id is not null;
create index catalog_promotional_costs_source_import_id_idx
  on catalog_private.catalog_promotional_dealer_costs (source_import_id)
  where source_import_id is not null;

-- The eight hidden trimmer package records predated the Y40/Y40P relationship
-- table. Add only their missing Y40 inheritance rows. No catalog price,
-- availability, Y40P relationship, or preorder value is changed.
do $$
declare
  yarbo_id uuid;
  y40_id uuid;
  missing_slugs text[];
  expected_missing constant text[] := array[
    'yarbo-lawn-mower-pro-trimmer',
    'yarbo-leaf-blower-trimmer',
    'yarbo-pro-leaf-trimmer',
    'yarbo-pro-snow-leaf-trimmer',
    'yarbo-pro-snow-trimmer',
    'yarbo-snow-blower-trimmer',
    'yarbo-snow-leaf-trimmer',
    'yarbo-trimmer'
  ];
begin
  select id into strict yarbo_id
  from public.catalog_products
  where slug = 'yarbo' and brand = 'Yarbo';

  select id into strict y40_id
  from public.catalog_product_variants
  where product_id = yarbo_id and variant_slug = 'yarbo-y40';

  if exists (
    select 1
    from public.catalog_package_core_prices cp
    where cp.product_id = yarbo_id
      and cp.core_variant_id = y40_id
      and cp.price_mode <> 'package'
  ) then
    raise exception 'Existing Y40 package inheritance mode is not package';
  end if;

  select coalesce(array_agg(p.package_slug order by p.package_slug), '{}'::text[])
  into missing_slugs
  from public.catalog_packages p
  where p.product_id = yarbo_id
    and not exists (
      select 1
      from public.catalog_package_core_prices cp
      where cp.package_id = p.id and cp.core_variant_id = y40_id
    );

  if missing_slugs is distinct from expected_missing then
    raise exception 'Unexpected set of Yarbo packages missing Y40 inheritance: %', missing_slugs;
  end if;

  insert into public.catalog_package_core_prices (
    product_id,
    package_id,
    core_variant_id,
    price_mode,
    regular_price_cents,
    sale_price_cents,
    sale_starts_at,
    sale_ends_at,
    promotion_label,
    show_public_price,
    contact_for_pricing,
    public_status
  )
  select
    p.product_id,
    p.id,
    y40_id,
    'package',
    null,
    null,
    null,
    null,
    null,
    p.show_public_price,
    p.contact_for_pricing,
    p.public_status
  from public.catalog_packages p
  where p.product_id = yarbo_id
    and p.package_slug = any(expected_missing)
  order by p.package_slug;

  if (
    select count(*)
    from public.catalog_package_core_prices cp
    join public.catalog_packages p on p.id = cp.package_id
    where cp.product_id = yarbo_id
      and cp.core_variant_id = y40_id
      and cp.price_mode = 'package'
  ) <> (
    select count(*) from public.catalog_packages where product_id = yarbo_id
  ) then
    raise exception 'Every Yarbo package must have exactly one Y40 package-price inheritance row';
  end if;
end $$;

commit;
