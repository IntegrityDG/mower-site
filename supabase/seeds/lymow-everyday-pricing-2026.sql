-- REVIEW-SAFE: approved Lymow everyday pricing.
-- This file intentionally ends with ROLLBACK. The guarded commit helper verifies
-- this exact file before replacing only the terminal ROLLBACK with COMMIT.
--
-- Approved policy:
--   regular_price_cents = Lymow list price
--   sale_price_cents = IDS Everyday Low Price
--   sale_starts_at = NULL
--   sale_ends_at = NULL
--   promotion_label = IDS Everyday Low Price
--
-- Scope: exactly two active variants of public.catalog_products.slug =
-- 'lymow-one-plus'. No product, option, package, service, relationship,
-- permissions, RLS, or private monitoring rows are targeted.

BEGIN;

SET LOCAL lock_timeout = '10s';

SELECT pg_advisory_xact_lock(
  hashtext('ids.lymow-everyday-pricing-2026'),
  hashtext('approved-price-update')
);

DO $verify$
DECLARE
  matched integer;
BEGIN
  SELECT count(*)
  INTO matched
  FROM public.catalog_product_variants variant
  JOIN public.catalog_products product
    ON product.id = variant.product_id
  JOIN (
    VALUES
      ('lymow-one-plus-5a', 299900, 279900, 'IDS Everyday Low Price'),
      ('lymow-one-plus-10a', 319900, 299900, 'IDS Everyday Low Price')
  ) AS expected(variant_slug, regular_price_cents, sale_price_cents, promotion_label)
    ON expected.variant_slug = variant.variant_slug
  WHERE product.slug = 'lymow-one-plus'
    AND lower(product.brand) = 'lymow'
    AND product.public_status = 'active'
    AND variant.public_status = 'active';

  IF matched <> 2 THEN
    RAISE EXCEPTION
      'Expected exactly two active Lymow One Plus pricing targets; found %.',
      matched;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('lymow-one-plus-5a', 299900, 279900, 'IDS Everyday Low Price'),
        ('lymow-one-plus-10a', 319900, 299900, 'IDS Everyday Low Price')
    ) AS expected(variant_slug, regular_price_cents, sale_price_cents, promotion_label)
    LEFT JOIN public.catalog_product_variants variant
      ON variant.variant_slug = expected.variant_slug
    LEFT JOIN public.catalog_products product
      ON product.id = variant.product_id
     AND product.slug = 'lymow-one-plus'
     AND lower(product.brand) = 'lymow'
    GROUP BY expected.variant_slug
    HAVING count(variant.id) <> 1 OR count(product.id) <> 1
  ) THEN
    RAISE EXCEPTION
      'Each approved Lymow variant slug must resolve exactly once under Lymow One Plus.';
  END IF;
END
$verify$;

WITH expected (
  variant_slug,
  regular_price_cents,
  sale_price_cents,
  promotion_label
) AS (
  VALUES
    ('lymow-one-plus-5a', 299900, 279900, 'IDS Everyday Low Price'),
    ('lymow-one-plus-10a', 319900, 299900, 'IDS Everyday Low Price')
)
UPDATE public.catalog_product_variants variant
SET
  regular_price_cents = expected.regular_price_cents,
  sale_price_cents = expected.sale_price_cents,
  sale_starts_at = NULL,
  sale_ends_at = NULL,
  promotion_label = expected.promotion_label,
  show_public_price = true,
  contact_for_pricing = false,
  updated_at = now()
FROM public.catalog_products product,
     expected
WHERE product.id = variant.product_id
  AND product.slug = 'lymow-one-plus'
  AND lower(product.brand) = 'lymow'
  AND product.public_status = 'active'
  AND variant.public_status = 'active'
  AND expected.variant_slug = variant.variant_slug;

DO $verify$
DECLARE
  verified integer;
BEGIN
  SELECT count(*)
  INTO verified
  FROM public.catalog_product_variants variant
  JOIN public.catalog_products product
    ON product.id = variant.product_id
  JOIN (
    VALUES
      ('lymow-one-plus-5a', 299900, 279900, 'IDS Everyday Low Price'),
      ('lymow-one-plus-10a', 319900, 299900, 'IDS Everyday Low Price')
  ) AS expected(variant_slug, regular_price_cents, sale_price_cents, promotion_label)
    ON expected.variant_slug = variant.variant_slug
  WHERE product.slug = 'lymow-one-plus'
    AND lower(product.brand) = 'lymow'
    AND product.public_status = 'active'
    AND variant.public_status = 'active'
    AND variant.regular_price_cents = expected.regular_price_cents
    AND variant.sale_price_cents = expected.sale_price_cents
    AND variant.sale_starts_at IS NULL
    AND variant.sale_ends_at IS NULL
    AND variant.promotion_label = expected.promotion_label
    AND variant.show_public_price
    AND NOT variant.contact_for_pricing;

  IF verified <> 2 THEN
    RAISE EXCEPTION
      'Lymow everyday-pricing verification failed; verified % of 2 rows.',
      verified;
  END IF;
END
$verify$;

SELECT
  variant.variant_slug,
  variant.regular_price_cents,
  variant.sale_price_cents,
  variant.sale_starts_at,
  variant.sale_ends_at,
  variant.promotion_label,
  variant.show_public_price,
  variant.contact_for_pricing
FROM public.catalog_product_variants variant
JOIN public.catalog_products product
  ON product.id = variant.product_id
JOIN (
  VALUES
    ('lymow-one-plus-5a', 299900, 279900, 'IDS Everyday Low Price'),
    ('lymow-one-plus-10a', 319900, 299900, 'IDS Everyday Low Price')
) AS expected(variant_slug, regular_price_cents, sale_price_cents, promotion_label)
  ON expected.variant_slug = variant.variant_slug
WHERE product.slug = 'lymow-one-plus'
  AND lower(product.brand) = 'lymow'
ORDER BY variant.variant_slug;

ROLLBACK;
