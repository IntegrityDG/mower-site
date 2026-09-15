BEGIN;

-- Purchasing authorization is distinct from public status and promotional pricing.
-- Reuse the base variant sale window; require both endpoints in the application.
ALTER TABLE public.catalog_product_variants
  ADD COLUMN preorder_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.catalog_product_variants.preorder_enabled IS
  'Explicit authorization for a coming_soon variant during its bounded sale_starts_at (inclusive) / sale_ends_at (exclusive) window. Promotions alone never authorize preorder.';

DO $$
BEGIN
  IF (SELECT count(*) FROM public.catalog_product_variants v
      JOIN public.catalog_products p ON p.id = v.product_id
      WHERE p.slug = 'yarbo' AND v.variant_slug = 'yarbo-y40p'
        AND v.public_status = 'coming_soon'
        AND v.sale_starts_at IS NOT NULL AND v.sale_ends_at IS NOT NULL
        AND v.sale_starts_at < v.sale_ends_at) <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one Coming Soon Y40P variant with a bounded Early Access window';
  END IF;
END $$;

-- Only the existing Y40P row is seeded. No status, price, date, or relationship changes.
UPDATE public.catalog_product_variants v
SET preorder_enabled = true
FROM public.catalog_products p
WHERE p.id = v.product_id AND p.slug = 'yarbo' AND v.variant_slug = 'yarbo-y40p';

-- Keep existing visible-row SELECT RLS and service-role authority.
-- Remove inherited broad browser table privileges, including TRUNCATE (not covered by RLS).
REVOKE ALL ON public.catalog_product_variants FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, product_id, variant_slug, sku, name, description, public_status,
  regular_price_cents, sale_price_cents, sale_starts_at, sale_ends_at,
  promotion_label, show_public_price, contact_for_pricing, sort_order,
  created_at, updated_at, display_msrp_price_cents, preorder_enabled
) ON public.catalog_product_variants TO anon, authenticated;

COMMIT;
