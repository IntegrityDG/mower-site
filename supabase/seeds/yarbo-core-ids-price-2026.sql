-- REVIEW ONLY: approved Yarbo Core IDS Everyday Price correction.
-- This file intentionally ends with ROLLBACK.
--
-- Scope: exactly one active public.catalog_products row with:
--   slug = 'yarbo'
--   brand = 'Yarbo' (case-insensitive guard)
--   name = 'Yarbo Core'
--
-- Approved values:
--   regular_price_cents = 399900
--   sale_price_cents = 374900
--   sale_starts_at = NULL
--   sale_ends_at = NULL
--   promotion_label = NULL
--
-- Explicitly out of scope: catalog_options, catalog_packages, package items,
-- services, Lymow, Pandag, descriptions, specifications, and relationships.

BEGIN;

SET LOCAL lock_timeout = '10s';

SELECT pg_advisory_xact_lock(
  hashtext('ids.yarbo-core-ids-price-2026'),
  hashtext('approved-price-correction')
);

WITH target_state AS MATERIALIZED (
  SELECT
    product.id,
    product.slug,
    product.brand,
    product.name,
    product.public_status,
    product.regular_price_cents,
    product.sale_price_cents,
    product.sale_starts_at,
    product.sale_ends_at,
    product.promotion_label,
    product.show_public_price,
    product.contact_for_pricing,
    (
      product.public_status = 'active'
      AND lower(product.brand) = 'yarbo'
      AND product.name = 'Yarbo Core'
    ) AS is_valid_target,
    (
      product.regular_price_cents,
      product.sale_price_cents,
      product.sale_starts_at,
      product.sale_ends_at,
      product.promotion_label,
      product.show_public_price,
      product.contact_for_pricing
    ) IS DISTINCT FROM (
      399900,
      374900,
      NULL::timestamptz,
      NULL::timestamptz,
      NULL::text,
      true,
      false
    ) AS would_change
  FROM public.catalog_products product
  WHERE product.slug = 'yarbo'
),
counts AS (
  SELECT
    count(*) FILTER (WHERE is_valid_target) AS valid_target_count,
    count(*) FILTER (WHERE is_valid_target AND would_change) AS would_change_count,
    count(*) FILTER (WHERE is_valid_target AND NOT would_change) AS already_correct_count,
    CASE
      WHEN count(*) FILTER (WHERE is_valid_target) = 0 THEN 1
      ELSE 0
    END AS missing_count,
    greatest(count(*) FILTER (WHERE is_valid_target) - 1, 0) AS duplicate_count,
    count(*) FILTER (WHERE NOT is_valid_target) AS unrelated_or_inactive_match_count
  FROM target_state
)
SELECT
  target_state.id AS record_id,
  target_state.slug,
  target_state.brand,
  target_state.name,
  target_state.public_status,
  target_state.regular_price_cents AS before_regular_price_cents,
  target_state.sale_price_cents AS before_ids_price_cents,
  target_state.sale_starts_at AS before_sale_starts_at,
  target_state.sale_ends_at AS before_sale_ends_at,
  target_state.promotion_label AS before_promotion_label,
  399900 AS proposed_regular_price_cents,
  374900 AS proposed_ids_price_cents,
  NULL::timestamptz AS proposed_sale_starts_at,
  NULL::timestamptz AS proposed_sale_ends_at,
  NULL::text AS proposed_promotion_label,
  counts.valid_target_count,
  counts.would_change_count,
  counts.already_correct_count,
  counts.missing_count,
  counts.duplicate_count,
  counts.unrelated_or_inactive_match_count
FROM counts
LEFT JOIN target_state
  ON target_state.is_valid_target;

DO $guard$
DECLARE
  valid_targets integer;
  unrelated_or_inactive integer;
BEGIN
  SELECT
    count(*) FILTER (
      WHERE product.public_status = 'active'
        AND lower(product.brand) = 'yarbo'
        AND product.name = 'Yarbo Core'
    ),
    count(*) FILTER (
      WHERE NOT (
        product.public_status = 'active'
        AND lower(product.brand) = 'yarbo'
        AND product.name = 'Yarbo Core'
      )
    )
  INTO valid_targets, unrelated_or_inactive
  FROM public.catalog_products product
  WHERE product.slug = 'yarbo';

  IF valid_targets <> 1 THEN
    RAISE EXCEPTION
      'Expected exactly one active Yarbo Core target; found %.',
      valid_targets;
  END IF;

  IF unrelated_or_inactive <> 0 THEN
    RAISE EXCEPTION
      'Found % unrelated or inactive product row(s) with slug yarbo.',
      unrelated_or_inactive;
  END IF;
END
$guard$;

