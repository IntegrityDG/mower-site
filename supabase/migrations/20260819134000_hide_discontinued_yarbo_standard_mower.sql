BEGIN;

-- Yarbo discontinued the Standard Lawn Mower Module.
-- Preserve all historical records, but remove the module and every package
-- containing it from customer-facing catalog/build/checkout surfaces.

WITH yarbo_product AS (
  SELECT id
  FROM public.catalog_products
  WHERE slug = 'yarbo'
),
standard_mower AS (
  SELECT o.id
  FROM public.catalog_options o
  JOIN yarbo_product yp
    ON yp.id = o.product_id
  WHERE o.option_slug = 'yarbo-mower-module'
)

UPDATE public.catalog_options
SET
  public_status = 'hidden',
  show_public_price = false,
  contact_for_pricing = false,
  updated_at = now()
WHERE id IN (
  SELECT id
  FROM standard_mower
);

-- Hide every package that contains the discontinued Standard mower,
-- regardless of the package name or its current availability state.
WITH yarbo_product AS (
  SELECT id
  FROM public.catalog_products
  WHERE slug = 'yarbo'
),
standard_mower AS (
  SELECT o.id
  FROM public.catalog_options o
  JOIN yarbo_product yp
    ON yp.id = o.product_id
  WHERE o.option_slug = 'yarbo-mower-module'
)

UPDATE public.catalog_packages p
SET
  public_status = 'hidden',
  show_public_price = false,
  contact_for_pricing = false,
  updated_at = now()
WHERE
  p.product_id IN (
    SELECT id
    FROM yarbo_product
  )
  AND EXISTS (
    SELECT 1
    FROM public.catalog_package_items pi
    WHERE
      pi.package_id = p.id
      AND pi.option_id IN (
        SELECT id
        FROM standard_mower
      )
  );

-- These two currently-public accessories exist only for the discontinued
-- Standard mower. Keep the records for history, but remove them publicly.
UPDATE public.catalog_options
SET
  public_status = 'hidden',
  accessory_listing_enabled = false,
  show_in_builder = false,
  updated_at = now()
WHERE option_slug IN (
  'yarbo-cutting-blades-bolts-40pc',
  'yarbo-cutting-disc-bolts'
);

-- Stop manufacturer monitoring from generating new suggestions
-- for the discontinued Standard mower.
UPDATE catalog_private.catalog_source_targets
SET
  is_active = false,
  updated_at = now()
WHERE option_id IN (
  SELECT id
  FROM public.catalog_options
  WHERE option_slug = 'yarbo-mower-module'
);

COMMIT;
