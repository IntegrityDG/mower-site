begin;

-- Add management metadata without changing existing public identities or states.
alter table public.catalog_products add column retired_at timestamptz,
  add column admin_managed boolean not null default false,
  add column catalog_category text not null default 'machine',
  add column compatibility text[] not null default '{}', add column image_url text;
alter table public.catalog_product_variants add column retired_at timestamptz,
  add column catalog_category text not null default 'configuration',
  add column compatibility text[] not null default '{}', add column image_url text;
alter table public.catalog_options add column retired_at timestamptz,
  add column catalog_category text not null default 'accessory',
  add column compatibility text[] not null default '{}';
alter table public.catalog_packages add column retired_at timestamptz,
  add column admin_managed boolean not null default false,
  add column core_selectable boolean not null default false,
  add column image_url text;

-- Retain the original option relationships; extend the same component table.
alter table public.catalog_package_items alter column option_id drop not null,
  add column component_product_id uuid references public.catalog_products(id) on delete restrict,
  add column component_variant_id uuid references public.catalog_product_variants(id) on delete restrict,
  add constraint catalog_package_items_one_component check
    (num_nonnulls(option_id, component_product_id, component_variant_id) = 1);
create unique index catalog_package_items_product_unique on public.catalog_package_items(package_id,component_product_id) where component_product_id is not null;
create unique index catalog_package_items_variant_unique on public.catalog_package_items(package_id,component_variant_id) where component_variant_id is not null;
create index catalog_package_items_product_idx on public.catalog_package_items(component_product_id) where component_product_id is not null;
create index catalog_package_items_variant_idx on public.catalog_package_items(component_variant_id) where component_variant_id is not null;
create index catalog_package_items_option_idx on public.catalog_package_items(option_id) where option_id is not null;
drop policy if exists "Public can read visible package items" on public.catalog_package_items;
create policy "Public reads visible package components" on public.catalog_package_items for select to anon,authenticated using (
  exists(select 1 from public.catalog_packages pkg join public.catalog_products p on p.id=pkg.product_id
    where pkg.id=package_id and pkg.public_status<>'hidden' and pkg.retired_at is null and p.public_status<>'hidden' and p.retired_at is null)
);
-- Keep required relation rows visible when a component is hidden. The component
-- entity's own RLS hides its content; the resolver sees a missing component and
-- blocks purchase instead of silently dropping it from the package.
drop policy if exists "Public can read visible variant option links" on public.catalog_variant_options;
create policy "Public can read visible variant component links" on public.catalog_variant_options for select to anon,authenticated using (
  exists(select 1 from public.catalog_product_variants v join public.catalog_products p on p.id=v.product_id
    where v.id=variant_id and v.public_status<>'hidden' and v.retired_at is null and p.public_status<>'hidden' and p.retired_at is null)
);
-- Required/defining/included links remain visible if an option is hidden, so
-- variant component availability also fails closed without exposing its data.

alter table public.catalog_package_core_prices add column display_msrp_price_cents integer
  check(display_msrp_price_cents is null or display_msrp_price_cents>=0);
alter table public.catalog_package_core_prices drop constraint catalog_package_core_prices_check;
alter table public.catalog_package_core_prices add constraint catalog_package_core_prices_price_mode_values check (
  price_mode='core_specific' or (price_mode='package' and regular_price_cents is null and display_msrp_price_cents is null
    and sale_price_cents is null and sale_starts_at is null and sale_ends_at is null and promotion_label is null)
);
grant select(display_msrp_price_cents) on public.catalog_package_core_prices to anon,authenticated;

alter table catalog_private.catalog_internal_pricing add column package_core_price_id uuid
  references public.catalog_package_core_prices(id) on delete cascade;
alter table catalog_private.catalog_internal_pricing drop constraint catalog_internal_pricing_check1;
alter table catalog_private.catalog_internal_pricing add constraint catalog_internal_pricing_one_target check
  (num_nonnulls(product_id,variant_id,option_id,package_id,service_id,product_service_id,package_core_price_id)=1);
