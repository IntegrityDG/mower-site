-- REVIEW ONLY: Fixed service pricing correction.
-- Do not execute until IDS approves running this proposal.
-- This file intentionally ends with ROLLBACK so a full-file run in one
-- session should not persist changes.
--
-- Scope:
--   * Approved fixed monthly service prices only:
--       - essential-care: 7900
--       - performance-management: 9900
--       - full-property-management: 14900
--   * Stable service and product slug lookups only.
--   * No physical-product pricing changes.
--   * No product-service relationship price duplication.
--   * No service payment option price or discount changes.
--   * Service Repair Visit remains call-for-pricing.

BEGIN;

SET LOCAL lock_timeout = '10s';

SELECT pg_advisory_xact_lock(
  hashtext('ids.fixed-service-pricing-correction'),
  hashtext('approved-monthly-service-plans')
);

DO $validate$
DECLARE
  matched integer;
BEGIN
  PERFORM service.id
  FROM public.catalog_services service
  WHERE service.service_slug IN (
    'essential-care',
    'performance-management',
    'full-property-management'
  )
  FOR UPDATE OF service;

  GET DIAGNOSTICS matched = ROW_COUNT;
  IF matched <> 3 THEN
    RAISE EXCEPTION 'Expected exactly three approved fixed-price service rows; found %.', matched;
  END IF;

  SELECT count(*)
  INTO matched
  FROM public.catalog_services service
  WHERE service.service_slug IN (
      'essential-care',
      'performance-management',
      'full-property-management'
    )
    AND service.public_status = 'active'
    AND service.billing_type = 'monthly'
    AND service.show_public_price = true
    AND service.contact_for_pricing = false
    AND service.sale_price_cents IS NULL
    AND service.sale_starts_at IS NULL
    AND service.sale_ends_at IS NULL
    AND service.promotion_label IS NULL;

  IF matched <> 3 THEN
    RAISE EXCEPTION 'Approved fixed-price service rows are not in the expected active monthly no-sale state. Manual review required.';
  END IF;

  SELECT count(*)
  INTO matched
  FROM public.catalog_services service
  WHERE service.service_slug = 'service-repair-visit'
    AND service.public_status = 'active'
    AND service.billing_type = 'quote_required'
    AND service.regular_price_cents IS NULL
    AND service.sale_price_cents IS NULL
    AND service.show_public_price = false
    AND service.contact_for_pricing = true;

  IF matched <> 1 THEN
    RAISE EXCEPTION 'Service Repair Visit is not in the expected call-for-pricing state. Manual review required.';
  END IF;

  WITH expected_payment_options(
    service_slug,
    payment_option_slug,
    regular_price_cents,
    billing_type,
    season_length_months,
    savings_label
  ) AS (
    VALUES
      ('essential-care', 'essential-care-monthly', 7900, 'monthly', 1, '$0 savings'),
      ('essential-care', 'essential-care-9-month-prepay', 63200, 'seasonal_prepay', 9, '$79 savings'),
      ('performance-management', 'performance-management-monthly', 9900, 'monthly', 1, '$0 savings'),
      ('performance-management', 'performance-management-9-month-prepay', 79200, 'seasonal_prepay', 9, '$99 savings'),
      ('full-property-management', 'full-property-management-monthly', 14900, 'monthly', 1, '$0 savings'),
      ('full-property-management', 'full-property-management-9-month-prepay', 119200, 'seasonal_prepay', 9, '$149 savings')
  )
  SELECT count(*)
  INTO matched
  FROM expected_payment_options expected
  JOIN public.catalog_services service
    ON service.service_slug = expected.service_slug
  JOIN public.catalog_service_payment_options payment_option
    ON payment_option.service_id = service.id
   AND payment_option.payment_option_slug = expected.payment_option_slug
   AND payment_option.regular_price_cents = expected.regular_price_cents
   AND payment_option.sale_price_cents IS NULL
   AND payment_option.billing_type = expected.billing_type
   AND payment_option.season_length_months = expected.season_length_months
   AND coalesce(payment_option.savings_label, '') = expected.savings_label
   AND payment_option.is_available = true;

  IF matched <> 6 THEN
    RAISE EXCEPTION 'Existing service payment option prices or savings labels do not match the approved catalog snapshot. Manual review required.';
  END IF;

  WITH expected_product_services(product_slug, service_slug) AS (
    VALUES
      ('lymow-one-plus', 'essential-care'),
      ('yarbo', 'essential-care'),
      ('lymow-one-plus', 'performance-management'),
      ('yarbo', 'performance-management'),
      ('pandag-g1', 'performance-management'),
      ('lymow-one-plus', 'full-property-management'),
      ('yarbo', 'full-property-management'),
      ('pandag-g1', 'full-property-management')
  )
  SELECT count(*)
  INTO matched
  FROM expected_product_services expected
  JOIN public.catalog_products product
    ON product.slug = expected.product_slug
  JOIN public.catalog_services service
    ON service.service_slug = expected.service_slug
  JOIN public.catalog_product_services product_service
    ON product_service.product_id = product.id
   AND product_service.service_id = service.id
   AND product_service.is_available = true
   AND product_service.override_regular_price_cents IS NULL
   AND product_service.override_sale_price_cents IS NULL
   AND product_service.override_sale_starts_at IS NULL
   AND product_service.override_sale_ends_at IS NULL
   AND product_service.override_promotion_label IS NULL
   AND product_service.override_show_public_price IS NULL
   AND product_service.override_contact_for_pricing IS NULL;

  IF matched <> 8 THEN
    RAISE EXCEPTION 'Expected eight inherited product-service rows with null overrides; found %. Manual review required.', matched;
  END IF;
