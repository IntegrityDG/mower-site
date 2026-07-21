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

CREATE TEMP TABLE _yarbo_everyday_price_targets (
  target_type text NOT NULL CHECK (target_type IN ('product', 'option', 'package')),
  slug text NOT NULL,
  source_name text NOT NULL,
  regular_price_cents integer NOT NULL CHECK (regular_price_cents >= 0),
  sale_price_cents integer NOT NULL CHECK (sale_price_cents >= 0),
  module_slugs text[] NOT NULL DEFAULT '{}'::text[],
  PRIMARY KEY (target_type, slug)
);

INSERT INTO _yarbo_everyday_price_targets (
  target_type,
  slug,
  source_name,
  regular_price_cents,
  sale_price_cents,
  module_slugs
)
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
  ('package', 'yarbo-pro-snow-leaf-trimmer', 'Lawn Mower Pro + Snow Blower + Blower + Trimmer System', 874900, 804900, ARRAY['yarbo-lawn-mower-pro-module', 'yarbo-snow-blower-module', 'yarbo-leaf-blower-module', 'yarbo-trimmer-module']);

DO $validate$
DECLARE
  matched integer;
  bad_targets text;
BEGIN
  SELECT count(*)
  INTO matched
  FROM _yarbo_everyday_price_targets;

  IF matched <> 29 THEN
    RAISE EXCEPTION 'Expected 29 Yarbo pricing targets; found %.', matched;
  END IF;

  SELECT count(*)
  INTO matched
  FROM _yarbo_everyday_price_targets
  WHERE target_type = 'product';

  IF matched <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one Yarbo product target; found %.', matched;
  END IF;

  SELECT count(*)
  INTO matched
  FROM _yarbo_everyday_price_targets
  WHERE target_type = 'option';

  IF matched <> 5 THEN
    RAISE EXCEPTION 'Expected exactly five Yarbo option targets; found %.', matched;
  END IF;

  SELECT count(*)
  INTO matched
  FROM _yarbo_everyday_price_targets
  WHERE target_type = 'package';

  IF matched <> 23 THEN
    RAISE EXCEPTION 'Expected exactly 23 Yarbo package targets; found %.', matched;
  END IF;

  WITH target_matches AS (
    SELECT
      target.target_type,
      target.slug,
      count(matched_record.id) AS match_count
    FROM _yarbo_everyday_price_targets target
    LEFT JOIN LATERAL (
      SELECT product.id
      FROM public.catalog_products product
      WHERE target.target_type = 'product'
        AND product.slug = target.slug
        AND product.public_status = 'active'

      UNION ALL

      SELECT option_record.id
      FROM public.catalog_products product
      JOIN public.catalog_options option_record
        ON option_record.product_id = product.id
      WHERE target.target_type = 'option'
        AND product.slug = 'yarbo'
        AND product.public_status = 'active'
        AND option_record.option_slug = target.slug
        AND option_record.public_status = 'active'

      UNION ALL

      SELECT package_record.id
      FROM public.catalog_products product
      JOIN public.catalog_packages package_record
        ON package_record.product_id = product.id
      WHERE target.target_type = 'package'
        AND product.slug = 'yarbo'
        AND product.public_status = 'active'
        AND package_record.package_slug = target.slug
        AND package_record.public_status = 'active'
    ) matched_record ON true
    GROUP BY target.target_type, target.slug
  )
  SELECT string_agg(
    format('%s:%s matched %s active row(s)', target_type, slug, match_count),
    '; '
    ORDER BY target_type, slug
  )
  INTO bad_targets
  FROM target_matches
  WHERE match_count <> 1;

  IF bad_targets IS NOT NULL THEN
    RAISE EXCEPTION 'Missing or ambiguous Yarbo pricing target(s): %', bad_targets;
  END IF;

  SELECT coalesce(sum(cardinality(module_slugs)), 0)
  INTO matched
  FROM _yarbo_everyday_price_targets
  WHERE target_type = 'package';

  IF matched <> 52 THEN
    RAISE EXCEPTION 'Expected 52 package-item module relationships from package targets; found %.', matched;
  END IF;

  WITH package_checks AS (
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
    FROM _yarbo_everyday_price_targets target
    JOIN public.catalog_products product
      ON product.slug = 'yarbo'
    JOIN public.catalog_packages package_record
      ON package_record.product_id = product.id
     AND package_record.package_slug = target.slug
    WHERE target.target_type = 'package'
  )
  SELECT string_agg(
    format(
      '%s expected %s module item(s), found %s item(s), matched %s expected item(s)',
      slug,
      expected_count,
      actual_count,
      matched_count
    ),
    '; '
    ORDER BY slug
  )
  INTO bad_targets
  FROM package_checks
  WHERE actual_count <> expected_count
     OR matched_count <> expected_count
     OR has_unexpected_item;

  IF bad_targets IS NOT NULL THEN
    RAISE EXCEPTION 'Yarbo package-item relationships do not match pricing target expectations: %', bad_targets;
  END IF;