create unique index catalog_internal_pricing_core_unique on catalog_private.catalog_internal_pricing(package_core_price_id) where package_core_price_id is not null;
alter table catalog_private.catalog_internal_pricing force row level security;
revoke all on catalog_private.catalog_internal_pricing from public,anon,authenticated;
create trigger catalog_internal_pricing_audit after insert or update or delete on catalog_private.catalog_internal_pricing
  for each row execute function catalog_private.capture_catalog_pricing_change('dealer-costs');
create trigger catalog_package_items_audit after insert or update or delete on public.catalog_package_items
  for each row execute function catalog_private.capture_catalog_pricing_change('package-components');

-- One transaction locks the authoritative row, applies a partial change, and
-- writes its private cost/components. No customer role can call this RPC.
create function public.admin_manage_catalog(p_kind text,p_id uuid,p_expected_updated_at timestamptz,p_values jsonb,
  p_components jsonb default null,p_allow_inactive_components boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  table_name text; target_column text; allowed text[]; key_name text; columns_sql text; values_sql text;
  assignments text; existing jsonb; result_row jsonb; values_row jsonb; target_id uuid; cost_id uuid;
  component jsonb; component_table text; component_row jsonb; component_id uuid; parent_id uuid;
  core_row record; core_prices jsonb; now_value timestamptz := clock_timestamp();
  core_availability text; core_expected timestamptz; y40_row public.catalog_product_variants;
  y40_package_row public.catalog_package_core_prices;
  bundle_family public.catalog_products;
begin
  case p_kind
    when 'products' then table_name:='catalog_products'; target_column:='product_id';
    when 'yarbo-y40-core' then table_name:='catalog_products'; target_column:='product_id';
    when 'variants' then table_name:='catalog_product_variants'; target_column:='variant_id';
    when 'options' then table_name:='catalog_options'; target_column:='option_id';
    when 'packages' then table_name:='catalog_packages'; target_column:='package_id';
    when 'yarbo-y40-package' then table_name:='catalog_packages'; target_column:='package_id';
    when 'package-core-prices' then table_name:='catalog_package_core_prices'; target_column:='package_core_price_id';
    else raise exception 'Unknown catalog kind';
  end case;
  if jsonb_typeof(p_values) is distinct from 'object' then raise exception 'Catalog values must be an object'; end if;
  allowed:=array['display_msrp_price_cents','regular_price_cents','sale_price_cents','sale_starts_at','sale_ends_at','promotion_label','show_public_price','contact_for_pricing','public_status'];
  if p_kind='products' then allowed:=allowed||array['name','slug','brand','full_description','homepage_summary','catalog_category','compatibility','image_url','admin_managed'];
  elsif p_kind='variants' then allowed:=allowed||array['name','variant_slug','product_id','description','catalog_category','compatibility','image_url','preorder_enabled'];
  elsif p_kind='options' then allowed:=allowed||array['name','option_slug','product_id','description','catalog_category','compatibility','accessory_image_url','accessory_image_alt','admin_managed','accessory_listing_enabled','accessory_tab','accessory_action_type','show_in_builder','manufacturer_name'];
  elsif p_kind='packages' then allowed:=allowed||array['package_name','package_slug','product_id','description','image_url','admin_managed','core_selectable'];
  end if;
  core_prices:=p_values->'core_prices';
  values_row:=p_values-'dealer_cost_cents'-'core_prices'-'core_availability_expected_updated_at'-'use_catalog_bundle_family';
  if coalesce((p_values->>'use_catalog_bundle_family')::boolean,false) then
    if p_kind<>'packages' or p_id is not null then raise exception 'Bundle family can only anchor a new package'; end if;
    insert into public.catalog_products(slug,brand,name,public_status,catalog_category,admin_managed,show_public_price,contact_for_pricing)
      values('ids-catalog-bundles','IDS','Catalog Bundles','active','catalog_family',false,false,true)
      on conflict(slug) do nothing;
    select * into strict bundle_family from public.catalog_products where slug='ids-catalog-bundles' for share;
    if bundle_family.catalog_category<>'catalog_family' or bundle_family.brand<>'IDS' or bundle_family.retired_at is not null or bundle_family.public_status<>'active' then raise exception 'Generic catalog bundle family is unavailable'; end if;
    values_row:=values_row||jsonb_build_object('product_id',bundle_family.id);
  end if;
  if p_kind in ('yarbo-y40-core','yarbo-y40-package') then
    core_availability:=p_values->>'public_status';
    core_expected:=(p_values->>'core_availability_expected_updated_at')::timestamptz;
    values_row:=values_row-'public_status';
  end if;
  for key_name in select jsonb_object_keys(values_row) loop
    if not key_name=any(allowed) then raise exception 'Unknown catalog property: %',key_name; end if;
  end loop;
  if p_id is not null then
    if p_expected_updated_at is null then raise exception using errcode='40001',message='A current catalog version is required'; end if;
    execute format('select to_jsonb(t) from public.%I t where id=$1 for update',table_name) into existing using p_id;
    if existing is null then raise exception using errcode='P0002',message='Catalog record not found'; end if;
    if (existing->>'updated_at')::timestamptz<>p_expected_updated_at then raise exception using errcode='40001',message='Catalog changed. Reload before saving.'; end if;
    if existing->>'retired_at' is not null then raise exception 'Retired catalog records cannot be edited'; end if;
    if values_row ? 'product_id' or values_row ? 'admin_managed' then raise exception 'Catalog ownership cannot be changed'; end if;
  elsif p_kind='package-core-prices' then raise exception 'Create Core contexts through the logical package';
  end if;
  if p_kind='yarbo-y40-core' then
    if p_id is null or existing->>'slug'<>'yarbo' then raise exception 'Y40 Core requires the existing Yarbo authority'; end if;
    if core_availability is not null then
      select * into strict y40_row from public.catalog_product_variants where product_id=p_id and variant_slug='yarbo-y40' for update;
      if core_expected is null or y40_row.updated_at<>core_expected then raise exception using errcode='40001',message='Core availability changed. Reload before saving.'; end if;
      update public.catalog_product_variants set public_status=core_availability,updated_at=now_value where id=y40_row.id;
    end if;
  end if;
  if p_kind='yarbo-y40-package' then
    if p_id is null or not exists(select 1 from public.catalog_products where id=(existing->>'product_id')::uuid and slug='yarbo') then raise exception 'Y40 package requires the existing Yarbo authority'; end if;
    if core_availability is not null then
      select cp.* into strict y40_package_row from public.catalog_package_core_prices cp join public.catalog_product_variants v on v.id=cp.core_variant_id where cp.package_id=p_id and v.variant_slug='yarbo-y40' for update of cp;
      if core_expected is null or y40_package_row.updated_at<>core_expected then raise exception using errcode='40001',message='Core availability changed. Reload before saving.'; end if;
      update public.catalog_package_core_prices set public_status=core_availability,updated_at=now_value where id=y40_package_row.id;
    end if;
  end if;
  target_id:=coalesce(p_id,gen_random_uuid());
  values_row:=values_row||jsonb_build_object('updated_at',now_value);
  if p_id is null then
    values_row:=values_row||jsonb_build_object('id',target_id);
    select string_agg(format('%I',k),','),string_agg(format('(jsonb_populate_record(null::public.%I,$1)).%I',table_name,k),',')
      into columns_sql,values_sql from jsonb_object_keys(values_row) keys(k);
    execute format('insert into public.%I(%s) select %s returning to_jsonb(%I.*)',table_name,columns_sql,values_sql,table_name) into result_row using values_row;
  else
    select string_agg(format('%I=(jsonb_populate_record(null::public.%I,$1)).%I',k,table_name,k),',')
      into assignments from jsonb_object_keys(values_row) keys(k);
    execute format('update public.%I set %s where id=$2 returning to_jsonb(%I.*)',table_name,assignments,table_name) into result_row using values_row,target_id;
  end if;
  if p_values ? 'dealer_cost_cents' then
    execute format('select id from catalog_private.catalog_internal_pricing where %I=$1 order by updated_at desc limit 1 for update',target_column) into cost_id using target_id;
    if cost_id is not null then
      update catalog_private.catalog_internal_pricing set dealer_cost_cents=(p_values->>'dealer_cost_cents')::integer,updated_at=now_value where id=cost_id;
    else
      execute format('insert into catalog_private.catalog_internal_pricing(%I,dealer_cost_cents) values($1,$2)',target_column) using target_id,(p_values->>'dealer_cost_cents')::integer;
    end if;
  end if;
  if p_components is not null then
    if p_kind<>'packages' or jsonb_typeof(p_components)<>'array' or jsonb_array_length(p_components)=0 then raise exception 'A package requires components'; end if;
    if exists(select 1 from jsonb_array_elements(p_components) c group by c->>'kind',c->>'id' having count(*)>1) then raise exception 'Duplicate package component'; end if;
    parent_id:=(result_row->>'product_id')::uuid;
    for component in select * from jsonb_array_elements(p_components) loop
      component_table:=case component->>'kind' when 'products' then 'catalog_products' when 'variants' then 'catalog_product_variants' when 'options' then 'catalog_options' else null end;
      if component_table is null or (component->>'quantity')::integer not between 1 and 100 then raise exception 'Invalid package component'; end if;
      component_id:=(component->>'id')::uuid;
      execute format('select to_jsonb(t) from public.%I t where id=$1 for share',component_table) into component_row using component_id;
      if component_row is null or component_row->>'retired_at' is not null then raise exception 'Package component is missing or retired'; end if;
      if component_row->>'public_status'<>'active' and not p_allow_inactive_components then raise exception 'Inactive components require an explicit override'; end if;
      if component_table='catalog_products' and component_row->>'slug'='yarbo' and (component->>'quantity')::integer<>1 then raise exception 'One logical Yarbo Core is required'; end if;
      if component_table='catalog_products' and component_row->>'catalog_category'='catalog_family' then raise exception 'A catalog family is not a sellable component'; end if;
      if coalesce((result_row->>'core_selectable')::boolean,false) and component_table='catalog_product_variants'
        and component_row->>'variant_slug' in ('yarbo-y40','yarbo-y40p') then raise exception 'Use one logical Yarbo Core, not a physical Core variant'; end if;
      if component_table='catalog_options' and exists(
        select 1 from public.catalog_variant_options vo
        where vo.option_id=component_id and vo.relationship_type='excluded'
          and (vo.variant_id in (select (c->>'id')::uuid from jsonb_array_elements(p_components) c where c->>'kind'='variants')
            or (coalesce((result_row->>'core_selectable')::boolean,false)
              and vo.variant_id in(select id from public.catalog_product_variants where product_id=parent_id and variant_slug in ('yarbo-y40','yarbo-y40p'))))
      ) then raise exception 'A package component is incompatible with a selected configuration'; end if;
      if component_table='catalog_product_variants' and exists(select 1 from jsonb_array_elements(p_components) c where c->>'kind'='products' and c->>'id'=component_row->>'product_id') then raise exception 'Select a machine or its configuration, not both'; end if;
    end loop;
    delete from public.catalog_package_items where package_id=target_id;
    for component in select * from jsonb_array_elements(p_components) loop
      component_id:=(component->>'id')::uuid;
      -- package.product_id and the two Core relationships explicitly store the
      -- logical Yarbo base. It must not create a second physical Core line.
      if component->>'kind'='products' and component_id=parent_id and (result_row->>'core_selectable')::boolean then continue; end if;
      insert into public.catalog_package_items(package_id,option_id,component_product_id,component_variant_id,quantity)
      values(target_id,case when component->>'kind'='options' then component_id end,
        case when component->>'kind'='products' then component_id end,
        case when component->>'kind'='variants' then component_id end,(component->>'quantity')::integer);
    end loop;
  end if;
  if p_kind='packages' and coalesce((result_row->>'core_selectable')::boolean,false) then
    if not exists(select 1 from public.catalog_products where id=(result_row->>'product_id')::uuid and slug='yarbo') then raise exception 'Core-selectable package must belong to Yarbo'; end if;
    for core_row in select id,variant_slug from public.catalog_product_variants where product_id=(result_row->>'product_id')::uuid and variant_slug in ('yarbo-y40','yarbo-y40p') loop
      insert into public.catalog_package_core_prices(product_id,package_id,core_variant_id,price_mode)
      values((result_row->>'product_id')::uuid,target_id,core_row.id,case when core_row.variant_slug='yarbo-y40' then 'package' else 'core_specific' end)
      on conflict(package_id,core_variant_id) do nothing;
      if core_row.variant_slug='yarbo-y40p' and core_prices ? 'y40p' then
        perform public.admin_manage_catalog('package-core-prices',cp.id,cp.updated_at,core_prices->'y40p')
          from public.catalog_package_core_prices cp where cp.package_id=target_id and cp.core_variant_id=core_row.id;
      end if;
    end loop;
  end if;
  return result_row;
end $$;
revoke all on function public.admin_manage_catalog(text,uuid,timestamptz,jsonb,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.admin_manage_catalog(text,uuid,timestamptz,jsonb,jsonb,boolean) to service_role;

create function public.admin_catalog_dependencies(p_kind text,p_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select jsonb_build_object('packages',coalesce((
    select jsonb_agg(jsonb_build_object('id',p.id,'name',p.package_name,'updatedAt',p.updated_at) order by p.package_name)
    from public.catalog_packages p where p.retired_at is null and p.public_status='active' and p.id<>p_id and (
      (p_kind='products' and p.product_id=p_id) or exists(select 1 from public.catalog_package_items i where i.package_id=p.id and (
        (p_kind='options' and i.option_id=p_id) or (p_kind='variants' and i.component_variant_id=p_id)
        or (p_kind='products' and (i.component_product_id=p_id or i.option_id in(select id from public.catalog_options where product_id=p_id)
          or i.component_variant_id in(select id from public.catalog_product_variants where product_id=p_id)))
      )) or (p_kind='variants' and exists(select 1 from public.catalog_package_core_prices cp where cp.package_id=p.id and cp.core_variant_id=p_id))
    )), '[]'::jsonb),
    'historicalReferences',exists(select 1 from checkout_private.order_items o where
      case p_kind when 'products' then o.product_id=p_id when 'variants' then o.variant_id=p_id when 'options' then o.option_id=p_id when 'packages' then o.package_id=p_id else false end
      or o.metadata_snapshot::text like '%'||p_id::text||'%')
      or exists(select 1 from checkout_private.orders o where o.pricing_snapshot::text like '%'||p_id::text||'%')
      or exists(select 1 from checkout_private.custom_invoice_items i where i.catalog_id=p_id or i.catalog_parent_id=p_id)
  );
$$;
revoke all on function public.admin_catalog_dependencies(text,uuid) from public,anon,authenticated;
grant execute on function public.admin_catalog_dependencies(text,uuid) to service_role;

create function public.admin_retire_catalog(p_kind text,p_id uuid,p_expected_updated_at timestamptz,p_retire_dependencies boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare table_name text; row_value jsonb; deps jsonb; dependent_ids uuid[]; timestamp_value timestamptz:=clock_timestamp();
begin
  table_name:=case p_kind when 'products' then 'catalog_products' when 'variants' then 'catalog_product_variants' when 'options' then 'catalog_options' when 'packages' then 'catalog_packages' else null end;
  if table_name is null then raise exception 'Unknown catalog kind'; end if;
  -- Synchronize package creation/component replacement against retirement.
  lock table public.catalog_package_items in share row exclusive mode;
  lock table public.catalog_packages in share row exclusive mode;
  execute format('select to_jsonb(t) from public.%I t where id=$1 for update',table_name) into row_value using p_id;
  if row_value is null then raise exception using errcode='P0002',message='Catalog record not found'; end if;
  if p_expected_updated_at is null or (row_value->>'updated_at')::timestamptz<>p_expected_updated_at then raise exception using errcode='40001',message='Catalog changed. Reload before deleting.'; end if;
  deps:=public.admin_catalog_dependencies(p_kind,p_id);
  if jsonb_array_length(deps->'packages')>0 and not p_retire_dependencies then raise exception using errcode='23503',message='Confirm retirement of dependent packages'; end if;
  select array_agg((d->>'id')::uuid) into dependent_ids from jsonb_array_elements(deps->'packages') d;
  update public.catalog_packages set retired_at=timestamp_value,public_status='hidden',updated_at=timestamp_value where id=any(coalesce(dependent_ids,'{}'::uuid[]));
  update public.catalog_package_core_prices set public_status='hidden',updated_at=timestamp_value where package_id=any(coalesce(dependent_ids,'{}'::uuid[])) or (p_kind='packages' and package_id=p_id);
  execute format('update public.%I set retired_at=$2,public_status=''hidden'',updated_at=$2 where id=$1',table_name) using p_id,timestamp_value;
  if p_kind='products' then
    update public.catalog_options set retired_at=timestamp_value,public_status='hidden',updated_at=timestamp_value where product_id=p_id;
    update public.catalog_product_variants set retired_at=timestamp_value,public_status='hidden',updated_at=timestamp_value where product_id=p_id;
    update public.catalog_packages set retired_at=timestamp_value,public_status='hidden',updated_at=timestamp_value where product_id=p_id;
    update public.catalog_package_core_prices set public_status='hidden',updated_at=timestamp_value where product_id=p_id;
  end if;
  update catalog_private.catalog_source_targets set is_active=false,updated_at=timestamp_value where
    (p_kind='products' and (product_id=p_id
      or variant_id in(select id from public.catalog_product_variants where product_id=p_id)
      or option_id in(select id from public.catalog_options where product_id=p_id)
      or package_id in(select id from public.catalog_packages where product_id=p_id)))
    or (p_kind='variants' and variant_id=p_id) or (p_kind='options' and option_id=p_id) or (p_kind='packages' and package_id=p_id)
    or package_id=any(coalesce(dependent_ids,'{}'::uuid[]));
  return deps||jsonb_build_object('retired',true);
end $$;
revoke all on function public.admin_retire_catalog(text,uuid,timestamptz,boolean) from public,anon,authenticated;
grant execute on function public.admin_retire_catalog(text,uuid,timestamptz,boolean) to service_role;

-- Preserve each checkout RPC's existing payment/idempotency behavior while
-- persisting generalized component FKs and the immutable component snapshot.
do $upgrade$ declare signature text; definition text; modified text; begin
  foreach signature in array array['public.checkout_create_card_draft(text,text,jsonb,jsonb)','public.checkout_create_ach_draft(text,text,jsonb,jsonb)','public.checkout_create_wire_draft(text,text,jsonb,jsonb)'] loop
    definition:=pg_get_functiondef(signature::regprocedure);
    if position($$case when item->>'itemType'='product' then$$ in definition)=0
      or position($$case when item->>'itemType'='variant' then$$ in definition)=0
      or position($$case when item->>'itemType' in ('option','package_component') then$$ in definition)=0
      or position($$::boolean,'{}');$$ in definition)=0 then
      raise exception 'Checkout snapshot persistence pattern changed: %',signature;
    end if;
    modified:=replace(definition, $$case when item->>'itemType'='product' then$$, $$case when item->>'itemType'='product' or (item->>'itemType'='package_component' and item->>'componentSourceType'='product') then$$);
    modified:=replace(modified, $$case when item->>'itemType'='variant' then$$, $$case when item->>'itemType'='variant' or (item->>'itemType'='package_component' and item->>'componentSourceType'='variant') then$$);
    modified:=replace(modified, $$case when item->>'itemType' in ('option','package_component') then$$, $$case when item->>'itemType'='option' or (item->>'itemType'='package_component' and coalesce(item->>'componentSourceType','option')='option') then$$);
    modified:=replace(modified, $$::boolean,'{}');$$, $$::boolean,item);$$);
    if modified=definition then raise exception 'Checkout snapshot persistence pattern changed: %',signature; end if;
    execute modified;
  end loop;
end $upgrade$;

commit;
