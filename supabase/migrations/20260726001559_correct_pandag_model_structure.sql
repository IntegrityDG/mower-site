begin;

-- Correct the Pandag model structure while preserving its quote-only sales path.
do $$
declare
  pandag_product_id constant uuid := '6364d86a-d5e5-4f17-8849-cea66cb6ff0c';
begin
  if not exists (
    select 1
    from public.catalog_products
    where id = pandag_product_id
      and slug = 'pandag-g1'
      and brand = 'Pandag'
  ) then
    raise exception 'Expected Pandag G1 parent product was not found';
  end if;

  if not exists (
    select 1
    from public.catalog_product_variants
    where id = '17be81bd-cf7b-424a-a57e-95423e7a10db'
      and product_id = pandag_product_id
      and variant_slug in ('pandag-g1-m1500', 'pandag-g1-m1500-sd')
  ) then
    raise exception 'Expected Pandag M1500 variant was not found';
  end if;

  if not exists (
    select 1
    from public.catalog_product_variants
    where id = '7dd2ce98-59a7-4a0d-b912-8d4916efa415'
      and product_id = pandag_product_id
      and variant_slug in ('pandag-g1-m3000', 'pandag-g1-pro-m3000')
  ) then
    raise exception 'Expected Pandag M3000 variant was not found';
  end if;
end
$$;

update public.catalog_products
set regular_price_cents = 2466000,
    sale_price_cents = null,
    sale_starts_at = null,
    sale_ends_at = null,
    promotion_label = null,
    show_public_price = false,
    contact_for_pricing = true,
    updated_at = now()
where id = '6364d86a-d5e5-4f17-8849-cea66cb6ff0c';

update public.catalog_product_variants
set variant_slug = 'pandag-g1-m1500-sd',
    name = 'Pandag G1 M1500 SD',
    description = 'Side-discharge commercial configuration with a bar-blade cutting system. Up To 8 acres per day.',
    public_status = 'active',
    regular_price_cents = 2466000,
    sale_price_cents = null,
    sale_starts_at = null,
    sale_ends_at = null,
    promotion_label = null,
    show_public_price = false,
    contact_for_pricing = true,
    sort_order = 10,
    updated_at = now()
where id = '17be81bd-cf7b-424a-a57e-95423e7a10db'
  and product_id = '6364d86a-d5e5-4f17-8849-cea66cb6ff0c';

insert into public.catalog_product_variants (
  id, product_id, variant_slug, sku, name, description, public_status,
  regular_price_cents, sale_price_cents, sale_starts_at, sale_ends_at,
  promotion_label, show_public_price, contact_for_pricing, sort_order
)
values (
  '9fcc8558-576b-4df7-93bd-12ceff29dcb2',
  '6364d86a-d5e5-4f17-8849-cea66cb6ff0c',
  'pandag-g1-m1500-rd', null, 'Pandag G1 M1500 RD',
  'Rear-discharge commercial configuration with a swing-blade cutting system. Up To 12 acres per day.',
  'active', 2466000, null, null, null, null, false, true, 20
)
on conflict (product_id, variant_slug) do update
set name = excluded.name,
    description = excluded.description,
    public_status = excluded.public_status,
    regular_price_cents = excluded.regular_price_cents,
    sale_price_cents = null,
    sale_starts_at = null,
    sale_ends_at = null,
    promotion_label = null,
    show_public_price = false,
    contact_for_pricing = true,
    sort_order = excluded.sort_order,
    updated_at = now();

do $$
begin
  if not exists (
    select 1 from public.catalog_product_variants
    where id = '9fcc8558-576b-4df7-93bd-12ceff29dcb2'
      and product_id = '6364d86a-d5e5-4f17-8849-cea66cb6ff0c'
      and variant_slug = 'pandag-g1-m1500-rd'
  ) then
    raise exception 'Pandag M1500 RD slug is already assigned to an unexpected record';
  end if;
end
$$;

update public.catalog_product_variants
set variant_slug = 'pandag-g1-pro-m3000',
    name = 'Pandag G1 PRO M3000',
    description = 'High-capacity commercial configuration with a swing-blade cutting system. Up To 11 acres per day.',
    public_status = 'active',
    regular_price_cents = 3006000,
    sale_price_cents = null,
    sale_starts_at = null,
    sale_ends_at = null,
    promotion_label = null,
    show_public_price = false,
    contact_for_pricing = true,
    sort_order = 30,
    updated_at = now()
where id = '7dd2ce98-59a7-4a0d-b912-8d4916efa415'
  and product_id = '6364d86a-d5e5-4f17-8849-cea66cb6ff0c';

