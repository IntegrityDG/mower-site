begin;

-- Yarbo's Standard Lawn Mower Module is permanently discontinued.
-- Mower Pro (yarbo-lawn-mower-pro-module), its packages, and its accessories
-- must remain untouched. Package discovery therefore uses the exact Standard
-- option slug and catalog_package_items relationships, never package names.
-- This relationship currently identifies all eight hidden Standard packages;
-- the relationship remains the source of truth if a target row is absent.
delete from public.catalog_packages package
where exists (
  select 1
  from public.catalog_package_items package_item
  join public.catalog_options standard_mower
    on standard_mower.id = package_item.option_id
  join public.catalog_products yarbo
    on yarbo.id = standard_mower.product_id
  where package_item.package_id = package.id
    and yarbo.slug = 'yarbo'
    and standard_mower.option_slug = 'yarbo-mower-module'
);

-- Remove only the two accessories exclusive to the discontinued Standard
-- mower. Representative Mower Pro accessories such as
-- yarbo-pro-cutting-discs-bolts-2pc and yarbo-lawn-mower-pro-cover remain.
delete from public.catalog_options option
using public.catalog_products yarbo
where option.product_id = yarbo.id
  and yarbo.slug = 'yarbo'
  and option.option_slug in (
    'yarbo-cutting-blades-bolts-40pc',
    'yarbo-cutting-disc-bolts'
  );

-- Package rows and their cascading package-item relationships are gone, so
-- the restrictive package-item option FK now permits this exact deletion.
delete from public.catalog_options option
using public.catalog_products yarbo
where option.product_id = yarbo.id
  and yarbo.slug = 'yarbo'
  and option.option_slug = 'yarbo-mower-module';

-- Historical checkout order_items and sale-import rows retain their snapshots;
-- their catalog package/option foreign keys are defined ON DELETE SET NULL.
-- No historical order, quote, payment, customer, or import row is deleted here.

commit;
