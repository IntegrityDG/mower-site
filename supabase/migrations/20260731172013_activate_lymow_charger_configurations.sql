begin;

-- Block concurrent catalog writers while preserving ordinary SELECT access.
-- Acquire locks in dependency order before validating any target state.
lock table public.catalog_products in share row exclusive mode;
lock table public.catalog_product_variants in share row exclusive mode;
lock table public.catalog_option_groups in share row exclusive mode;
lock table public.catalog_options in share row exclusive mode;
lock table public.catalog_variant_options in share row exclusive mode;

-- The charger rows define the public 5A/10A variants. Hidden rows also hide
-- their relationship records under the existing catalog RLS policy, so make
-- only these two configuration mirrors active. UI and checkout rules continue
-- to prevent them from being submitted as standalone options.
do $preflight$
declare
  lymow_product_id uuid;
begin
  select id into strict lymow_product_id
  from public.catalog_products
  where slug = 'lymow-one-plus'
    and brand = 'Lymow';

  if (
    select count(*)
    from public.catalog_product_variants
    where product_id = lymow_product_id
      and variant_slug in ('lymow-one-plus-5a', 'lymow-one-plus-10a')
  ) <> 2 then
    raise exception 'Expected exactly two Lymow checkout variants.';
  end if;

  if (
    select count(*)
    from public.catalog_options option
    join public.catalog_option_groups option_group
      on option_group.id = option.option_group_id
    where option.product_id = lymow_product_id
      and option.option_slug in ('lymow-5a-charger', 'lymow-10a-charger')
      and option_group.product_id = lymow_product_id
      and option_group.group_slug = 'lymow-charger-config'
  ) <> 2 then
    raise exception 'Expected exactly two Lymow charger configurations in the charger group.';
  end if;

  if exists (
    select 1
    from public.catalog_variant_options link
    join public.catalog_product_variants variant on variant.id = link.variant_id
    join public.catalog_options option on option.id = link.option_id
    where variant.product_id = lymow_product_id
      and option.product_id = lymow_product_id
      and option.option_slug in ('lymow-5a-charger', 'lymow-10a-charger')
      and not (
        link.relationship_type = 'defines_variant'
        and (
          (variant.variant_slug = 'lymow-one-plus-5a' and option.option_slug = 'lymow-5a-charger')
          or
          (variant.variant_slug = 'lymow-one-plus-10a' and option.option_slug = 'lymow-10a-charger')
        )
      )
  ) then
    raise exception 'Conflicting Lymow charger relationship requires manual review.';
  end if;
end
$preflight$;

with lymow_product as (
  select id
  from public.catalog_products
  where slug = 'lymow-one-plus'
    and brand = 'Lymow'
)
update public.catalog_options option
set public_status = 'active',
    updated_at = now()
from lymow_product product
where option.product_id = product.id
  and option.option_slug in ('lymow-5a-charger', 'lymow-10a-charger')
  and option.public_status is distinct from 'active';

with lymow_product as (
  select id
  from public.catalog_products
  where slug = 'lymow-one-plus'
    and brand = 'Lymow'
),
expected_links(variant_slug, option_slug) as (
  values
    ('lymow-one-plus-5a', 'lymow-5a-charger'),
    ('lymow-one-plus-10a', 'lymow-10a-charger')
),
resolved_links as (
  select variant.id as variant_id, option.id as option_id
  from lymow_product product
  join public.catalog_product_variants variant
    on variant.product_id = product.id
  join expected_links expected
    on expected.variant_slug = variant.variant_slug
  join public.catalog_options option
    on option.product_id = product.id
   and option.option_slug = expected.option_slug
)
insert into public.catalog_variant_options as existing (
  variant_id,
  option_id,
  relationship_type,
  quantity,
  updated_at
)
select variant_id, option_id, 'defines_variant', 1, now()
from resolved_links
on conflict (variant_id, option_id, relationship_type)
do update
set quantity = excluded.quantity,
    updated_at = now()
where existing.quantity is distinct from excluded.quantity;

commit;

-- Verification after separate approval to apply:
-- select v.variant_slug, o.option_slug, o.public_status, vo.relationship_type, vo.quantity
-- from public.catalog_variant_options vo
-- join public.catalog_product_variants v on v.id = vo.variant_id
-- join public.catalog_options o on o.id = vo.option_id
-- where v.variant_slug in ('lymow-one-plus-5a', 'lymow-one-plus-10a')
--   and o.option_slug in ('lymow-5a-charger', 'lymow-10a-charger')
-- order by v.variant_slug, o.option_slug;