-- Duplicate the approved M1500 dealer and distributor tiers for M1500 RD.
insert into catalog_private.catalog_internal_pricing (
  id, variant_id, supplier_name, supplier_sku, dealer_cost_cents,
  internal_price_cents, target_margin_basis_points, supplier_notes,
  private_notes, starts_at, ends_at
)
values
  (
    'b37bb4ab-9d26-42c0-b87a-7f7ef00e8287',
    '9fcc8558-576b-4df7-93bd-12ceff29dcb2',
    'uploaded Pandag pricing image', null, 1628000, null, null, 'Not stated',
    E'Tier: Dealer price, 10+ units\nMinimum quantity: 10\nFreight: Not stated\nEffective/availability: Units dispatching from June 2026; sea freight to US approximately 35 days\nDealer price applies to the M1500 RD model.',
    null, null
  ),
  (
    '22f22538-4e2f-4e4b-9c73-a5ebd98e3ace',
    '9fcc8558-576b-4df7-93bd-12ceff29dcb2',
    'uploaded Pandag pricing image', null, 1356300, null, null, 'Not stated',
    E'Tier: Distributor price, 40+ units\nMinimum quantity: 40\nFreight: Not stated\nEffective/availability: Units dispatching from June 2026; sea freight to US approximately 35 days\nDistributor price applies to the M1500 RD model.',
    null, null
  )
on conflict (id) do nothing;

-- The former required blade choice is no longer a customer configuration group.
update public.catalog_option_groups
set is_required = false,
    minimum_selections = 0,
    maximum_selections = 0,
    group_description = 'Historical M1500 blade-choice group retained for catalog history. SD and RD are now separate model configurations.',
    updated_at = now()
where id = 'fa942bc6-b0c2-40bd-bf9b-d26444c585ee'
  and product_id = '6364d86a-d5e5-4f17-8849-cea66cb6ff0c';

update public.catalog_options
set public_status = 'hidden',
    is_required = false,
    is_included = false,
    show_public_price = false,
    contact_for_pricing = true,
    updated_at = now()
where id in (
  'c77f4a8b-8e26-4942-a22c-984e0295e0ae',
  '584d397d-e027-4cb6-8564-e3e13e7188f5'
)
  and product_id = '6364d86a-d5e5-4f17-8849-cea66cb6ff0c';

update public.catalog_options
set regular_price_cents = 350000,
    sale_price_cents = 320000,
    show_public_price = false,
    contact_for_pricing = true,
    updated_at = now()
where id = '964bc4c6-40b8-458a-8f37-1b49b68a9bab'
  and product_id = '6364d86a-d5e5-4f17-8849-cea66cb6ff0c';

update public.catalog_options
set public_status = 'hidden',
    show_public_price = false,
    contact_for_pricing = true,
    updated_at = now()
where id = '4b293d5a-1049-45df-9f36-0ccfb1b8e68c'
  and product_id = '6364d86a-d5e5-4f17-8849-cea66cb6ff0c';

-- Sanitize every other Pandag option's transactional public-price flags.
update public.catalog_options
set show_public_price = false,
    contact_for_pricing = true,
    updated_at = now()
where product_id = '6364d86a-d5e5-4f17-8849-cea66cb6ff0c';

-- Convert the two historical generic-M1500 links to their approved SD meanings.
update public.catalog_variant_options
set relationship_type = 'included', updated_at = now()
where id = 'a3fba348-f4b0-4894-ba2a-6757df3c7464'
  and variant_id = '17be81bd-cf7b-424a-a57e-95423e7a10db'
  and option_id = 'c77f4a8b-8e26-4942-a22c-984e0295e0ae';

update public.catalog_variant_options
set relationship_type = 'excluded', updated_at = now()
where id = '27cbd0e0-f16e-484e-a051-c16dadfa7ebc'
  and variant_id = '17be81bd-cf7b-424a-a57e-95423e7a10db'
  and option_id = '584d397d-e027-4cb6-8564-e3e13e7188f5';

