-- TRANSACTIONAL ROLLBACK ONLY. Append after both migrations inside a caller-
-- owned BEGIN ... ROLLBACK. No fixture, order, cost, or audit record may persist.
-- These are database assertions; they do not contact Stripe or send messages.
-- Root must supply TEMP yarbo_fall_dealer_costs(kind,slug,cost) from a private
-- release input outside Git and apply that cost stage before these assertions.

do $seed_assertions$
declare r record; actual jsonb; actual_cost integer; expected_cost integer; authorities integer:=0;
begin
  if to_regclass('pg_temp.yarbo_fall_dealer_costs') is null then raise exception 'Private expected cost input is required outside Git'; end if;
  for r in
    select 'products' kind,'yarbo' slug,399900 msrp,399900 sale
    union all select 'variants','yarbo-y40p',559900,559900
    union all select 'options','yarbo-snow-blower-module',220000,175000
    union all select 'options','yarbo-lawn-mower-pro-module',200000,160000
    union all select 'options','yarbo-leaf-blower-module',110000,85000
    union all select 'options','yarbo-trimmer-module',130000,100000
    union all select 'packages',slug,y40_msrp,y40_sale from yarbo_fall_packages
    union all select 'package-core-prices',slug,y40p_msrp,y40p_sale from yarbo_fall_packages
  loop
    actual:=null;
    case r.kind
      when 'products' then select to_jsonb(p) into strict actual from public.catalog_products p where slug=r.slug;
      when 'variants' then select to_jsonb(v) into strict actual from public.catalog_product_variants v join public.catalog_products p on p.id=v.product_id where p.slug='yarbo' and v.variant_slug=r.slug;
      when 'options' then select to_jsonb(o) into strict actual from public.catalog_options o join public.catalog_products p on p.id=o.product_id where p.slug='yarbo' and o.option_slug=r.slug;
      when 'packages' then select to_jsonb(pkg) into strict actual from public.catalog_packages pkg join public.catalog_products p on p.id=pkg.product_id where p.slug='yarbo' and pkg.package_slug=r.slug;
      when 'package-core-prices' then select to_jsonb(cp) into strict actual from public.catalog_package_core_prices cp join public.catalog_packages pkg on pkg.id=cp.package_id join public.catalog_product_variants v on v.id=cp.core_variant_id join public.catalog_products p on p.id=pkg.product_id where p.slug='yarbo' and pkg.package_slug=r.slug and v.variant_slug='yarbo-y40p';
    end case;
    if actual->>'regular_price_cents' is not null
      or (actual->>'display_msrp_price_cents')::integer is distinct from r.msrp
      or (actual->>'sale_price_cents')::integer is distinct from r.sale
      or (actual->>'sale_starts_at')::timestamptz is distinct from '2026-10-06T05:00:00Z'::timestamptz
      or (actual->>'sale_ends_at')::timestamptz is distinct from '2026-10-13T05:00:00Z'::timestamptz
      or actual->>'promotion_label' is distinct from 'Fall Sale' then raise exception 'Seed price/window mismatch: % %',r.kind,r.slug; end if;
    select dealer_cost_cents into strict actual_cost from catalog_private.catalog_internal_pricing ip where
      case r.kind when 'products' then ip.product_id=(actual->>'id')::uuid
        when 'variants' then ip.variant_id=(actual->>'id')::uuid
        when 'options' then ip.option_id=(actual->>'id')::uuid
        when 'packages' then ip.package_id=(actual->>'id')::uuid
        else ip.package_core_price_id=(actual->>'id')::uuid end;
    select cost into strict expected_cost from pg_temp.yarbo_fall_dealer_costs where kind=r.kind and slug=r.slug;
    if actual_cost is distinct from expected_cost then raise exception 'Seed private cost mismatch: % %',r.kind,r.slug; end if;
    authorities:=authorities+1;
  end loop;
  if authorities<>34 then raise exception 'Expected 34 seeded pricing authorities'; end if;
  if exists(select 1 from yarbo_fall_packages s join public.catalog_packages pkg on pkg.package_slug=s.slug join public.catalog_products p on p.id=pkg.product_id where p.slug='yarbo' and pkg.package_name is distinct from s.name) then raise exception 'Manufacturer package display names mismatch'; end if;
  if (select count(*) from public.catalog_packages pkg join public.catalog_products p on p.id=pkg.product_id where p.slug='yarbo' and pkg.public_status='active')<>14 then raise exception 'Public Yarbo logical package count changed'; end if;
  if (select count(*) from public.catalog_package_core_prices cp join public.catalog_packages pkg on pkg.id=cp.package_id join public.catalog_products p on p.id=pkg.product_id where p.slug='yarbo' and pkg.public_status='active')<>28 then raise exception 'Expected 28 Core contexts for 14 logical packages'; end if;
  if not exists(select 1 from public.catalog_product_variants v join public.catalog_products p on p.id=v.product_id where p.slug='yarbo' and v.variant_slug='yarbo-y40p' and v.public_status='coming_soon' and v.preorder_enabled) then raise exception 'Y40P preorder state was changed'; end if;
