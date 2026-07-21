-- REVIEW/AUDIT COPY: Lymow One Plus Best Fit guidance.
-- Permanent execution was approved and completed on 2026-07-21 using this
-- same guarded logic with COMMIT.
-- First approved execution: 1 update.
-- Immediate second execution: 0 updates.
-- This review file intentionally still ends with ROLLBACK.
--
-- Scope:
--   * One active public Lymow product row: catalog_products.slug = 'lymow-one-plus'
--   * One customer-facing field: customer_guidance
--
-- Explicitly out of scope:
--   pricing, variants, charger relationships, packages, services, images,
--   Yarbo, Pandag, RLS, grants, and permissions.

BEGIN;

SET LOCAL lock_timeout = '10s';

SELECT pg_advisory_xact_lock(
  hashtext('ids.lymow-best-fit-guidance'),
  hashtext('customer-guidance-only')
);

DO $validate$
DECLARE
  matched integer;
BEGIN
  SELECT count(*)
  INTO matched
  FROM public.catalog_products product
  WHERE product.slug = 'lymow-one-plus'
    AND product.brand = 'Lymow'
    AND product.public_status = 'active';

  IF matched <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one active Lymow One Plus product row; found %.', matched;
  END IF;
END
$validate$;

WITH proposed(customer_guidance) AS (
  VALUES (
    'Small to large residential and commercial properties with tight spaces, narrow passages, and complex layouts'
  )
),
updated AS (
  UPDATE public.catalog_products product
  SET
    customer_guidance = proposed.customer_guidance,
    updated_at = now()
  FROM proposed
  WHERE product.slug = 'lymow-one-plus'
    AND product.brand = 'Lymow'
    AND product.public_status = 'active'
    AND product.customer_guidance IS DISTINCT FROM proposed.customer_guidance
  RETURNING product.slug
)
SELECT count(*) AS proposed_customer_guidance_updates
FROM updated;

DO $verify$
DECLARE
  matched integer;
BEGIN
  SELECT count(*)
  INTO matched
  FROM public.catalog_products product
  WHERE product.slug = 'lymow-one-plus'
    AND product.brand = 'Lymow'
    AND product.public_status = 'active'
    AND product.customer_guidance = 'Small to large residential and commercial properties with tight spaces, narrow passages, and complex layouts';

  IF matched <> 1 THEN
    RAISE EXCEPTION 'Lymow One Plus customer_guidance verification failed; found % matching row(s).', matched;
  END IF;
END
$verify$;

ROLLBACK;
