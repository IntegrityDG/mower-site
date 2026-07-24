-- REVIEW ONLY: Yarbo Everyday Pricing 2026 proposal.
-- Do not execute as a permanent write until IDS separately approves it.
-- This file intentionally ends with ROLLBACK.
--
-- Approved policy:
--   regular_price_cents = Yarbo Standard MSRP
--   sale_price_cents = IDS Everyday Price
--   sale_starts_at = NULL
--   sale_ends_at = NULL
--   promotion_label = NULL
--
-- Scope:
--   * 1 Yarbo product row
--   * 5 active Yarbo option/module rows
--   * 23 active Yarbo package rows
--   * 29 total physical Yarbo records
--
-- Allowed columns:
--   regular_price_cents, sale_price_cents, sale_starts_at, sale_ends_at,
--   promotion_label, show_public_price, contact_for_pricing, updated_at
--
-- Explicitly out of scope:
--   dealer/internal cost, package-item relationships, compatibility,
--   quantities, descriptions, images, public status, sort order, services,
--   Lymow, Pandag, private monitoring records, RLS, grants, and permissions.

BEGIN;

SET LOCAL lock_timeout = '10s';

SELECT pg_advisory_xact_lock(
  hashtext('ids.yarbo-everyday-pricing-2026'),
  hashtext('review-only-price-proposal')
);

