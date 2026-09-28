-- Pandag stays quote-only, but its accessory listings can use the same catalog.
alter table public.catalog_options
  drop constraint if exists catalog_options_accessory_tab_check;
alter table public.catalog_options
  add constraint catalog_options_accessory_tab_check
  check (accessory_tab is null or accessory_tab in ('lymow', 'yarbo', 'pandag', 'aftermarket'));

-- The admin server is the only caller. Each relationship update is atomic and
-- cannot reassign an accessory to a variant or package of another product.
create or replace function public.save_accessory_relationships(
  accessory_id uuid,
  variant_relationships jsonb default null,
  package_relationships jsonb default null
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_product_id uuid;
begin
  select product_id into target_product_id
  from public.catalog_options
  where id = accessory_id and admin_managed and accessory_tab is not null
  for update;
  if target_product_id is null then
    raise exception 'Accessory not found';
  end if;

  if variant_relationships is not null then
    if jsonb_typeof(variant_relationships) <> 'array' then
      raise exception 'Invalid variant relationships';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(variant_relationships) as entry
      left join public.catalog_product_variants as variant
        on variant.id = (entry->>'variantId')::uuid
      where variant.product_id is distinct from target_product_id
        or entry->>'relationshipType' not in ('compatible', 'included', 'required', 'excluded')
    ) or (
      select count(*) <> count(distinct entry->>'variantId')
      from jsonb_array_elements(variant_relationships) as entry
    ) then
      raise exception 'Invalid variant relationships';
    end if;
    delete from public.catalog_variant_options
    where option_id = accessory_id and relationship_type <> 'defines_variant';
    insert into public.catalog_variant_options(variant_id, option_id, relationship_type)
    select (entry->>'variantId')::uuid, accessory_id, entry->>'relationshipType'
    from jsonb_array_elements(variant_relationships) as entry;
  end if;

  if package_relationships is not null then
    if jsonb_typeof(package_relationships) <> 'array' then
      raise exception 'Invalid package relationships';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(package_relationships) as entry
      left join public.catalog_packages as package
        on package.id = (entry->>'packageId')::uuid
      where package.product_id is distinct from target_product_id
        or (entry->>'quantity')::integer not between 1 and 10
        or jsonb_typeof(entry->'includedInPackagePrice') <> 'boolean'
    ) or (
      select count(*) <> count(distinct entry->>'packageId')
      from jsonb_array_elements(package_relationships) as entry
    ) then
      raise exception 'Invalid package relationships';
    end if;
    delete from public.catalog_package_items where option_id = accessory_id;
    insert into public.catalog_package_items(package_id, option_id, quantity, included_in_package_price)
    select (entry->>'packageId')::uuid, accessory_id,
      (entry->>'quantity')::integer, (entry->>'includedInPackagePrice')::boolean
    from jsonb_array_elements(package_relationships) as entry;
  end if;
end;
$$;
revoke all on function public.save_accessory_relationships(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.save_accessory_relationships(uuid, jsonb, jsonb) to service_role;
