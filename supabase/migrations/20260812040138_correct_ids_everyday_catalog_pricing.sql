-- One-time owner-authorized correction of IDS Everyday selling prices.
-- This migration deliberately updates only regular_price_cents. MSRP, sales,
-- schedules, dealer cost, accessories, services, and non-target brands remain untouched.

do $$
declare
  yarbo_product_id uuid;
  affected_count integer;
begin
  select id into strict yarbo_product_id
  from public.catalog_products
  where slug = 'yarbo'
    and brand = 'Yarbo';

  if (
    select count(*)
    from public.catalog_product_variants
    where variant_slug in ('lymow-one-plus-5a', 'lymow-one-plus-10a')
      and display_msrp_price_cents is not null
      and display_msrp_price_cents >= 15000
  ) <> 2 then
    raise exception 'Expected exactly two guarded Lymow pricing targets.';
  end if;

  update public.catalog_product_variants
  set regular_price_cents = display_msrp_price_cents - 15000
  where variant_slug in ('lymow-one-plus-5a', 'lymow-one-plus-10a')
    and display_msrp_price_cents is not null
    and display_msrp_price_cents >= 15000;
  get diagnostics affected_count = row_count;
  if affected_count <> 2 then
    raise exception 'Lymow pricing correction affected % rows instead of 2.', affected_count;
  end if;

  if not exists (
    select 1 from public.catalog_packages
    where product_id = yarbo_product_id
      and display_msrp_price_cents is not null
  ) then
    raise exception 'No Yarbo packages with MSRP were found.';
  end if;

  if exists (
    select 1 from public.catalog_packages
    where product_id = yarbo_product_id
      and display_msrp_price_cents is not null
      and display_msrp_price_cents < 20000
  ) then
    raise exception 'A Yarbo package MSRP is below the $200 discount guard.';
  end if;

  update public.catalog_packages
  set regular_price_cents = display_msrp_price_cents - 20000
  where product_id = yarbo_product_id
    and display_msrp_price_cents is not null
    and display_msrp_price_cents >= 20000;

  if (
    select count(*)
    from public.catalog_options
    where product_id = yarbo_product_id
      and option_slug in (
        'yarbo-mower-module',
        'yarbo-lawn-mower-pro-module',
        'yarbo-leaf-blower-module',
        'yarbo-snow-blower-module',
        'yarbo-trimmer-module'
      )
      and display_msrp_price_cents is not null
      and display_msrp_price_cents >= 10000
  ) <> 5 then
    raise exception 'Expected exactly five guarded Yarbo module pricing targets.';
  end if;

  update public.catalog_options
  set regular_price_cents = display_msrp_price_cents - 10000
  where product_id = yarbo_product_id
    and option_slug in (
      'yarbo-mower-module',
      'yarbo-lawn-mower-pro-module',
      'yarbo-leaf-blower-module',
      'yarbo-snow-blower-module',
      'yarbo-trimmer-module'
    )
    and display_msrp_price_cents is not null
    and display_msrp_price_cents >= 10000;
  get diagnostics affected_count = row_count;
  if affected_count <> 5 then
    raise exception 'Yarbo module pricing correction affected % rows instead of 5.', affected_count;
  end if;
end
$$;