WITH
targets (
  target_type,
  slug,
  source_name,
  regular_price_cents,
  sale_price_cents,
  module_slugs
) AS (
  VALUES
    ('product', 'yarbo', 'Yarbo Core', 399900, 399900, '{}'::text[]),

    ('option', 'yarbo-snow-blower-module', 'Snow Blower Module', 129900, 129900, '{}'::text[]),
    ('option', 'yarbo-mower-module', 'Standard Lawn Mower Module', 129900, 99900, '{}'::text[]),
    ('option', 'yarbo-lawn-mower-pro-module', 'Lawn Mower Pro Module', 229900, 209900, '{}'::text[]),
    ('option', 'yarbo-leaf-blower-module', 'Blower Module', 109900, 109900, '{}'::text[]),
    ('option', 'yarbo-trimmer-module', 'Yarbo Trimmer Package', 79900, 79900, '{}'::text[]),

    ('package', 'yarbo-snow-blower', 'Snow Blower System', 499900, 499900, ARRAY['yarbo-snow-blower-module']),
    ('package', 'yarbo-lawn-mower', 'Lawn Mower System', 499900, 419900, ARRAY['yarbo-mower-module']),
    ('package', 'yarbo-lawn-mower-pro', 'Lawn Mower Pro System', 599900, 539900, ARRAY['yarbo-lawn-mower-pro-module']),
    ('package', 'yarbo-leaf-blower', 'Blower System', 479900, 479900, ARRAY['yarbo-leaf-blower-module']),
    ('package', 'yarbo-trimmer', 'Trimmer System', 454900, 454900, ARRAY['yarbo-trimmer-module']),
    ('package', 'yarbo-leaf-blower-trimmer', 'Blower + Trimmer System', 554900, 554900, ARRAY['yarbo-leaf-blower-module', 'yarbo-trimmer-module']),
    ('package', 'yarbo-lawn-mower-trimmer', 'Lawn Mower + Trimmer System', 574900, 484900, ARRAY['yarbo-mower-module', 'yarbo-trimmer-module']),
    ('package', 'yarbo-snow-blower-trimmer', 'Snow Blower + Trimmer System', 574900, 574900, ARRAY['yarbo-snow-blower-module', 'yarbo-trimmer-module']),
    ('package', 'yarbo-lawn-mower-pro-trimmer', 'Lawn Mower Pro + Trimmer System', 674900, 604900, ARRAY['yarbo-lawn-mower-pro-module', 'yarbo-trimmer-module']),
    ('package', 'yarbo-snow-lawn', 'Snow Blower + Lawn Mower System', 619900, 529900, ARRAY['yarbo-snow-blower-module', 'yarbo-mower-module']),
    ('package', 'yarbo-snow-leaf', 'Snow Blower + Blower System', 599900, 599900, ARRAY['yarbo-snow-blower-module', 'yarbo-leaf-blower-module']),
    ('package', 'yarbo-lawn-leaf', 'Lawn Mower + Blower System', 599900, 509900, ARRAY['yarbo-mower-module', 'yarbo-leaf-blower-module']),
    ('package', 'yarbo-snow-lawn-trimmer', 'Snow Blower + Lawn Mower + Trimmer System', 674900, 584900, ARRAY['yarbo-snow-blower-module', 'yarbo-mower-module', 'yarbo-trimmer-module']),
    ('package', 'yarbo-snow-leaf-trimmer', 'Snow Blower + Blower + Trimmer System', 654900, 654900, ARRAY['yarbo-snow-blower-module', 'yarbo-leaf-blower-module', 'yarbo-trimmer-module']),
    ('package', 'yarbo-lawn-leaf-trimmer', 'Lawn Mower + Blower + Trimmer System', 654900, 564900, ARRAY['yarbo-mower-module', 'yarbo-leaf-blower-module', 'yarbo-trimmer-module']),
    ('package', 'yarbo-pro-snow', 'Lawn Mower Pro + Snow Blower System', 719900, 649900, ARRAY['yarbo-lawn-mower-pro-module', 'yarbo-snow-blower-module']),
    ('package', 'yarbo-pro-leaf', 'Lawn Mower Pro + Blower System', 699900, 629900, ARRAY['yarbo-lawn-mower-pro-module', 'yarbo-leaf-blower-module']),
    ('package', 'yarbo-pro-snow-trimmer', 'Lawn Mower Pro + Snow Blower + Trimmer System', 774900, 704900, ARRAY['yarbo-lawn-mower-pro-module', 'yarbo-snow-blower-module', 'yarbo-trimmer-module']),
    ('package', 'yarbo-pro-leaf-trimmer', 'Lawn Mower Pro + Blower + Trimmer System', 754900, 684900, ARRAY['yarbo-lawn-mower-pro-module', 'yarbo-leaf-blower-module', 'yarbo-trimmer-module']),
    ('package', 'yarbo-lawn-snow-leaf', 'Lawn Mower + Snow Blower + Blower System', 699900, 609900, ARRAY['yarbo-mower-module', 'yarbo-snow-blower-module', 'yarbo-leaf-blower-module']),
    ('package', 'yarbo-pro-snow-leaf', 'Lawn Mower Pro + Snow Blower + Blower System', 799900, 729900, ARRAY['yarbo-lawn-mower-pro-module', 'yarbo-snow-blower-module', 'yarbo-leaf-blower-module']),
    ('package', 'yarbo-lawn-snow-leaf-trimmer', 'Lawn Mower + Snow Blower + Blower + Trimmer System', 774900, 684900, ARRAY['yarbo-mower-module', 'yarbo-snow-blower-module', 'yarbo-leaf-blower-module', 'yarbo-trimmer-module']),
    ('package', 'yarbo-pro-snow-leaf-trimmer', 'Lawn Mower Pro + Snow Blower + Blower + Trimmer System', 874900, 804900, ARRAY['yarbo-lawn-mower-pro-module', 'yarbo-snow-blower-module', 'yarbo-leaf-blower-module', 'yarbo-trimmer-module'])
),
before_state AS MATERIALIZED (
  SELECT
    target.target_type,
    target.slug,
    target.source_name,
    target.regular_price_cents AS proposed_regular_price_cents,
    target.sale_price_cents AS proposed_ids_price_cents,
    matched.table_name,
    matched.record_id,
    matched.record_name,
    matched.parent_product_slug,
    matched.parent_product_brand,
    matched.public_status,
    matched.regular_price_cents AS before_regular_price_cents,
    matched.sale_price_cents AS before_ids_price_cents,
    matched.sale_starts_at AS before_sale_starts_at,
    matched.sale_ends_at AS before_sale_ends_at,
    matched.promotion_label AS before_promotion_label,
    matched.show_public_price AS before_show_public_price,
    matched.contact_for_pricing AS before_contact_for_pricing,
    (
      matched.record_id IS NOT NULL
      AND matched.public_status = 'active'
      AND matched.parent_product_slug = 'yarbo'
      AND lower(matched.parent_product_brand) = 'yarbo'
    ) AS is_active_yarbo_record,
    (
      matched.record_id IS NOT NULL
      AND (
        matched.regular_price_cents,
        matched.sale_price_cents,
        matched.sale_starts_at,
        matched.sale_ends_at,
        matched.promotion_label,
        matched.show_public_price,
        matched.contact_for_pricing
      ) IS DISTINCT FROM (
        target.regular_price_cents,
        target.sale_price_cents,
        NULL::timestamptz,
        NULL::timestamptz,
        NULL::text,
        true,
        false
      )
    ) AS would_update
  FROM targets target
  LEFT JOIN LATERAL (
    SELECT
      'public.catalog_products'::text AS table_name,
      product.id::text AS record_id,
      product.name AS record_name,
      product.slug AS parent_product_slug,
      product.brand AS parent_product_brand,
      product.public_status,
      product.regular_price_cents,
      product.sale_price_cents,
      product.sale_starts_at,
      product.sale_ends_at,
      product.promotion_label,
      product.show_public_price,
      product.contact_for_pricing
    FROM public.catalog_products product
    WHERE target.target_type = 'product'
      AND product.slug = target.slug

    UNION ALL

    SELECT
      'public.catalog_options'::text,
      option_record.id::text,
      option_record.name,
      product.slug,
      product.brand,
      option_record.public_status,
      option_record.regular_price_cents,
      option_record.sale_price_cents,
      option_record.sale_starts_at,
      option_record.sale_ends_at,
      option_record.promotion_label,
      option_record.show_public_price,
      option_record.contact_for_pricing
    FROM public.catalog_products product
    JOIN public.catalog_options option_record
      ON option_record.product_id = product.id
    WHERE target.target_type = 'option'
      AND product.slug = 'yarbo'
      AND option_record.option_slug = target.slug

    UNION ALL

    SELECT
      'public.catalog_packages'::text,
      package_record.id::text,
      package_record.package_name,
      product.slug,
      product.brand,
      package_record.public_status,
      package_record.regular_price_cents,
      package_record.sale_price_cents,
      package_record.sale_starts_at,
      package_record.sale_ends_at,
      package_record.promotion_label,
      package_record.show_public_price,
      package_record.contact_for_pricing
    FROM public.catalog_products product
    JOIN public.catalog_packages package_record
      ON package_record.product_id = product.id
    WHERE target.target_type = 'package'
      AND product.slug = 'yarbo'
      AND package_record.package_slug = target.slug
  ) matched ON true
),
target_resolution AS (
  SELECT
    target.target_type,
    target.slug,
    count(before_state.record_id) AS database_match_count,
    count(before_state.record_id) FILTER (
      WHERE before_state.is_active_yarbo_record
    ) AS active_yarbo_match_count
  FROM targets target
  LEFT JOIN before_state
    ON before_state.target_type = target.target_type
   AND before_state.slug = target.slug
  GROUP BY target.target_type, target.slug
),
package_checks AS (
  SELECT
    target.slug,
    cardinality(target.module_slugs) AS expected_count,
    (
      SELECT count(*)
      FROM public.catalog_package_items item
      WHERE item.package_id = package_record.id
    ) AS actual_count,
    (
      SELECT count(DISTINCT option_record.option_slug)
      FROM public.catalog_package_items item
      JOIN public.catalog_options option_record
        ON option_record.id = item.option_id
      WHERE item.package_id = package_record.id
        AND option_record.option_slug = ANY(target.module_slugs)
        AND item.quantity = 1
        AND item.included_in_package_price = true
    ) AS matched_count,
    EXISTS (
      SELECT 1
      FROM public.catalog_package_items item
      JOIN public.catalog_options option_record
        ON option_record.id = item.option_id
      WHERE item.package_id = package_record.id
        AND (
          option_record.option_slug <> ALL(target.module_slugs)
          OR item.quantity <> 1
          OR item.included_in_package_price IS DISTINCT FROM true
        )
    ) AS has_unexpected_item
  FROM targets target
  JOIN public.catalog_products product
    ON product.slug = 'yarbo'
   AND lower(product.brand) = 'yarbo'
  JOIN public.catalog_packages package_record
    ON package_record.product_id = product.id
   AND package_record.package_slug = target.slug
  WHERE target.target_type = 'package'
),
validation AS (
  SELECT
    (SELECT count(*) FROM targets) AS target_count,
    (SELECT count(*) FROM targets WHERE target_type = 'product') AS product_count,
    (SELECT count(*) FROM targets WHERE target_type = 'option') AS option_count,
    (SELECT count(*) FROM targets WHERE target_type = 'package') AS package_count,
    (
      SELECT count(*)
      FROM (
        SELECT target_type, slug
        FROM targets
        GROUP BY target_type, slug
        HAVING count(*) > 1
      ) duplicate_definitions
    ) AS duplicate_definition_count,
    (
      SELECT count(*)
      FROM target_resolution
      WHERE active_yarbo_match_count = 0
    ) AS missing_target_count,
    (
      SELECT count(*)
      FROM target_resolution
      WHERE active_yarbo_match_count > 1
    ) AS duplicate_target_count,
    (
      SELECT coalesce(sum(cardinality(module_slugs)), 0)
      FROM targets
      WHERE target_type = 'package'
    ) AS package_item_target_count,
    (
      SELECT count(*)
      FROM package_checks
      WHERE actual_count <> expected_count
         OR matched_count <> expected_count
         OR has_unexpected_item
    ) AS bad_package_count
),
validation_gate AS MATERIALIZED (
  SELECT
    1 / CASE
      WHEN target_count = 29
       AND product_count = 1
       AND option_count = 5
       AND package_count = 23
       AND duplicate_definition_count = 0
       AND missing_target_count = 0
       AND duplicate_target_count = 0
       AND package_item_target_count = 52
       AND bad_package_count = 0
      THEN 1
      ELSE 0
    END AS ok
  FROM validation
),
updated_product AS (
  UPDATE public.catalog_products product
  SET
    regular_price_cents = target.regular_price_cents,
    sale_price_cents = target.sale_price_cents,
    sale_starts_at = NULL,
    sale_ends_at = NULL,
    promotion_label = NULL,
    show_public_price = true,
    contact_for_pricing = false,
    updated_at = now()
  FROM targets target
  CROSS JOIN validation_gate
  WHERE validation_gate.ok = 1
    AND target.target_type = 'product'
    AND product.slug = target.slug
    AND lower(product.brand) = 'yarbo'
    AND product.public_status = 'active'
    AND (
      product.regular_price_cents,
      product.sale_price_cents,
      product.sale_starts_at,
      product.sale_ends_at,
      product.promotion_label,
      product.show_public_price,
      product.contact_for_pricing
    ) IS DISTINCT FROM (
      target.regular_price_cents,
      target.sale_price_cents,
      NULL::timestamptz,
      NULL::timestamptz,
      NULL::text,
      true,
      false
    )
  RETURNING product.slug
),
updated_options AS (
  UPDATE public.catalog_options option_record
  SET
    regular_price_cents = target.regular_price_cents,
    sale_price_cents = target.sale_price_cents,
    sale_starts_at = NULL,
    sale_ends_at = NULL,
    promotion_label = NULL,
    show_public_price = true,
    contact_for_pricing = false,
    updated_at = now()
  FROM targets target
  JOIN public.catalog_products product
    ON product.slug = 'yarbo'
   AND lower(product.brand) = 'yarbo'
  CROSS JOIN validation_gate
  WHERE validation_gate.ok = 1
    AND target.target_type = 'option'
    AND option_record.product_id = product.id
    AND option_record.option_slug = target.slug
    AND option_record.public_status = 'active'
    AND (
      option_record.regular_price_cents,
      option_record.sale_price_cents,
      option_record.sale_starts_at,
      option_record.sale_ends_at,
      option_record.promotion_label,
      option_record.show_public_price,
      option_record.contact_for_pricing
    ) IS DISTINCT FROM (
      target.regular_price_cents,
      target.sale_price_cents,
      NULL::timestamptz,
      NULL::timestamptz,
      NULL::text,
      true,
      false
    )
  RETURNING option_record.option_slug
),
updated_packages AS (
  UPDATE public.catalog_packages package_record
  SET
    regular_price_cents = target.regular_price_cents,
    sale_price_cents = target.sale_price_cents,
    sale_starts_at = NULL,
    sale_ends_at = NULL,
    promotion_label = NULL,
    show_public_price = true,
    contact_for_pricing = false,
    updated_at = now()
  FROM targets target
  JOIN public.catalog_products product
    ON product.slug = 'yarbo'
   AND lower(product.brand) = 'yarbo'
  CROSS JOIN validation_gate
  WHERE validation_gate.ok = 1
    AND target.target_type = 'package'
    AND package_record.product_id = product.id
    AND package_record.package_slug = target.slug
    AND package_record.public_status = 'active'
    AND (
      package_record.regular_price_cents,
      package_record.sale_price_cents,
      package_record.sale_starts_at,
      package_record.sale_ends_at,
      package_record.promotion_label,
      package_record.show_public_price,
      package_record.contact_for_pricing
    ) IS DISTINCT FROM (
      target.regular_price_cents,
      target.sale_price_cents,
      NULL::timestamptz,
      NULL::timestamptz,
      NULL::text,
      true,
      false
    )
  RETURNING package_record.package_slug
),
update_counts AS (
  SELECT 'public.catalog_products'::text AS table_name, count(*)::integer AS updated_rows
  FROM updated_product
  UNION ALL
  SELECT 'public.catalog_options', count(*)::integer
  FROM updated_options
  UNION ALL
  SELECT 'public.catalog_packages', count(*)::integer
  FROM updated_packages
)
SELECT jsonb_build_object(
  'proposed_target_count',
  validation.target_count,
  'missing_target_count',
  validation.missing_target_count,
  'duplicate_target_count',
  validation.duplicate_target_count,
  'active_yarbo_match_count',
  (
    SELECT count(*)
    FROM before_state
    WHERE is_active_yarbo_record
  ),
  'unrelated_or_inactive_match_count',
  (
    SELECT count(*)
    FROM before_state
    WHERE record_id IS NOT NULL
      AND NOT is_active_yarbo_record
  ),
  'proposed_update_count',
  (
    SELECT count(*)
    FROM before_state
    WHERE is_active_yarbo_record
      AND would_update
  ),
  'already_correct_noop_count',
  (
    SELECT count(*)
    FROM before_state
    WHERE is_active_yarbo_record
      AND NOT would_update
  ),
  'rollback_protected_updated_row_count',
  (SELECT coalesce(sum(updated_rows), 0) FROM update_counts),
  'updates_by_table',
  (
    SELECT jsonb_agg(
      jsonb_build_object(
        'table_name', table_name,
        'updated_rows', updated_rows
      )
      ORDER BY table_name
    )
    FROM update_counts
  ),
  'pricing_groups',
  (
    SELECT jsonb_agg(
      jsonb_build_object(
        'target_type', target_type,
        'target_rows', target_rows,
        'identical_msrp_and_ids_rows', identical_msrp_and_ids_rows,
        'ids_lower_than_msrp_rows', ids_lower_than_msrp_rows
      )
      ORDER BY target_type
    )
    FROM (
      SELECT
        target_type,
        count(*) AS target_rows,
        count(*) FILTER (
          WHERE regular_price_cents = sale_price_cents
        ) AS identical_msrp_and_ids_rows,
        count(*) FILTER (
          WHERE regular_price_cents > sale_price_cents
        ) AS ids_lower_than_msrp_rows
      FROM targets
      GROUP BY target_type
    ) grouped_targets
  ),
  'exact_before_and_proposed_values',
  (
    SELECT jsonb_agg(
      jsonb_build_object(
        'target_type', target_type,
        'slug', slug,
        'source_name', source_name,
        'table_name', table_name,
        'record_id', record_id,
        'record_name', record_name,
        'parent_product_slug', parent_product_slug,
        'parent_product_brand', parent_product_brand,
        'public_status', public_status,
        'is_active_yarbo_record', is_active_yarbo_record,
        'before_regular_price_cents', before_regular_price_cents,
        'proposed_regular_price_cents', proposed_regular_price_cents,
        'before_ids_price_cents', before_ids_price_cents,
        'proposed_ids_price_cents', proposed_ids_price_cents,
        'before_sale_starts_at', before_sale_starts_at,
        'before_sale_ends_at', before_sale_ends_at,
        'before_promotion_label', before_promotion_label,
        'before_show_public_price', before_show_public_price,
        'before_contact_for_pricing', before_contact_for_pricing,
        'would_update', would_update
      )
      ORDER BY
        CASE target_type
          WHEN 'product' THEN 1
          WHEN 'option' THEN 2
          WHEN 'package' THEN 3
        END,
        slug,
        record_id
    )
    FROM before_state
  )
) AS yarbo_everyday_pricing_dry_run
FROM validation
CROSS JOIN validation_gate
WHERE validation_gate.ok = 1;

ROLLBACK;