end $seed_assertions$;

do $fixture_assertions$
declare
  machine jsonb; battery jsonb; variant_parent jsonb; variant_row jsonb; bundle jsonb; revised jsonb; accessory_bundle jsonb; yarbo_accessory_id uuid;
  snapshot jsonb; draft jsonb; fixture_order uuid; fixture_orders uuid[]:='{}'; method text;
  historical_ids uuid[]; historical_item_ids uuid[]; original_orders_hash text; original_items_hash text; original_invoice_hash text;
  snapshot_hash text; deps jsonb; refused boolean; before_version timestamptz; y40 public.catalog_product_variants; y40p public.catalog_product_variants;
  yarbo public.catalog_products; original_y40p jsonb; original_yarbo_status text;
  package_row public.catalog_packages; cp_y40 public.catalog_package_core_prices; cp_y40p public.catalog_package_core_prices; original_cp_y40p jsonb;
  cost_audit_id bigint; fixture_suffix text:=replace(gen_random_uuid()::text,'-',''); discount_value integer;
begin
  select array_agg(id),md5(coalesce(jsonb_agg(to_jsonb(o) order by id)::text,'')) into historical_ids,original_orders_hash from checkout_private.orders o;
  select array_agg(id),md5(coalesce(jsonb_agg(to_jsonb(i) order by id)::text,'')) into historical_item_ids,original_items_hash from checkout_private.order_items i;
  select md5(coalesce(jsonb_agg(to_jsonb(i) order by id)::text,'')) into original_invoice_hash from checkout_private.custom_invoice_items i;
  machine:=public.admin_manage_catalog('products',null,null,jsonb_build_object('name','Rollback fixture machine','slug','rollback-machine-'||fixture_suffix,'brand','Rollback Test','catalog_category','machine','admin_managed',true,'public_status','active','regular_price_cents',12000,'dealer_cost_cents',7000,'show_public_price',true,'contact_for_pricing',false));
  battery:=public.admin_manage_catalog('options',null,null,jsonb_build_object('name','Rollback fixture battery','option_slug','rollback-battery-'||fixture_suffix,'product_id',machine->>'id','catalog_category','battery','public_status','active','regular_price_cents',5000,'dealer_cost_cents',3000,'show_public_price',true,'contact_for_pricing',false));
  variant_parent:=public.admin_manage_catalog('products',null,null,jsonb_build_object('name','Rollback second machine','slug','rollback-configurable-'||fixture_suffix,'brand','Second Test Brand','catalog_category','machine','admin_managed',true,'public_status','active'));
  variant_row:=public.admin_manage_catalog('variants',null,null,jsonb_build_object('name','Rollback fixture variant','variant_slug','rollback-variant-'||fixture_suffix,'product_id',variant_parent->>'id','public_status','active','regular_price_cents',13000,'show_public_price',true,'contact_for_pricing',false));
  bundle:=public.admin_manage_catalog('packages',null,null,jsonb_build_object('package_name','Rollback independent bundle','package_slug','rollback-bundle-'||fixture_suffix,'product_id',machine->>'id','admin_managed',true,'public_status','active','regular_price_cents',7700,'dealer_cost_cents',4400,'show_public_price',true,'contact_for_pricing',false),jsonb_build_array(jsonb_build_object('kind','products','id',machine->>'id','quantity',1),jsonb_build_object('kind','variants','id',variant_row->>'id','quantity',1),jsonb_build_object('kind','options','id',battery->>'id','quantity',2)));
  if (bundle->>'regular_price_cents')::integer<>7700 or (select sum(quantity) from public.catalog_package_items where package_id=(bundle->>'id')::uuid)<>4 then raise exception 'Package price independence or quantities failed'; end if;
  if (select count(*) from public.catalog_packages where package_slug='rollback-bundle-'||fixture_suffix)<>1 then raise exception 'Package creation duplicated a logical offering'; end if;
  if not exists(select 1 from catalog_private.catalog_pricing_change_audit where target_kind='dealer-costs' and after_values->>'package_id'=bundle->>'id') then raise exception 'New private cost was not audited'; end if;
  select o.id into strict yarbo_accessory_id from public.catalog_options o join public.catalog_products p on p.id=o.product_id where p.slug='yarbo' and o.option_slug='yarbo-tow-hitch' and o.public_status='active';
  accessory_bundle:=public.admin_manage_catalog('packages',null,null,jsonb_build_object('package_name','Rollback Yarbo accessory-only bundle','package_slug','rollback-accessory-bundle-'||fixture_suffix,'use_catalog_bundle_family',true,'admin_managed',true,'public_status','active','regular_price_cents',5000,'show_public_price',true,'contact_for_pricing',false),jsonb_build_array(jsonb_build_object('kind','options','id',yarbo_accessory_id,'quantity',2)));
  if not exists(select 1 from public.catalog_products where id=(accessory_bundle->>'product_id')::uuid and slug='ids-catalog-bundles' and catalog_category='catalog_family' and not admin_managed and not show_public_price and contact_for_pricing and regular_price_cents is null)
    or (accessory_bundle->>'core_selectable')::boolean or exists(select 1 from public.catalog_package_core_prices where package_id=(accessory_bundle->>'id')::uuid) then raise exception 'Accessory-only bundle incorrectly adds a Yarbo Core'; end if;
  select max(id) into cost_audit_id from catalog_private.catalog_pricing_change_audit;

  snapshot:=jsonb_build_object('currency','usd','subtotalCents',7700,'discountCents',0,'feeCents',0,'shippingCents',0,'taxCents',0,'totalCents',7700,'paymentMethod','card','pricedAt',clock_timestamp(),'product',jsonb_build_object('id',machine->>'id','name','Rollback fixture machine','slug',machine->>'slug'),
    'chargeableItems',jsonb_build_array(jsonb_build_object('itemType','package','sourceId',bundle->>'id','name','Original bundle name','description','Original bundle description','quantity',1,'unitAmountCents',7700,'extendedAmountCents',7700,'includedInPackagePrice',false)),
    'includedPackageComponents',jsonb_build_array(
      jsonb_build_object('itemType','package_component','componentSourceType','product','sourceId',machine->>'id','name','Original machine name','quantity',1,'unitAmountCents',0,'extendedAmountCents',0,'includedInPackagePrice',true,'parentSourceId',bundle->>'id'),
      jsonb_build_object('itemType','package_component','componentSourceType','variant','sourceId',variant_row->>'id','name','Original variant name','quantity',1,'unitAmountCents',0,'extendedAmountCents',0,'includedInPackagePrice',true,'parentSourceId',bundle->>'id'),
      jsonb_build_object('itemType','package_component','componentSourceType','option','sourceId',battery->>'id','name','Original battery name','quantity',2,'unitAmountCents',0,'extendedAmountCents',0,'includedInPackagePrice',true,'parentSourceId',bundle->>'id')));
  foreach method in array array['card','ach_debit','wire_transfer'] loop
    discount_value:=case when method in ('ach_debit','wire_transfer') then 212 else 0 end;
    snapshot:=snapshot||jsonb_build_object('paymentMethod',method,'discountCents',discount_value,'totalCents',7700-discount_value);
    case method
      when 'card' then draft:=public.checkout_create_card_draft('rollback-card-'||fixture_suffix,'rollback-fingerprint',jsonb_build_object('name','Rollback fixture customer','email','rollback-fixture@example.invalid'),snapshot);
      when 'ach_debit' then draft:=public.checkout_create_ach_draft('rollback-ach-'||fixture_suffix,'rollback-fingerprint',jsonb_build_object('name','Rollback fixture customer','email','rollback-fixture@example.invalid'),snapshot);
      else draft:=public.checkout_create_wire_draft('rollback-wire-'||fixture_suffix,'rollback-fingerprint',jsonb_build_object('name','Rollback fixture customer','email','rollback-fixture@example.invalid'),snapshot);
    end case;
    fixture_order:=(draft->>'orderId')::uuid; fixture_orders:=array_append(fixture_orders,fixture_order);
    if not exists(select 1 from checkout_private.order_items where order_id=fixture_order and item_type='package_component' and product_id=(machine->>'id')::uuid and option_id is null and metadata_snapshot->>'componentSourceType'='product')
      or not exists(select 1 from checkout_private.order_items where order_id=fixture_order and item_type='package_component' and variant_id=(variant_row->>'id')::uuid and option_id is null and metadata_snapshot->>'componentSourceType'='variant')
      or not exists(select 1 from checkout_private.order_items where order_id=fixture_order and item_type='package_component' and option_id=(battery->>'id')::uuid and quantity=2)
      then raise exception 'Generic component FK/snapshot persistence failed for %',method; end if;
  end loop;
  select md5(jsonb_agg(jsonb_build_object('order',to_jsonb(o),'items',(select jsonb_agg(to_jsonb(i) order by i.id) from checkout_private.order_items i where i.order_id=o.id)) order by o.id)::text) into snapshot_hash from checkout_private.orders o where o.id=any(fixture_orders);
  before_version:=(bundle->>'updated_at')::timestamptz;
  revised:=public.admin_manage_catalog('packages',(bundle->>'id')::uuid,before_version,jsonb_build_object('package_name','Renamed current catalog bundle','regular_price_cents',8000,'dealer_cost_cents',4500),jsonb_build_array(jsonb_build_object('kind','options','id',battery->>'id','quantity',3)));
  if not exists(select 1 from public.catalog_package_items where package_id=(bundle->>'id')::uuid and option_id=(battery->>'id')::uuid and quantity=3) then raise exception 'Editable package components failed'; end if;
  if not exists(select 1 from catalog_private.catalog_pricing_change_audit where id>cost_audit_id and target_kind='dealer-costs' and before_values->>'dealer_cost_cents'='4400' and after_values->>'dealer_cost_cents'='4500') then raise exception 'Updated private cost was not audited'; end if;
  refused:=false;
  begin perform public.admin_manage_catalog('packages',(bundle->>'id')::uuid,before_version,jsonb_build_object('regular_price_cents',1)); exception when serialization_failure then refused:=true; end;
  if not refused then raise exception 'Stale pricing write was accepted'; end if;

  select * into strict yarbo from public.catalog_products where slug='yarbo';
  select * into strict y40 from public.catalog_product_variants where product_id=yarbo.id and variant_slug='yarbo-y40';
  select * into strict y40p from public.catalog_product_variants where product_id=yarbo.id and variant_slug='yarbo-y40p';
  original_y40p:=to_jsonb(y40p); original_yarbo_status:=yarbo.public_status;
  perform public.admin_manage_catalog('yarbo-y40-core',yarbo.id,yarbo.updated_at,jsonb_build_object('public_status','unavailable','core_availability_expected_updated_at',y40.updated_at));
  if (select public_status from public.catalog_product_variants where id=y40.id)<>'unavailable'
    or (select to_jsonb(v) from public.catalog_product_variants v where id=y40p.id) is distinct from original_y40p
    or (select public_status from public.catalog_products where id=yarbo.id)<>original_yarbo_status then raise exception 'Y40 Core availability changed Y40P/global parent'; end if;
  refused:=false;
  begin perform public.admin_manage_catalog('yarbo-y40-core',yarbo.id,(select updated_at from public.catalog_products where id=yarbo.id),jsonb_build_object('public_status','active','core_availability_expected_updated_at',y40.updated_at)); exception when serialization_failure then refused:=true; end;
  if not refused then raise exception 'Stale Core availability write was accepted'; end if;
  select * into strict package_row from public.catalog_packages where product_id=yarbo.id and package_slug='yarbo-snow-blower';
  select cp.* into strict cp_y40 from public.catalog_package_core_prices cp where cp.package_id=package_row.id and cp.core_variant_id=y40.id;
  select cp.* into strict cp_y40p from public.catalog_package_core_prices cp where cp.package_id=package_row.id and cp.core_variant_id=y40p.id;
  original_cp_y40p:=to_jsonb(cp_y40p);
  perform public.admin_manage_catalog('yarbo-y40-package',package_row.id,package_row.updated_at,jsonb_build_object('public_status','unavailable','core_availability_expected_updated_at',cp_y40.updated_at));
  if (select public_status from public.catalog_package_core_prices where id=cp_y40.id)<>'unavailable'
    or (select to_jsonb(cp) from public.catalog_package_core_prices cp where id=cp_y40p.id) is distinct from original_cp_y40p
    or (select public_status from public.catalog_packages where id=package_row.id)<>package_row.public_status then raise exception 'Y40 package availability changed Y40P/logical parent'; end if;

  deps:=public.admin_catalog_dependencies('options',(battery->>'id')::uuid);
  if jsonb_array_length(deps->'packages')<>1 or not (deps->>'historicalReferences')::boolean then raise exception 'Dependency/historical warning failed'; end if;
  refused:=false;
  begin perform public.admin_retire_catalog('options',(battery->>'id')::uuid,(battery->>'updated_at')::timestamptz,false); exception when foreign_key_violation then refused:=true; end;
  if not refused or (select retired_at from public.catalog_options where id=(battery->>'id')::uuid) is not null then raise exception 'Unconfirmed dependent retirement was accepted'; end if;
  perform public.admin_retire_catalog('options',(battery->>'id')::uuid,(battery->>'updated_at')::timestamptz,true);
  if not exists(select 1 from public.catalog_options where id=(battery->>'id')::uuid and retired_at is not null and public_status='hidden')
    or not exists(select 1 from public.catalog_packages where id=(bundle->>'id')::uuid and retired_at is not null and public_status='hidden') then raise exception 'Intentional dependency retirement did not archive both offerings'; end if;
  if (select md5(jsonb_agg(jsonb_build_object('order',to_jsonb(o),'items',(select jsonb_agg(to_jsonb(i) order by i.id) from checkout_private.order_items i where i.order_id=o.id)) order by o.id)::text) from checkout_private.orders o where o.id=any(fixture_orders)) is distinct from snapshot_hash then raise exception 'Catalog edits/retirement changed transaction snapshots'; end if;

  refused:=false;
  begin insert into public.catalog_package_items(package_id,option_id,component_product_id,quantity) values((bundle->>'id')::uuid,(battery->>'id')::uuid,(machine->>'id')::uuid,1); exception when check_violation then refused:=true; end;
  if not refused then raise exception 'Ambiguous component identity was accepted'; end if;
  refused:=false;
  begin insert into public.catalog_package_items(package_id,component_product_id,quantity) values((bundle->>'id')::uuid,gen_random_uuid(),1); exception when foreign_key_violation then refused:=true; end;
  if not refused then raise exception 'Missing component FK was accepted'; end if;
  if (select md5(coalesce(jsonb_agg(to_jsonb(o) order by id)::text,'')) from checkout_private.orders o where id=any(historical_ids)) is distinct from original_orders_hash
    or (select md5(coalesce(jsonb_agg(to_jsonb(i) order by id)::text,'')) from checkout_private.order_items i where id=any(historical_item_ids)) is distinct from original_items_hash
    or (select md5(coalesce(jsonb_agg(to_jsonb(i) order by id)::text,'')) from checkout_private.custom_invoice_items i) is distinct from original_invoice_hash then raise exception 'Existing history changed'; end if;
