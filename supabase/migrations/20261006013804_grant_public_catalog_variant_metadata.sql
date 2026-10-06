begin;

-- The existing variant table uses column-specific public grants. New public
-- metadata must be granted explicitly: its retired_at field is also referenced
-- by visible relationship RLS policies and the public catalog filters.
grant select (retired_at, catalog_category, compatibility, image_url)
  on public.catalog_product_variants to anon, authenticated;

commit;