END
$validate$;

CREATE TEMP TABLE _yarbo_everyday_pricing_update_log (
  table_name text PRIMARY KEY,
  updated_rows integer NOT NULL
);

WITH updated_product AS (
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
  FROM _yarbo_everyday_price_targets target
  WHERE target.target_type = 'product'
    AND product.slug = target.slug
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
)
INSERT INTO _yarbo_everyday_pricing_update_log(table_name, updated_rows)
SELECT 'public.catalog_products', count(*)::integer
FROM updated_product;

WITH updated_options AS (
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
  FROM _yarbo_everyday_price_targets target
  JOIN public.catalog_products product
    ON product.slug = 'yarbo'
  WHERE target.target_type = 'option'
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
)
INSERT INTO _yarbo_everyday_pricing_update_log(table_name, updated_rows)
SELECT 'public.catalog_options', count(*)::integer
FROM updated_options;

WITH updated_packages AS (
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
  FROM _yarbo_everyday_price_targets target
  JOIN public.catalog_products product
    ON product.slug = 'yarbo'
  WHERE target.target_type = 'package'
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
)
INSERT INTO _yarbo_everyday_pricing_update_log(table_name, updated_rows)
SELECT 'public.catalog_packages', count(*)::integer
FROM updated_packages;

DO $verify$
DECLARE
  matched integer;
BEGIN
  WITH verified_targets AS (
    SELECT target.target_type, target.slug
    FROM _yarbo_everyday_price_targets target
    JOIN public.catalog_products product
      ON target.target_type = 'product'
     AND product.slug = target.slug
     AND product.public_status = 'active'
     AND product.regular_price_cents = target.regular_price_cents
     AND product.sale_price_cents = target.sale_price_cents
     AND product.sale_starts_at IS NULL
     AND product.sale_ends_at IS NULL
     AND product.promotion_label IS NULL
     AND product.show_public_price = true
     AND product.contact_for_pricing = false

    UNION ALL

    SELECT target.target_type, target.slug
    FROM _yarbo_everyday_price_targets target
    JOIN public.catalog_products product
      ON product.slug = 'yarbo'
     AND product.public_status = 'active'
    JOIN public.catalog_options option_record
      ON target.target_type = 'option'
     AND option_record.product_id = product.id
     AND option_record.option_slug = target.slug
     AND option_record.public_status = 'active'
     AND option_record.regular_price_cents = target.regular_price_cents
     AND option_record.sale_price_cents = target.sale_price_cents
     AND option_record.sale_starts_at IS NULL
     AND option_record.sale_ends_at IS NULL
     AND option_record.promotion_label IS NULL
     AND option_record.show_public_price = true
     AND option_record.contact_for_pricing = false

    UNION ALL

    SELECT target.target_type, target.slug
    FROM _yarbo_everyday_price_targets target
    JOIN public.catalog_products product
      ON product.slug = 'yarbo'
     AND product.public_status = 'active'
    JOIN public.catalog_packages package_record
      ON target.target_type = 'package'
     AND package_record.product_id = product.id
     AND package_record.package_slug = target.slug
     AND package_record.public_status = 'active'
     AND package_record.regular_price_cents = target.regular_price_cents
     AND package_record.sale_price_cents = target.sale_price_cents
     AND package_record.sale_starts_at IS NULL
     AND package_record.sale_ends_at IS NULL
     AND package_record.promotion_label IS NULL
     AND package_record.show_public_price = true
     AND package_record.contact_for_pricing = false
  )
  SELECT count(*)
  INTO matched
  FROM verified_targets;

  IF matched <> 29 THEN
    RAISE EXCEPTION 'Yarbo everyday pricing verification failed; expected 29 verified targets, found %.', matched;
  END IF;
END
$verify$;

SELECT
  table_name,
  updated_rows
FROM _yarbo_everyday_pricing_update_log
ORDER BY table_name;

SELECT
  target_type,
  count(*) AS target_rows,
  count(*) FILTER (WHERE regular_price_cents = sale_price_cents) AS identical_msrp_and_ids_rows,
  count(*) FILTER (WHERE regular_price_cents > sale_price_cents) AS ids_lower_than_msrp_rows
FROM _yarbo_everyday_price_targets
GROUP BY target_type
ORDER BY target_type;

ROLLBACK;