insert into public.catalog_variant_options (id, variant_id, option_id, relationship_type, quantity)
values
  ('09d2d778-fc59-4b73-a464-d597789d3aa2', '17be81bd-cf7b-424a-a57e-95423e7a10db', 'c77f4a8b-8e26-4942-a22c-984e0295e0ae', 'defines_variant', 1),
  ('2f17b740-0763-4245-a1f5-feac5b0f0d70', '17be81bd-cf7b-424a-a57e-95423e7a10db', 'ad99e5ec-540d-40fa-bc99-6c8febe4e938', 'included', 1),
  ('e7ccaf98-45cf-4e42-8df4-0ce6f4ece535', '17be81bd-cf7b-424a-a57e-95423e7a10db', '9d3a4594-c300-4579-a725-5d242c3d59b2', 'included', 1),
  ('da68372f-97c7-4bdb-9b1d-128fe9d516d5', '17be81bd-cf7b-424a-a57e-95423e7a10db', '964bc4c6-40b8-458a-8f37-1b49b68a9bab', 'compatible', 1),
  ('8b87590a-f0bf-44f4-bd37-3f43830e23d2', '9fcc8558-576b-4df7-93bd-12ceff29dcb2', '584d397d-e027-4cb6-8564-e3e13e7188f5', 'included', 1),
  ('289aa0f2-99d9-4d1a-b070-957e8a966a58', '9fcc8558-576b-4df7-93bd-12ceff29dcb2', '584d397d-e027-4cb6-8564-e3e13e7188f5', 'defines_variant', 1),
  ('6f1e2704-5a47-4df1-8981-7d00730015c6', '9fcc8558-576b-4df7-93bd-12ceff29dcb2', 'c77f4a8b-8e26-4942-a22c-984e0295e0ae', 'excluded', 1),
  ('434ee4a3-cf53-424e-acf1-d2982a318590', '9fcc8558-576b-4df7-93bd-12ceff29dcb2', 'ad99e5ec-540d-40fa-bc99-6c8febe4e938', 'included', 1),
  ('57f19c90-152e-497c-b946-07cc442aafd1', '9fcc8558-576b-4df7-93bd-12ceff29dcb2', '9d3a4594-c300-4579-a725-5d242c3d59b2', 'included', 1),
  ('4e38c0e1-84f4-464d-8321-81463c741ed5', '9fcc8558-576b-4df7-93bd-12ceff29dcb2', '964bc4c6-40b8-458a-8f37-1b49b68a9bab', 'compatible', 1),
  ('ffdebb47-f012-48ad-8146-e152020fa143', '7dd2ce98-59a7-4a0d-b912-8d4916efa415', '584d397d-e027-4cb6-8564-e3e13e7188f5', 'included', 1),
  ('bbbe0c2c-8b36-4978-b6e4-45d2a1060874', '7dd2ce98-59a7-4a0d-b912-8d4916efa415', '584d397d-e027-4cb6-8564-e3e13e7188f5', 'defines_variant', 1),
  ('4af8a6ef-9e3f-4afe-9c6f-bd29a3515e3f', '7dd2ce98-59a7-4a0d-b912-8d4916efa415', 'ad99e5ec-540d-40fa-bc99-6c8febe4e938', 'included', 1),
  ('5ffe68fa-3d24-48b3-96a6-05fb79138efb', '7dd2ce98-59a7-4a0d-b912-8d4916efa415', '9d3a4594-c300-4579-a725-5d242c3d59b2', 'included', 1),
  ('92be37df-5f53-4099-9257-c704bdedd034', '7dd2ce98-59a7-4a0d-b912-8d4916efa415', '964bc4c6-40b8-458a-8f37-1b49b68a9bab', 'compatible', 1)
on conflict (variant_id, option_id, relationship_type) do update
set quantity = excluded.quantity, updated_at = now();

update public.catalog_product_page_sections
set heading = 'Three Commercial Model Configurations',
    body_content = E'Pandag G1 M1500 SD: side discharge, Bar Blade, Up To 8 acres per day.\n\nPandag G1 M1500 RD: rear discharge, Swing Blade, Up To 12 acres per day.\n\nPandag G1 PRO M3000: high-capacity Swing Blade configuration, Up To 11 acres per day. Final model selection remains subject to IDS project review.',
    updated_at = now()
where id = 'b55b241e-5d8e-4e4a-a4c2-aa9b5dda04ba'
  and product_page_id = '4cbdf379-5159-4f16-a5f7-b93d3f99b469';

commit;

-- Verification queries (read-only; run after the migration is separately approved).
select id, variant_slug, name, public_status, regular_price_cents,
       sale_price_cents, show_public_price, contact_for_pricing, sort_order
from public.catalog_product_variants
where product_id = '6364d86a-d5e5-4f17-8849-cea66cb6ff0c'
order by sort_order;

select variant_id, dealer_cost_cents, private_notes
from catalog_private.catalog_internal_pricing
where variant_id in (
  '17be81bd-cf7b-424a-a57e-95423e7a10db',
  '9fcc8558-576b-4df7-93bd-12ceff29dcb2',
  '7dd2ce98-59a7-4a0d-b912-8d4916efa415'
)
order by variant_id, dealer_cost_cents desc;

select vo.variant_id, o.name, vo.relationship_type, vo.quantity
from public.catalog_variant_options vo
join public.catalog_options o on o.id = vo.option_id
where vo.variant_id in (
  '17be81bd-cf7b-424a-a57e-95423e7a10db',
  '9fcc8558-576b-4df7-93bd-12ceff29dcb2',
  '7dd2ce98-59a7-4a0d-b912-8d4916efa415'
)
order by vo.variant_id, o.name, vo.relationship_type;