WITH before_state AS MATERIALIZED (
  SELECT
    product.id,
    product.regular_price_cents,
    product.sale_price_cents,
    product.sale_starts_at,
    product.sale_ends_at,
    product.promotion_label,
    (
      product.regular_price_cents,
      product.sale_price_cents,
      product.sale_starts_at,
      product.sale_ends_at,
      product.promotion_label,
      product.show_public_price,
      product.contact_for_pricing
    ) IS DISTINCT FROM (
      399900,
      374900,
      NULL::timestamptz,
      NULL::timestamptz,
      NULL::text,
      true,
      false
    ) AS would_change
  FROM public.catalog_products product
  WHERE product.slug = 'yarbo'
    AND product.public_status = 'active'
    AND lower(product.brand) = 'yarbo'
    AND product.name = 'Yarbo Core'
),
updated AS (
  UPDATE public.catalog_products product
  SET
    regular_price_cents = 399900,
    sale_price_cents = 374900,
    sale_starts_at = NULL,
    sale_ends_at = NULL,
    promotion_label = NULL,
    show_public_price = true,
    contact_for_pricing = false,
    updated_at = now()
  WHERE product.slug = 'yarbo'
    AND product.public_status = 'active'
    AND lower(product.brand) = 'yarbo'
    AND product.name = 'Yarbo Core'
    AND (
      product.regular_price_cents,
      product.sale_price_cents,
      product.sale_starts_at,
      product.sale_ends_at,
      product.promotion_label,
      product.show_public_price,
      product.contact_for_pricing
    ) IS DISTINCT FROM (
      399900,
      374900,
      NULL::timestamptz,
      NULL::timestamptz,
      NULL::text,
      true,
      false
  )
  RETURNING product.id
),
stored_report AS (
  SELECT set_config(
    'ids.yarbo_core_price_report',
    jsonb_build_object(
      'record_id', before_state.id,
      'before_regular_price_cents', before_state.regular_price_cents,
      'before_ids_price_cents', before_state.sale_price_cents,
      'before_sale_starts_at', before_state.sale_starts_at,
      'before_sale_ends_at', before_state.sale_ends_at,
      'before_promotion_label', before_state.promotion_label,
      'proposed_regular_price_cents', 399900,
      'proposed_ids_price_cents', 374900,
      'proposed_sale_starts_at', NULL,
      'proposed_sale_ends_at', NULL,
      'proposed_promotion_label', NULL,
      'valid_target_count', 1,
      'would_change_count', CASE WHEN before_state.would_change THEN 1 ELSE 0 END,
      'already_correct_count', CASE WHEN before_state.would_change THEN 0 ELSE 1 END,
      'missing_count', 0,
      'duplicate_count', 0,
      'unrelated_or_inactive_match_count', 0,
      'updated_count', (SELECT count(*) FROM updated)
    )::text,
    true
  ) AS report
  FROM before_state
)
SELECT report
FROM stored_report;

DO $verify$
DECLARE
  verified integer;
BEGIN
  SELECT count(*)
  INTO verified
  FROM public.catalog_products product
  WHERE product.slug = 'yarbo'
    AND product.public_status = 'active'
    AND lower(product.brand) = 'yarbo'
    AND product.name = 'Yarbo Core'
    AND product.regular_price_cents = 399900
    AND product.sale_price_cents = 374900
    AND product.sale_starts_at IS NULL
    AND product.sale_ends_at IS NULL
    AND product.promotion_label IS NULL
    AND product.show_public_price
    AND NOT product.contact_for_pricing;

  IF verified <> 1 THEN
    RAISE EXCEPTION
      'Yarbo Core price verification failed; verified % of 1 row.',
      verified;
  END IF;
END
$verify$;

SELECT
  report.value->>'record_id' AS record_id,
  product.slug,
  product.brand,
  product.name,
  (report.value->>'before_regular_price_cents')::integer AS before_regular_price_cents,
  (report.value->>'before_ids_price_cents')::integer AS before_ids_price_cents,
  report.value->>'before_sale_starts_at' AS before_sale_starts_at,
  report.value->>'before_sale_ends_at' AS before_sale_ends_at,
  report.value->>'before_promotion_label' AS before_promotion_label,
  (report.value->>'proposed_regular_price_cents')::integer AS proposed_regular_price_cents,
  (report.value->>'proposed_ids_price_cents')::integer AS proposed_ids_price_cents,
  report.value->>'proposed_sale_starts_at' AS proposed_sale_starts_at,
  report.value->>'proposed_sale_ends_at' AS proposed_sale_ends_at,
  report.value->>'proposed_promotion_label' AS proposed_promotion_label,
  (report.value->>'valid_target_count')::integer AS valid_target_count,
  (report.value->>'would_change_count')::integer AS would_change_count,
  (report.value->>'already_correct_count')::integer AS already_correct_count,
  (report.value->>'missing_count')::integer AS missing_count,
  (report.value->>'duplicate_count')::integer AS duplicate_count,
  (report.value->>'unrelated_or_inactive_match_count')::integer AS unrelated_or_inactive_match_count,
  (report.value->>'updated_count')::integer AS updated_count,
  product.regular_price_cents,
  product.sale_price_cents,
  product.sale_starts_at,
  product.sale_ends_at,
  product.promotion_label,
  product.show_public_price,
  product.contact_for_pricing
FROM (
  SELECT current_setting('ids.yarbo_core_price_report', true)::jsonb AS value
) report
JOIN public.catalog_products product
  ON product.id = (report.value->>'record_id')::uuid
WHERE product.slug = 'yarbo'
  AND product.public_status = 'active'
  AND lower(product.brand) = 'yarbo'
  AND product.name = 'Yarbo Core';

ROLLBACK;
