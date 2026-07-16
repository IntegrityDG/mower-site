-- Reviewed official manufacturer sources for private, review-only monitoring.
-- No public catalog rows are changed by this seed.
with source_definitions (
  target_type, target_slug, source_brand, source_name, source_url,
  source_kind, fields_to_monitor, source_notes
) as (
  values
    -- Lymow One Plus family sources.
    ('product', 'lymow-one-plus', 'Lymow', 'Lymow One Plus product page', 'https://www.lymow.com/products/lymow-one-plus-robotic-lawn-mower', 'manufacturer_product_page', '{"fields":["short_description","cutting_width","cutting_height","battery","runtime","charging_time","maximum_area","slope_capability","navigation_system","obstacle_detection","drive_system","official_image_url","official_document_url"],"source_category":"product_page"}'::jsonb, 'Reviewed 2026-07-15 on the official US manufacturer site; contains product-specific specifications.'),
    ('product', 'lymow-one-plus', 'Lymow', 'Lymow One Plus accessories collection', 'https://www.lymow.com/collections/accessories', 'other', '{"fields":[],"source_category":"accessories"}'::jsonb, 'Reviewed 2026-07-15 on the official US manufacturer site; collection is retained for availability/reference only.'),
    ('product', 'lymow-one-plus', 'Lymow', 'Lymow warranty policy', 'https://www.lymow.com/pages/warranty-policy', 'other', '{"fields":["warranty"],"source_category":"warranty"}'::jsonb, 'Reviewed 2026-07-15 on the official US manufacturer site; applies specifically to Lymow One Plus and Lymow One.'),
    ('variant', 'lymow-one-plus-5a', 'Lymow', 'Lymow One Plus 5A configuration', 'https://www.lymow.com/products/lymow-one-plus-robotic-lawn-mower', 'manufacturer_specs_page', '{"fields":["charging_time","recommended_area","maximum_area"],"source_category":"specifications"}'::jsonb, 'Reviewed 2026-07-15; the official product page identifies the 5A configuration.'),
    ('variant', 'lymow-one-plus-10a', 'Lymow', 'Lymow One Plus 10A configuration', 'https://www.lymow.com/products/lymow-one-plus-robotic-lawn-mower', 'manufacturer_specs_page', '{"fields":["charging_time","recommended_area","maximum_area"],"source_category":"specifications"}'::jsonb, 'Reviewed 2026-07-15; the official product page identifies the 10A configuration.'),
    ('option', 'lymow-10a-charging-station-adapter', 'Lymow', '10A Charging Station Adapter', 'https://www.lymow.com/products/10a-adapter-with-extension-cable-for-lymow-one-plus-charging-station', 'manufacturer_product_page', '{"fields":["official_image_url"],"source_category":"accessories"}'::jsonb, 'Exact option match reviewed 2026-07-15.'),
    ('option', 'lymow-5a-charging-station-adapter', 'Lymow', '5A Charging Station Adapter', 'https://www.lymow.com/products/5a-adapter-with-extension-cable-for-lymow-one-plus-charging-station', 'manufacturer_product_page', '{"fields":["official_image_url"],"source_category":"accessories"}'::jsonb, 'Exact option match reviewed 2026-07-15.'),
    ('option', 'lymow-battery-528wh', 'Lymow', 'Lymow One Plus 528Wh LiFePO4 Battery', 'https://www.lymow.com/products/528wh-lifepo4-battery-for-lymow-one-plus', 'manufacturer_product_page', '{"fields":["battery","official_image_url"],"source_category":"accessories"}'::jsonb, 'Exact option match reviewed 2026-07-15.'),
    ('option', 'lymow-battery-direct-charging-cable', 'Lymow', 'Lymow One Plus Battery Direct Charging Cable', 'https://www.lymow.com/products/battery-direct-charging-cable-for-lymow-one-plus-528wh-battery', 'manufacturer_product_page', '{"fields":["official_image_url"],"source_category":"accessories"}'::jsonb, 'Exact option match reviewed 2026-07-15.'),
    ('option', 'lymow-rtk-reference-station', 'Lymow', 'Lymow RTK Reference Station', 'https://www.lymow.com/products/rtk-set', 'manufacturer_product_page', '{"fields":["navigation_system","official_image_url"],"source_category":"accessories"}'::jsonb, 'Exact option match reviewed 2026-07-15.'),
    ('option', 'lymow-rtk-power-adapter', 'Lymow', 'Lymow RTK Power Adapter', 'https://www.lymow.com/products/rtk-power-supply', 'manufacturer_product_page', '{"fields":["official_image_url"],"source_category":"accessories"}'::jsonb, 'Exact option match reviewed 2026-07-15.'),
    ('option', 'lymow-rtk-extension-cable', 'Lymow', 'Lymow RTK Station Extension Cable', 'https://www.lymow.com/products/rtk-station-extension-cable', 'manufacturer_product_page', '{"fields":["official_image_url"],"source_category":"accessories"}'::jsonb, 'Exact option match reviewed 2026-07-15.'),
    ('option', 'lymow-tracks-pair', 'Lymow', 'Lymow One Plus Replacement Track', 'https://www.lymow.com/products/replacement-track-for-lymow-one-plus', 'manufacturer_product_page', '{"fields":["official_image_url"],"source_category":"accessories"}'::jsonb, 'Exact option match reviewed 2026-07-15.'),

    -- Yarbo platform, configurations, modules, and cataloged accessories.
    ('product', 'yarbo', 'Yarbo', 'Yarbo Core', 'https://www.yarbo.com/products/yarbo-core', 'manufacturer_product_page', '{"fields":["short_description","battery","runtime","charging_time","navigation_system","obstacle_detection","drive_system","dimensions","weight","warranty","official_image_url","official_document_url"],"source_category":"product_page"}'::jsonb, 'Reviewed 2026-07-15 on the official US manufacturer site.'),
    ('package', 'yarbo-lawn-mower-pro', 'Yarbo', 'Yarbo Lawn Mower Pro', 'https://www.yarbo.com/products/yarbo-lawn-mower-pro', 'manufacturer_product_page', '{"fields":["short_description","cutting_width","cutting_height","runtime","charging_time","maximum_area","slope_capability","navigation_system","obstacle_detection","drive_system","warranty","official_image_url","official_document_url"],"source_category":"product_page"}'::jsonb, 'Exact full-system package match reviewed 2026-07-15.'),
    ('package', 'yarbo-snow-blower', 'Yarbo', 'Yarbo Snow Blower', 'https://www.yarbo.com/products/yarbo-snow-blower', 'manufacturer_product_page', '{"fields":["short_description","battery","runtime","charging_time","slope_capability","navigation_system","obstacle_detection","drive_system","dimensions","weight","warranty","official_image_url","official_document_url"],"source_category":"product_page"}'::jsonb, 'Exact full-system package match reviewed 2026-07-15.'),
    ('option', 'yarbo-mower-module', 'Yarbo', 'Yarbo Lawn Mower Module', 'https://www.yarbo.com/products/lawn-mower-module', 'manufacturer_product_page', '{"fields":["cutting_width","cutting_height","runtime","charging_time","maximum_area","slope_capability","navigation_system","obstacle_detection","drive_system","dimensions","weight","official_image_url","official_document_url"],"source_category":"product_page"}'::jsonb, 'Exact module match reviewed 2026-07-15.'),
    ('option', 'yarbo-lawn-mower-pro-module', 'Yarbo', 'Yarbo Lawn Mower Pro Module', 'https://www.yarbo.com/products/yarbo-lawn-mower-pro-module', 'manufacturer_product_page', '{"fields":["cutting_width","cutting_height","runtime","charging_time","maximum_area","slope_capability","navigation_system","obstacle_detection","drive_system","dimensions","weight","official_image_url","official_document_url"],"source_category":"product_page"}'::jsonb, 'Exact module match reviewed 2026-07-15.'),
    ('option', 'yarbo-snow-blower-module', 'Yarbo', 'Yarbo Snow Blower Module', 'https://www.yarbo.com/products/snow-blower-module', 'manufacturer_product_page', '{"fields":["runtime","charging_time","slope_capability","navigation_system","obstacle_detection","drive_system","dimensions","weight","official_image_url","official_document_url"],"source_category":"product_page"}'::jsonb, 'Exact module match reviewed 2026-07-15.'),
    ('option', 'yarbo-leaf-blower-module', 'Yarbo', 'Yarbo Blower Module', 'https://www.yarbo.com/products/blower-module', 'manufacturer_product_page', '{"fields":["runtime","charging_time","slope_capability","navigation_system","obstacle_detection","drive_system","dimensions","weight","official_image_url","official_document_url"],"source_category":"product_page"}'::jsonb, 'Exact module match reviewed 2026-07-15.'),
    ('option', 'yarbo-trimmer-module', 'Yarbo', 'Yarbo Trimmer Module', 'https://www.yarbo.com/products/trimmer-back-brace-mount', 'manufacturer_product_page', '{"fields":["runtime","charging_time","slope_capability","navigation_system","obstacle_detection","drive_system","dimensions","weight","official_image_url","official_document_url"],"source_category":"product_page"}'::jsonb, 'Exact module/package match reviewed 2026-07-15.'),
    ('option', 'yarbo-plow-module', 'Yarbo', 'Yarbo Snow Plow Blade', 'https://www.yarbo.com/products/plow-blade', 'manufacturer_product_page', '{"fields":["dimensions","weight","official_image_url"],"source_category":"accessories"}'::jsonb, 'Exact hidden catalog option match reviewed 2026-07-15; source monitoring does not change public status.'),
    ('option', 'yarbo-tow-hitch', 'Yarbo', 'Yarbo Tow Hitch', 'https://www.yarbo.com/products/tow-hitch', 'manufacturer_product_page', '{"fields":["dimensions","weight","official_image_url"],"source_category":"accessories"}'::jsonb, 'Exact hidden catalog option match reviewed 2026-07-15; source monitoring does not change public status.'),

    -- Pandag official product family page. Pricing monitoring remains prohibited.
    ('product', 'pandag-g1', 'Pandag', 'Pandag G1 M1500 SD/RD and G1 PRO M3000 specifications', 'https://www.pandag.com/product/pandag-g1-mower', 'manufacturer_specs_page', '{"fields":["cutting_width","cutting_height","battery","runtime","charging_time","recommended_area","maximum_area","slope_capability","navigation_system","obstacle_detection","drive_system","dimensions","weight","warranty","official_image_url","official_document_url"],"source_category":"specifications"}'::jsonb, 'Reviewed 2026-07-15 on the official manufacturer domain; covers all three model tabs. Public pricing monitoring is prohibited.')
),
resolved_sources as (
  select s.*, p.id as target_id
  from source_definitions s
  join public.catalog_products p on s.target_type = 'product' and p.slug = s.target_slug
  union all
  select s.*, v.id as target_id
  from source_definitions s
  join public.catalog_product_variants v on s.target_type = 'variant' and v.variant_slug = s.target_slug
  union all
  select s.*, o.id as target_id
  from source_definitions s
  join public.catalog_options o on s.target_type = 'option' and o.option_slug = s.target_slug
  union all
  select s.*, p.id as target_id
  from source_definitions s
  join public.catalog_packages p on s.target_type = 'package' and p.package_slug = s.target_slug
)
insert into catalog_private.catalog_source_targets (
  target_type, product_id, variant_id, option_id, package_id,
  source_brand, source_name, source_url, source_kind, fields_to_monitor,
  public_pricing_monitoring_allowed, source_notes, pricing_monitoring_notes,
  check_frequency, manual_only, is_active, allow_automated_fetch,
  allow_image_download, updated_at
)
select
  r.target_type,
  case when r.target_type = 'product' then r.target_id end,
  case when r.target_type = 'variant' then r.target_id end,
  case when r.target_type = 'option' then r.target_id end,
  case when r.target_type = 'package' then r.target_id end,
  r.source_brand, r.source_name, r.source_url, r.source_kind,
  r.fields_to_monitor, false, r.source_notes,
  case when lower(r.source_brand) = 'pandag' then 'Pandag pricing is manual/private only.' else 'Public pricing is not monitored by this source seed.' end,
  'monthly', false, true, true, false, now()
from resolved_sources r
where not exists (
  select 1
  from catalog_private.catalog_source_targets existing
  where existing.target_type = r.target_type
    and existing.product_id is not distinct from case when r.target_type = 'product' then r.target_id end
    and existing.variant_id is not distinct from case when r.target_type = 'variant' then r.target_id end
    and existing.option_id is not distinct from case when r.target_type = 'option' then r.target_id end
    and existing.package_id is not distinct from case when r.target_type = 'package' then r.target_id end
    and lower(rtrim(existing.source_url, '/')) = lower(rtrim(r.source_url, '/'))
);
