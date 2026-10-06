-- Execute inside a caller-owned transaction after the forward grant repair.
-- This performs actual reads under browser roles; it has no persistent writes.
-- Caller rolls back after dry-run, or wraps in BEGIN READ ONLY ... ROLLBACK
-- when checking the already applied schema. No customer rows are selected.

set local role anon;
do $anon_smoke$
begin
  perform id, public_status, preorder_enabled, retired_at, catalog_category, compatibility, image_url
    from public.catalog_product_variants where retired_at is null;
  if not exists(select 1 from public.catalog_product_variants where variant_slug='yarbo-y40' and retired_at is null)
    or not exists(select 1 from public.catalog_product_variants where variant_slug='yarbo-y40p' and retired_at is null)
    then raise exception 'Anonymous catalog Core read failed'; end if;
  -- Exercise relationship policies that themselves read variant metadata.
  perform id,variant_id,option_id,relationship_type from public.catalog_variant_options;
  perform id,package_id,option_id,component_product_id,component_variant_id,quantity from public.catalog_package_items;
  perform id,package_id,core_variant_id,display_msrp_price_cents from public.catalog_package_core_prices;
  begin
    perform dealer_cost_cents from catalog_private.catalog_internal_pricing limit 1;
    raise exception 'Anonymous private dealer-cost SELECT unexpectedly permitted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_catalog_dependencies('products',gen_random_uuid());
    raise exception 'Anonymous admin dependency RPC unexpectedly permitted';
  exception when insufficient_privilege then null;
  end;
end $anon_smoke$;
reset role;

set local role authenticated;
do $authenticated_smoke$
begin
  perform id, public_status, preorder_enabled, retired_at, catalog_category, compatibility, image_url
    from public.catalog_product_variants where retired_at is null;
  if not exists(select 1 from public.catalog_product_variants where variant_slug='yarbo-y40' and retired_at is null)
    or not exists(select 1 from public.catalog_product_variants where variant_slug='yarbo-y40p' and retired_at is null)
    then raise exception 'Authenticated catalog Core read failed'; end if;
  perform id,variant_id,option_id,relationship_type from public.catalog_variant_options;
  perform id,package_id,option_id,component_product_id,component_variant_id,quantity from public.catalog_package_items;
  perform id,package_id,core_variant_id,display_msrp_price_cents from public.catalog_package_core_prices;
  begin
    perform dealer_cost_cents from catalog_private.catalog_internal_pricing limit 1;
    raise exception 'Authenticated private dealer-cost SELECT unexpectedly permitted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_catalog_dependencies('products',gen_random_uuid());
    raise exception 'Authenticated admin dependency RPC unexpectedly permitted';
  exception when insufficient_privilege then null;
  end;
end $authenticated_smoke$;
reset role;

select 'PASS: actual anon/authenticated catalog + relationship reads; private costs and admin RPC remain denied' as public_role_smoke_result;