end $fixture_assertions$;

do $security_assertions$
declare role_name text; function_signature text;
begin
  foreach role_name in array array['anon','authenticated'] loop
    foreach function_signature in array array['public.admin_manage_catalog(text,uuid,timestamptz,jsonb,jsonb,boolean)','public.admin_catalog_dependencies(text,uuid)','public.admin_retire_catalog(text,uuid,timestamptz,boolean)'] loop
      if has_function_privilege(role_name,function_signature,'EXECUTE') then raise exception '% may execute %',role_name,function_signature; end if;
    end loop;
    if has_table_privilege(role_name,'catalog_private.catalog_internal_pricing','SELECT')
      or has_table_privilege(role_name,'catalog_private.catalog_pricing_change_audit','SELECT') then raise exception '% may read private costs/audit',role_name; end if;
  end loop;
  if not exists(select 1 from pg_class where oid='catalog_private.catalog_internal_pricing'::regclass and relrowsecurity and relforcerowsecurity) then raise exception 'Private cost RLS is not forced'; end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='catalog_package_core_prices' and column_name='dealer_cost_cents') then raise exception 'Unexpected dealer cost public column'; end if;
end $security_assertions$;

select 'PASS: 34 seed authorities; 14 public packages / 28 contexts; generic components and snapshots for card/ACH/wire; independent prices; stale guards; Y40 isolation; dependency retirement; immutable history; private cost RLS and grants' as pricing_catalog_management_result;