END
$validate$;

WITH proposed_prices(service_slug, regular_price_cents) AS (
  VALUES
    ('essential-care', 7900),
    ('performance-management', 9900),
    ('full-property-management', 14900)
)
UPDATE public.catalog_services service
SET
  regular_price_cents = proposed_prices.regular_price_cents,
  show_public_price = true,
  contact_for_pricing = false,
  updated_at = now()
FROM proposed_prices
WHERE service.service_slug = proposed_prices.service_slug
  AND service.public_status = 'active'
  AND service.billing_type = 'monthly'
  AND service.sale_price_cents IS NULL
  AND service.sale_starts_at IS NULL
  AND service.sale_ends_at IS NULL
  AND service.promotion_label IS NULL
  AND (
    service.regular_price_cents,
    service.show_public_price,
    service.contact_for_pricing
  ) IS DISTINCT FROM (
    proposed_prices.regular_price_cents,
    true,
    false
  );

DO $verify$
DECLARE
  matched integer;
BEGIN
  WITH proposed_prices(service_slug, regular_price_cents) AS (
    VALUES
      ('essential-care', 7900),
      ('performance-management', 9900),
      ('full-property-management', 14900)
  )
  SELECT count(*)
  INTO matched
  FROM proposed_prices proposed
  JOIN public.catalog_services service
    ON service.service_slug = proposed.service_slug
   AND service.regular_price_cents = proposed.regular_price_cents
   AND service.show_public_price = true
   AND service.contact_for_pricing = false;

  IF matched <> 3 THEN
    RAISE EXCEPTION 'Fixed service price verification failed; expected three corrected base service rows, found %.', matched;
  END IF;

  WITH expected_product_services(product_slug, service_slug, effective_price_cents) AS (
    VALUES
      ('lymow-one-plus', 'essential-care', 7900),
      ('yarbo', 'essential-care', 7900),
      ('lymow-one-plus', 'performance-management', 9900),
      ('yarbo', 'performance-management', 9900),
      ('pandag-g1', 'performance-management', 9900),
      ('lymow-one-plus', 'full-property-management', 14900),
      ('yarbo', 'full-property-management', 14900),
      ('pandag-g1', 'full-property-management', 14900)
  )
  SELECT count(*)
  INTO matched
  FROM expected_product_services expected
  JOIN public.catalog_products product
    ON product.slug = expected.product_slug
  JOIN public.catalog_services service
    ON service.service_slug = expected.service_slug
  JOIN public.catalog_product_services product_service
    ON product_service.product_id = product.id
   AND product_service.service_id = service.id
   AND product_service.is_available = true
  WHERE coalesce(
    product_service.override_regular_price_cents,
    service.regular_price_cents
  ) = expected.effective_price_cents
    AND coalesce(
      product_service.override_show_public_price,
      service.show_public_price
    ) = true
    AND coalesce(
      product_service.override_contact_for_pricing,
      service.contact_for_pricing
    ) = false;

  IF matched <> 8 THEN
    RAISE EXCEPTION 'Inherited product-service price verification failed; expected eight inherited rows, found %.', matched;
  END IF;

  SELECT count(*)
  INTO matched
  FROM public.catalog_services service
  WHERE service.service_slug = 'service-repair-visit'
    AND service.regular_price_cents IS NULL
    AND service.show_public_price = false
    AND service.contact_for_pricing = true;

  IF matched <> 1 THEN
    RAISE EXCEPTION 'Service Repair Visit preservation verification failed.';
  END IF;
END
$verify$;

ROLLBACK;