-- Rollback (NOT EXECUTED): use as a separately reviewed transaction if needed.
-- begin;
-- delete from catalog_private.catalog_internal_pricing
-- where id in ('b37bb4ab-9d26-42c0-b87a-7f7ef00e8287', '22f22538-4e2f-4e4b-9c73-a5ebd98e3ace');
-- delete from public.catalog_variant_options
-- where id in (
--   '09d2d778-fc59-4b73-a464-d597789d3aa2', '2f17b740-0763-4245-a1f5-feac5b0f0d70',
--   'e7ccaf98-45cf-4e42-8df4-0ce6f4ece535', 'da68372f-97c7-4bdb-9b1d-128fe9d516d5',
--   '8b87590a-f0bf-44f4-bd37-3f43830e23d2', '289aa0f2-99d9-4d1a-b070-957e8a966a58',
--   '6f1e2704-5a47-4df1-8981-7d00730015c6', '434ee4a3-cf53-424e-acf1-d2982a318590',
--   '57f19c90-152e-497c-b946-07cc442aafd1', '4e38c0e1-84f4-464d-8321-81463c741ed5',
--   'ffdebb47-f012-48ad-8146-e152020fa143', 'bbbe0c2c-8b36-4978-b6e4-45d2a1060874',
--   '4af8a6ef-9e3f-4afe-9c6f-bd29a3515e3f', '5ffe68fa-3d24-48b3-96a6-05fb79138efb',
--   '92be37df-5f53-4099-9257-c704bdedd034'
-- );
-- delete from public.catalog_product_variants where id = '9fcc8558-576b-4df7-93bd-12ceff29dcb2';
-- update public.catalog_variant_options set relationship_type = 'compatible'
-- where id in ('a3fba348-f4b0-4894-ba2a-6757df3c7464', '27cbd0e0-f16e-484e-a051-c16dadfa7ebc');
-- update public.catalog_product_variants set variant_slug='pandag-g1-m1500', name='Pandag G1 M1500',
--   description='Commercial Pandag model. After selecting the M1500, the customer must choose either the Bar Blade or Swing Blade cutting option.',
--   public_status='active', regular_price_cents=2466000, sale_price_cents=2220000,
--   sale_starts_at='2026-06-11T05:00:00+00:00', sale_ends_at='2026-07-01T05:00:00+00:00',
--   promotion_label='Grand Opening', show_public_price=true, contact_for_pricing=false, sort_order=3
-- where id='17be81bd-cf7b-424a-a57e-95423e7a10db';
-- update public.catalog_product_variants set variant_slug='pandag-g1-m3000', name='Pandag G1 M3000',
--   description='Higher-capacity Pandag model for extremely large or demanding properties; approximately 11 acres per day and approximately 8 hours runtime.',
--   regular_price_cents=3006000, sale_price_cents=null, show_public_price=true,
--   contact_for_pricing=false, sort_order=4
-- where id='7dd2ce98-59a7-4a0d-b912-8d4916efa415';
-- update public.catalog_products set regular_price_cents=2466000, sale_price_cents=2220000,
--   sale_starts_at='2026-06-11T05:00:00+00:00', sale_ends_at='2026-07-01T05:00:00+00:00',
--   promotion_label='Grand Opening', show_public_price=true, contact_for_pricing=false
-- where id='6364d86a-d5e5-4f17-8849-cea66cb6ff0c';
-- update public.catalog_option_groups set is_required=true, minimum_selections=1, maximum_selections=1,
--   group_description='Required blade selection shown only after the customer selects the Pandag G1 M1500.'
-- where id='fa942bc6-b0c2-40bd-bf9b-d26444c585ee';
-- update public.catalog_options set public_status='active', is_required=true,
--   show_public_price=true, contact_for_pricing=false
-- where id in ('c77f4a8b-8e26-4942-a22c-984e0295e0ae','584d397d-e027-4cb6-8564-e3e13e7188f5');
-- update public.catalog_options set public_status='active', show_public_price=true,
--   contact_for_pricing=false where id='4b293d5a-1049-45df-9f36-0ccfb1b8e68c';
-- update public.catalog_options set show_public_price=true, contact_for_pricing=false
-- where product_id='6364d86a-d5e5-4f17-8849-cea66cb6ff0c'
--   and id <> '4d70f369-609f-4ed4-bea9-54f4b949636b';
-- update public.catalog_options set show_public_price=false, contact_for_pricing=true
-- where id='4d70f369-609f-4ed4-bea9-54f4b949636b';
-- update public.catalog_product_page_sections set heading='M1500 and M3000 Variants',
--   body_content='The catalog supports Pandag G1 M1500 and M3000 variants. M1500 customers select a required blade configuration, including Bar Blade or Swing Blade, while M3000 is treated as its own higher-capability variant.'
-- where id='b55b241e-5d8e-4e4a-a4c2-aa9b5dda04ba';
-- commit;
