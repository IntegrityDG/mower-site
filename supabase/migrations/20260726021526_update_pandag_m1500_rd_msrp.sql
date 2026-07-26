begin;

do $$
begin
  if not exists (
    select 1
    from public.catalog_product_variants
    where id = '9fcc8558-576b-4df7-93bd-12ceff29dcb2'
      and variant_slug = 'pandag-g1-m1500-rd'
      and name = 'Pandag G1 M1500 RD'
      and regular_price_cents = 2466000
      and sale_price_cents is null
      and show_public_price = false
      and contact_for_pricing = true
  ) then
    raise exception 'Expected current Pandag G1 M1500 RD pricing record was not found';
  end if;
end
$$;

update public.catalog_product_variants
set regular_price_cents = 2666000,
    updated_at = now()
where id = '9fcc8558-576b-4df7-93bd-12ceff29dcb2'
  and variant_slug = 'pandag-g1-m1500-rd'
  and name = 'Pandag G1 M1500 RD'
  and regular_price_cents = 2466000
  and sale_price_cents is null
  and show_public_price = false
  and contact_for_pricing = true;

do $$
begin
  if not exists (
    select 1
    from public.catalog_product_variants
    where id = '9fcc8558-576b-4df7-93bd-12ceff29dcb2'
      and variant_slug = 'pandag-g1-m1500-rd'
      and name = 'Pandag G1 M1500 RD'
      and regular_price_cents = 2666000
      and sale_price_cents is null
      and show_public_price = false
      and contact_for_pricing = true
  ) then
    raise exception 'Pandag G1 M1500 RD MSRP update verification failed';
  end if;
end
$$;

commit;

-- Read-only verification query (run only after separate migration approval).
select id, variant_slug, name, regular_price_cents, sale_price_cents,
       show_public_price, contact_for_pricing, updated_at
from public.catalog_product_variants
where id = '9fcc8558-576b-4df7-93bd-12ceff29dcb2';

-- Rollback (NOT EXECUTED):
-- begin;
-- update public.catalog_product_variants
-- set regular_price_cents = 2466000,
--     updated_at = now()
-- where id = '9fcc8558-576b-4df7-93bd-12ceff29dcb2'
--   and variant_slug = 'pandag-g1-m1500-rd'
--   and name = 'Pandag G1 M1500 RD'
--   and regular_price_cents = 2666000
--   and sale_price_cents is null
--   and show_public_price = false
--   and contact_for_pricing = true;
-- commit;
