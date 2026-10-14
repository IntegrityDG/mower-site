begin;

-- Keep package pricing authoritative. One RPC transaction guards both source
-- versions and delegates package prices/costs to the existing audited writer.
create function public.admin_update_y40_package_pricing(
  p_id uuid, p_expected_updated_at timestamptz, p_values jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  package_row public.catalog_packages;
  relationship_row public.catalog_package_core_prices;
  relationship_expected timestamptz;
  result_row jsonb;
  field_name text;
  changes_relationship boolean;
begin
  if jsonb_typeof(p_values) is distinct from 'object' then
    raise exception 'Catalog values must be an object';
  end if;
  foreach field_name in array array['core_show_public_price','core_contact_for_pricing'] loop
    if p_values ? field_name and jsonb_typeof(p_values->field_name) <> 'boolean' then
      raise exception 'Y40 relationship visibility controls must be boolean';
    end if;
  end loop;

  -- Match the existing writer's package -> relationship lock order.
  select * into package_row from public.catalog_packages where id=p_id for update;
  if not found or package_row.retired_at is not null or not package_row.core_selectable
    or not exists(select 1 from public.catalog_products where id=package_row.product_id and slug='yarbo') then
    raise exception using errcode='P0002',message='Y40 package not found';
  end if;
  if p_expected_updated_at is null or package_row.updated_at <> p_expected_updated_at then
    raise exception using errcode='40001',message='Catalog changed. Reload before saving.';
  end if;
  select cp.* into relationship_row
    from public.catalog_package_core_prices cp
    join public.catalog_product_variants v on v.id=cp.core_variant_id
    where cp.package_id=p_id and cp.product_id=package_row.product_id
      and cp.price_mode='package' and v.variant_slug='yarbo-y40'
    for update of cp;
  if not found then raise exception using errcode='P0002',message='Y40 relationship not found'; end if;
  changes_relationship := p_values ? 'public_status' or p_values ? 'core_show_public_price' or p_values ? 'core_contact_for_pricing';
  if changes_relationship then
    relationship_expected := (p_values->>'core_availability_expected_updated_at')::timestamptz;
    if relationship_expected is null or relationship_row.updated_at <> relationship_expected then
      raise exception using errcode='40001',message='Core availability changed. Reload before saving.';
    end if;
  end if;

  result_row := public.admin_manage_catalog('yarbo-y40-package',p_id,p_expected_updated_at,
    p_values-'core_show_public_price'-'core_contact_for_pricing');
  if p_values ? 'core_show_public_price' or p_values ? 'core_contact_for_pricing' then
    update public.catalog_package_core_prices set
      show_public_price=case when p_values ? 'core_show_public_price' then (p_values->>'core_show_public_price')::boolean else show_public_price end,
      contact_for_pricing=case when p_values ? 'core_contact_for_pricing' then (p_values->>'core_contact_for_pricing')::boolean else contact_for_pricing end,
      updated_at=clock_timestamp()
    where id=relationship_row.id;
  end if;
  return result_row;
end $$;

revoke all on function public.admin_update_y40_package_pricing(uuid,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.admin_update_y40_package_pricing(uuid,timestamptz,jsonb) to service_role;

commit;
