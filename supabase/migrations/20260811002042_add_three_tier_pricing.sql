alter table public.catalog_products
  add column display_msrp_price_cents integer
  constraint catalog_products_display_msrp_price_nonnegative
  check (display_msrp_price_cents is null or display_msrp_price_cents >= 0);

alter table public.catalog_product_variants
  add column display_msrp_price_cents integer
  constraint catalog_product_variants_display_msrp_price_nonnegative
  check (display_msrp_price_cents is null or display_msrp_price_cents >= 0);

alter table public.catalog_options
  add column display_msrp_price_cents integer
  constraint catalog_options_display_msrp_price_nonnegative
  check (display_msrp_price_cents is null or display_msrp_price_cents >= 0);

alter table public.catalog_packages
  add column display_msrp_price_cents integer
  constraint catalog_packages_display_msrp_price_nonnegative
  check (display_msrp_price_cents is null or display_msrp_price_cents >= 0);

alter table public.catalog_services
  add column display_msrp_price_cents integer
  constraint catalog_services_display_msrp_price_nonnegative
  check (display_msrp_price_cents is null or display_msrp_price_cents >= 0);

alter table public.catalog_service_payment_options
  add column display_msrp_price_cents integer
  constraint catalog_service_payment_options_display_msrp_price_nonnegative
  check (display_msrp_price_cents is null or display_msrp_price_cents >= 0);

alter table public.catalog_product_services
  add column override_display_msrp_price_cents integer
  constraint catalog_product_services_override_display_msrp_price_nonnegative
  check (override_display_msrp_price_cents is null or override_display_msrp_price_cents >= 0);

-- An undated legacy sale represented the IDS everyday price. Dated sales remain
-- temporary sales. Service payment options have no sale window, so their data is
-- deliberately left unchanged rather than guessing intent.
update public.catalog_products
set display_msrp_price_cents = regular_price_cents,
    regular_price_cents = sale_price_cents,
    sale_price_cents = null
where sale_price_cents is not null
  and sale_starts_at is null
  and sale_ends_at is null;

update public.catalog_product_variants
set display_msrp_price_cents = regular_price_cents,
    regular_price_cents = sale_price_cents,
    sale_price_cents = null
where sale_price_cents is not null
  and sale_starts_at is null
  and sale_ends_at is null;

update public.catalog_options
set display_msrp_price_cents = regular_price_cents,
    regular_price_cents = sale_price_cents,
    sale_price_cents = null
where sale_price_cents is not null
  and sale_starts_at is null
  and sale_ends_at is null;

update public.catalog_packages
set display_msrp_price_cents = regular_price_cents,
    regular_price_cents = sale_price_cents,
    sale_price_cents = null
where sale_price_cents is not null
  and sale_starts_at is null
  and sale_ends_at is null;

update public.catalog_services
set display_msrp_price_cents = regular_price_cents,
    regular_price_cents = sale_price_cents,
    sale_price_cents = null
where sale_price_cents is not null
  and sale_starts_at is null
  and sale_ends_at is null;
