-- Synthetic public catalog prerequisites for historical migration guards.
-- This fixture is applied ONLY to a newly created disposable database.
insert into public.catalog_products(id,slug,brand,name,public_status,regular_price_cents,show_public_price,contact_for_pricing)
values ('6364d86a-d5e5-4f17-8849-cea66cb6ff0c','pandag-g1','Pandag','Pandag G1','active',2466000,false,true),
('10000000-0000-4000-8000-000000000001','lymow-one-plus','Lymow','Lymow One Plus','active',284900,true,false),
('10000000-0000-4000-8000-000000000002','yarbo','Yarbo','Yarbo','active',499900,true,false)
on conflict(slug) do nothing;
insert into public.catalog_product_variants(id,product_id,variant_slug,name,public_status,regular_price_cents,show_public_price,contact_for_pricing)
values ('17be81bd-cf7b-424a-a57e-95423e7a10db','6364d86a-d5e5-4f17-8849-cea66cb6ff0c','pandag-g1-m1500','Pandag M1500','active',2466000,false,true),
('7dd2ce98-59a7-4a0d-b912-8d4916efa415','6364d86a-d5e5-4f17-8849-cea66cb6ff0c','pandag-g1-m3000','Pandag M3000','active',3006000,false,true)
on conflict(product_id,variant_slug) do nothing;
insert into public.catalog_product_variants(product_id,variant_slug,name,public_status,regular_price_cents,show_public_price,contact_for_pricing)
select p.id,v.slug,v.name,'active',299900,true,false from public.catalog_products p cross join (values('lymow-one-plus-5a','Lymow One Plus 5A'),('lymow-one-plus-10a','Lymow One Plus 10A')) v(slug,name)
where p.slug='lymow-one-plus' on conflict(product_id,variant_slug) do nothing;
insert into public.catalog_option_groups(product_id,group_slug,group_name,selection_type,minimum_selections,maximum_selections)
select id,'lymow-charger-config','Charger','single',1,1 from public.catalog_products where slug='lymow-one-plus' on conflict(product_id,group_slug) do nothing;
insert into public.catalog_options(product_id,option_group_id,option_slug,name,public_status,regular_price_cents,show_public_price,contact_for_pricing)
select p.id,g.id,v.slug,v.name,'active',0,true,false from public.catalog_products p join public.catalog_option_groups g on g.product_id=p.id and g.group_slug='lymow-charger-config'
cross join (values('lymow-5a-charger','5A Charger'),('lymow-10a-charger','10A Charger')) v(slug,name)
where p.slug='lymow-one-plus' on conflict(product_id,option_slug) do nothing;
insert into public.catalog_options(id,product_id,option_slug,name)
select v.id::uuid,'6364d86a-d5e5-4f17-8849-cea66cb6ff0c'::uuid,'fixture-'||v.id,'Synthetic historical catalog prerequisite'
from (values('c77f4a8b-8e26-4942-a22c-984e0295e0ae'),('584d397d-e027-4cb6-8564-e3e13e7188f5'),('ad99e5ec-540d-40fa-bc99-6c8febe4e938'),('9d3a4594-c300-4579-a725-5d242c3d59b2'),('964bc4c6-40b8-458a-8f37-1b49b68a9bab')) v(id)
on conflict(id) do nothing;
