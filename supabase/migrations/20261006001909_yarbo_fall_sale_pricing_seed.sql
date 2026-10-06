begin;

-- Public manufacturer Fall Sale pricing only. Stable slugs and components
-- are retained; IDS Everyday is deliberately NULL on every listed authority.
-- Private manufacturer costs are supplied separately outside this public repo.
create temporary table yarbo_fall_packages(slug text primary key,name text not null,y40_msrp integer,y40_sale integer,y40p_msrp integer,y40p_sale integer) on commit drop;
insert into yarbo_fall_packages values
 ('yarbo-snow-blower','Yarbo Snow Blower Gen 2',619900,489900,779900,739900),
 ('yarbo-lawn-mower-pro','Yarbo Lawn Mower Pro',599900,489900,759900,719900),
 ('yarbo-leaf-blower','Yarbo Leaf Blower',509900,429900,669900,629900),
 ('yarbo-leaf-blower-trimmer','Yarbo Leaf Blower + Trimmer Package',639900,639900,799900,799900),
 ('yarbo-snow-blower-trimmer','Yarbo Snow Blower Gen 2 + Trimmer Package',749900,749900,909900,909900),
 ('yarbo-lawn-mower-pro-trimmer','Yarbo Lawn Mower Pro + Trimmer Package',729900,579900,889900,839900),
 ('yarbo-snow-leaf','Yarbo Snow Blower Gen 2 + Leaf Blower',729900,579900,889900,839900),
 ('yarbo-snow-leaf-trimmer','Yarbo Snow Blower Gen 2 + Leaf Blower + Trimmer Package',859900,859900,1019900,1019900),
 ('yarbo-pro-snow','Yarbo Lawn Mower Pro + Snow Blower Gen 2',819900,649900,979900,929900),
 ('yarbo-pro-leaf','Yarbo Lawn Mower Pro + Leaf Blower',709900,559900,869900,819900),
 ('yarbo-pro-snow-trimmer','Yarbo Lawn Mower Pro + Snow Blower Gen 2 + Trimmer Package',949900,749900,1109900,1049900),
 ('yarbo-pro-leaf-trimmer','Yarbo Lawn Mower Pro + Leaf Blower + Trimmer Package',839900,659900,999900,939900),
 ('yarbo-pro-snow-leaf','Yarbo Lawn Mower Pro + Snow Blower Gen 2 + Leaf Blower',929900,739900,1089900,1029900),
 ('yarbo-pro-snow-leaf-trimmer','Yarbo Lawn Mower Pro + Snow Blower Gen 2 + Leaf Blower + Trimmer Package',1059900,839900,1219900,1149900);
do $$ declare product_id_value uuid; row_value record; core_value record; option_value record; begin
  select id into strict product_id_value from public.catalog_products where slug='yarbo' and brand='Yarbo';
  if (select count(*) from yarbo_fall_packages s join public.catalog_packages p on p.package_slug=s.slug and p.product_id=product_id_value)<>14 then raise exception 'Reviewed Yarbo package identities changed'; end if;
  perform public.admin_manage_catalog('products',p.id,p.updated_at,jsonb_build_object('display_msrp_price_cents',399900,'regular_price_cents',null,'sale_price_cents',399900,'sale_starts_at','2026-10-06T05:00:00Z','sale_ends_at','2026-10-13T05:00:00Z','promotion_label','Fall Sale')) from public.catalog_products p where p.id=product_id_value;
  perform public.admin_manage_catalog('variants',v.id,v.updated_at,jsonb_build_object('display_msrp_price_cents',559900,'regular_price_cents',null,'sale_price_cents',559900,'sale_starts_at','2026-10-06T05:00:00Z','sale_ends_at','2026-10-13T05:00:00Z','promotion_label','Fall Sale')) from public.catalog_product_variants v where v.product_id=product_id_value and v.variant_slug='yarbo-y40p';
  for option_value in select * from (values ('yarbo-snow-blower-module','Snow Blower Gen 2 Module',220000,175000),('yarbo-lawn-mower-pro-module','Lawn Mower Pro Module',200000,160000),('yarbo-leaf-blower-module','Leaf Blower Module',110000,85000),('yarbo-trimmer-module','Trimmer Package (Trimmer Module + BBM)',130000,100000)) s(slug,name,msrp,sale) loop
    if not exists(select 1 from public.catalog_options where product_id=product_id_value and option_slug=option_value.slug) then raise exception 'Reviewed Yarbo module identity missing: %',option_value.slug; end if;
    perform public.admin_manage_catalog('options',o.id,o.updated_at,jsonb_build_object('name',option_value.name,'display_msrp_price_cents',option_value.msrp,'regular_price_cents',null,'sale_price_cents',option_value.sale,'sale_starts_at','2026-10-06T05:00:00Z','sale_ends_at','2026-10-13T05:00:00Z','promotion_label','Fall Sale','compatibility',jsonb_build_array('Y40','Y40P'),'catalog_category','module')) from public.catalog_options o where o.product_id=product_id_value and o.option_slug=option_value.slug;
  end loop;
  for row_value in select p.id,p.updated_at,s.* from yarbo_fall_packages s join public.catalog_packages p on p.product_id=product_id_value and p.package_slug=s.slug loop
    perform public.admin_manage_catalog('packages',row_value.id,row_value.updated_at,jsonb_build_object('package_name',row_value.name,'core_selectable',true,'display_msrp_price_cents',row_value.y40_msrp,'regular_price_cents',null,'sale_price_cents',row_value.y40_sale,'sale_starts_at','2026-10-06T05:00:00Z','sale_ends_at','2026-10-13T05:00:00Z','promotion_label','Fall Sale'));
    for core_value in select cp.id,cp.updated_at,v.variant_slug from public.catalog_package_core_prices cp join public.catalog_product_variants v on v.id=cp.core_variant_id where cp.package_id=row_value.id loop
      if core_value.variant_slug='yarbo-y40p' then
        perform public.admin_manage_catalog('package-core-prices',core_value.id,core_value.updated_at,jsonb_build_object('display_msrp_price_cents',row_value.y40p_msrp,'regular_price_cents',null,'sale_price_cents',row_value.y40p_sale,'sale_starts_at','2026-10-06T05:00:00Z','sale_ends_at','2026-10-13T05:00:00Z','promotion_label','Fall Sale'));
      end if;
    end loop;
  end loop;
end $$;

commit;
