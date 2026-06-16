-- IDS catalog schema proposal.
-- This migration creates new catalog tables only. It does not modify the
-- existing quote_requests table or any existing RLS policy.

create schema if not exists catalog_private;

-- Public catalog products shown on homepage cards, product pages, and purchase flows.
create table public.catalog_products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  brand text not null,
  name text not null,
  homepage_summary text,
  full_description text,
  capability_level text,
  property_scale text,
  customer_guidance text,
  is_featured boolean not null default false,
  public_status text not null default 'hidden'
    check (public_status in ('active', 'unavailable', 'coming_soon', 'hidden')),
  sort_order integer not null default 0,
  brochure_url text,
  video_url text,
  regular_price_cents integer check (regular_price_cents is null or regular_price_cents >= 0),
  sale_price_cents integer check (sale_price_cents is null or sale_price_cents >= 0),
  sale_starts_at timestamptz,
  sale_ends_at timestamptz,
  promotion_label text,
  show_public_price boolean not null default false,
  contact_for_pricing boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sale_ends_at is null or sale_starts_at is null or sale_ends_at >= sale_starts_at)
);

-- Product variants for SKUs/configurations that need distinct pricing or availability.
create table public.catalog_product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  variant_slug text not null,
  sku text,
  name text not null,
  description text,
  public_status text not null default 'hidden'
    check (public_status in ('active', 'unavailable', 'coming_soon', 'hidden')),
  regular_price_cents integer check (regular_price_cents is null or regular_price_cents >= 0),
  sale_price_cents integer check (sale_price_cents is null or sale_price_cents >= 0),
  sale_starts_at timestamptz,
  sale_ends_at timestamptz,
  promotion_label text,
  show_public_price boolean not null default false,
  contact_for_pricing boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, variant_slug),
  check (sale_ends_at is null or sale_starts_at is null or sale_ends_at >= sale_starts_at)
);

-- Product images and videos used by cards, product pages, and future galleries.
create table public.catalog_product_media (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  media_type text not null check (media_type in ('image', 'video')),
  url text not null,
  alt_text text,
  caption text,
  is_primary boolean not null default false,
  show_on_product_page boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Top-level editable content and SEO metadata for dedicated product pages.
create table public.catalog_product_pages (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null unique references public.catalog_products(id) on delete cascade,
  seo_title text,
  seo_description text,
  hero_heading text,
  hero_subheading text,
  long_form_content text,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Editable product page sections rendered by known Next.js layouts.
create table public.catalog_product_page_sections (
  id uuid primary key default gen_random_uuid(),
  product_page_id uuid not null references public.catalog_product_pages(id) on delete cascade,
  section_type text not null,
  heading text,
  body_content text,
  media_url text,
  button_label text,
  button_url text,
  sort_order integer not null default 0,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Configuration groups such as required chargers, optional modules, quantities, and included equipment.
create table public.catalog_option_groups (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  group_slug text not null,
  group_name text not null,
  group_description text,
  selection_type text not null
    check (selection_type in ('single', 'multiple', 'quantity', 'included')),
  is_required boolean not null default false,
  minimum_selections integer not null default 0 check (minimum_selections >= 0),
  maximum_selections integer check (maximum_selections is null or maximum_selections >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, group_slug),
  check (maximum_selections is null or maximum_selections >= minimum_selections)
);

-- Individual options, accessories, modules, chargers, docks, and included equipment.
create table public.catalog_options (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  option_group_id uuid references public.catalog_option_groups(id) on delete set null,
  option_slug text not null,
  name text not null,
  description text,
  public_status text not null default 'hidden'
    check (public_status in ('active', 'unavailable', 'coming_soon', 'hidden')),
  is_required boolean not null default false,
  is_included boolean not null default false,
  is_recommended boolean not null default false,
  default_quantity integer not null default 0 check (default_quantity >= 0),
  minimum_quantity integer not null default 0 check (minimum_quantity >= 0),
  maximum_quantity integer check (maximum_quantity is null or maximum_quantity >= 0),
  regular_price_cents integer check (regular_price_cents is null or regular_price_cents >= 0),
  sale_price_cents integer check (sale_price_cents is null or sale_price_cents >= 0),
  sale_starts_at timestamptz,
  sale_ends_at timestamptz,
  promotion_label text,
  show_public_price boolean not null default false,
  contact_for_pricing boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, option_slug),
  check (maximum_quantity is null or maximum_quantity >= minimum_quantity),
  check (default_quantity >= minimum_quantity),
  check (maximum_quantity is null or default_quantity <= maximum_quantity),
  check (sale_ends_at is null or sale_starts_at is null or sale_ends_at >= sale_starts_at)
);

-- Links variants to the options that define or are compatible with that variant.
create table public.catalog_variant_options (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.catalog_product_variants(id) on delete cascade,
  option_id uuid not null references public.catalog_options(id) on delete cascade,
  relationship_type text not null default 'included'
    check (relationship_type in ('defines_variant', 'included', 'compatible', 'required', 'excluded')),
  quantity integer not null default 1 check (quantity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (variant_id, option_id, relationship_type)
);

-- Product packages and bundles managed without hardcoded package names in the UI.
create table public.catalog_packages (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  package_slug text not null,
  package_name text not null,
  description text,
  public_status text not null default 'hidden'
    check (public_status in ('active', 'unavailable', 'coming_soon', 'hidden')),
  regular_price_cents integer check (regular_price_cents is null or regular_price_cents >= 0),
  sale_price_cents integer check (sale_price_cents is null or sale_price_cents >= 0),
  sale_starts_at timestamptz,
  sale_ends_at timestamptz,
  promotion_label text,
  show_public_price boolean not null default false,
  contact_for_pricing boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, package_slug),
  check (sale_ends_at is null or sale_starts_at is null or sale_ends_at >= sale_starts_at)
);

-- Options included in each package, with quantities and package-price behavior.
create table public.catalog_package_items (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.catalog_packages(id) on delete cascade,
  option_id uuid not null references public.catalog_options(id) on delete restrict,
  quantity integer not null default 1 check (quantity > 0),
  included_in_package_price boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (package_id, option_id)
);

-- Public service offerings such as deployment, remote guidance, care, management, and repair.
create table public.catalog_services (
  id uuid primary key default gen_random_uuid(),
  service_slug text not null unique,
  name text not null,
  description text,
  service_category text not null
    check (service_category in ('installation', 'remote_support', 'ongoing_support', 'property_management', 'repair', 'referral', 'seasonal_storage')),
  billing_type text not null
    check (billing_type in ('one_time', 'hourly', 'monthly', 'seasonal', 'included', 'quote_required')),
  requires_local_service boolean not null default false,
  requires_property_review boolean not null default false,
  estimated_hours numeric(6, 2) check (estimated_hours is null or estimated_hours >= 0),
  maximum_visit_hours numeric(6, 2) check (maximum_visit_hours is null or maximum_visit_hours >= 0),
  season_length text,
  public_status text not null default 'hidden'
    check (public_status in ('active', 'unavailable', 'coming_soon', 'hidden')),
  regular_price_cents integer check (regular_price_cents is null or regular_price_cents >= 0),
  sale_price_cents integer check (sale_price_cents is null or sale_price_cents >= 0),
  sale_starts_at timestamptz,
  sale_ends_at timestamptz,
  promotion_label text,
  show_public_price boolean not null default false,
  contact_for_pricing boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (maximum_visit_hours is null or estimated_hours is null or maximum_visit_hours >= estimated_hours),
  check (sale_ends_at is null or sale_starts_at is null or sale_ends_at >= sale_starts_at)
);

-- Product-to-service availability and product-specific public price overrides.
create table public.catalog_product_services (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  service_id uuid not null references public.catalog_services(id) on delete cascade,
  is_available boolean not null default true,
  is_recommended boolean not null default false,
  is_required boolean not null default false,
  override_regular_price_cents integer check (override_regular_price_cents is null or override_regular_price_cents >= 0),
  override_sale_price_cents integer check (override_sale_price_cents is null or override_sale_price_cents >= 0),
  override_sale_starts_at timestamptz,
  override_sale_ends_at timestamptz,
  override_promotion_label text,
  override_show_public_price boolean,
  override_contact_for_pricing boolean,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, service_id),
  check (override_sale_ends_at is null or override_sale_starts_at is null or override_sale_ends_at >= override_sale_starts_at)
);

-- Public region labels used to determine local service availability.
create table public.catalog_service_regions (
  id uuid primary key default gen_random_uuid(),
  state text not null,
  region_name text not null,
  public_status text not null default 'hidden'
    check (public_status in ('active', 'unavailable', 'coming_soon', 'hidden')),
  local_services_available boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (state, region_name)
);

-- Public price schedules for future effective-dated product, option, package, service, or product-service prices.
create table public.catalog_price_schedules (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.catalog_products(id) on delete cascade,
  variant_id uuid references public.catalog_product_variants(id) on delete cascade,
  option_id uuid references public.catalog_options(id) on delete cascade,
  package_id uuid references public.catalog_packages(id) on delete cascade,
  service_id uuid references public.catalog_services(id) on delete cascade,
  product_service_id uuid references public.catalog_product_services(id) on delete cascade,
  schedule_name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  regular_price_cents integer check (regular_price_cents is null or regular_price_cents >= 0),
  sale_price_cents integer check (sale_price_cents is null or sale_price_cents >= 0),
  promotion_label text,
  show_public_price boolean not null default false,
  contact_for_pricing boolean not null default true,
  public_status text not null default 'hidden'
    check (public_status in ('active', 'unavailable', 'coming_soon', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at),
  check (num_nonnulls(product_id, variant_id, option_id, package_id, service_id, product_service_id) = 1)
);

-- Private dealer/internal pricing, supplier notes, margins, and cost data.
-- This lives outside the public schema so it is kept separate from customer-facing catalog data.
create table catalog_private.catalog_internal_pricing (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.catalog_products(id) on delete cascade,
  variant_id uuid references public.catalog_product_variants(id) on delete cascade,
  option_id uuid references public.catalog_options(id) on delete cascade,
  package_id uuid references public.catalog_packages(id) on delete cascade,
  service_id uuid references public.catalog_services(id) on delete cascade,
  product_service_id uuid references public.catalog_product_services(id) on delete cascade,
  supplier_name text,
  supplier_sku text,
  dealer_cost_cents integer check (dealer_cost_cents is null or dealer_cost_cents >= 0),
  internal_price_cents integer check (internal_price_cents is null or internal_price_cents >= 0),
  target_margin_basis_points integer check (target_margin_basis_points is null or target_margin_basis_points >= 0),
  supplier_notes text,
  private_notes text,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at >= starts_at),
  check (num_nonnulls(product_id, variant_id, option_id, package_id, service_id, product_service_id) = 1)
);

-- Private manufacturer/source records for semi-automatic catalog monitoring.
-- Public manufacturer pages can be checked automatically or semi-automatically where available.
-- Lymow and Yarbo sources may monitor public specs, MSRP, public sale pricing, brochures, manuals, videos, images, and public website changes.
-- Pandag sources may monitor public specs, descriptions, manuals, brochures, images, videos, features, runtime, coverage, cutting width, availability, and other non-pricing public website information.
-- Pandag pricing must never be automatically fetched or auto-updated from a website because Pandag does not publish public pricing.
-- Manual-only sources, including private emailed dealer sheets or price lists, are admin-entered/imported only.
-- They may still create pending review suggestions after import, including Pandag emailed price sheets, but must not be fetched from manufacturer websites.
-- Source checks are internal only and create reviewable suggestions; they do not update public catalog tables automatically.
create table catalog_private.catalog_source_targets (
  id uuid primary key default gen_random_uuid(),
  target_type text not null
    check (target_type in ('product', 'variant', 'option', 'package', 'service', 'product_service')),
  product_id uuid references public.catalog_products(id) on delete cascade,
  variant_id uuid references public.catalog_product_variants(id) on delete cascade,
  option_id uuid references public.catalog_options(id) on delete cascade,
  package_id uuid references public.catalog_packages(id) on delete cascade,
  service_id uuid references public.catalog_services(id) on delete cascade,
  product_service_id uuid references public.catalog_product_services(id) on delete cascade,
  source_brand text,
  source_name text,
  source_url text,
  source_kind text not null
    check (source_kind in ('manufacturer_product_page', 'manufacturer_pricing_page', 'manufacturer_specs_page', 'brochure', 'manual', 'dealer_sheet', 'emailed_price_sheet', 'other')),
  fields_to_monitor jsonb not null default '{}'::jsonb,
  public_pricing_monitoring_allowed boolean not null default false,
  source_notes text,
  pricing_monitoring_notes text,
  check_frequency text not null default 'manual'
    check (check_frequency in ('manual', 'daily', 'weekly', 'monthly')),
  manual_only boolean not null default false,
  is_active boolean not null default true,
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_brand is null or length(btrim(source_brand)) > 0),
  check (jsonb_typeof(fields_to_monitor) = 'object'),
  check (source_url is not null or manual_only),
  check (not manual_only or check_frequency = 'manual'),
  check (not manual_only or not public_pricing_monitoring_allowed),
  check (source_kind <> 'manufacturer_pricing_page' or public_pricing_monitoring_allowed),
  check (source_kind <> 'emailed_price_sheet' or (manual_only and not public_pricing_monitoring_allowed)),
  check (lower(source_brand) <> 'pandag' or not public_pricing_monitoring_allowed),
  check (lower(source_brand) <> 'pandag' or source_kind <> 'manufacturer_pricing_page'),
  check (num_nonnulls(product_id, variant_id, option_id, package_id, service_id, product_service_id) = 1),
  check (
    (target_type = 'product' and product_id is not null)
    or (target_type = 'variant' and variant_id is not null)
    or (target_type = 'option' and option_id is not null)
    or (target_type = 'package' and package_id is not null)
    or (target_type = 'service' and service_id is not null)
    or (target_type = 'product_service' and product_service_id is not null)
  )
);

-- Private immutable-ish results from each source check.
-- Snapshots preserve detected manufacturer/spec/price data for IDS review without changing what the public website reads.
create table catalog_private.catalog_source_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_target_id uuid not null references catalog_private.catalog_source_targets(id) on delete cascade,
  checked_at timestamptz not null default now(),
  http_status integer,
  content_hash text,
  extracted_data jsonb,
  raw_excerpt text,
  success boolean not null default false,
  error_message text,
  created_at timestamptz not null default now()
);

-- Private review queue for proposed catalog changes found by source monitoring.
-- Suggestions must be reviewed before any approved update is applied to public catalog records.
create table catalog_private.catalog_change_suggestions (
  id uuid primary key default gen_random_uuid(),
  source_target_id uuid not null references catalog_private.catalog_source_targets(id) on delete cascade,
  snapshot_id uuid references catalog_private.catalog_source_snapshots(id) on delete set null,
  target_type text not null
    check (target_type in ('product', 'variant', 'option', 'package', 'service', 'product_service')),
  target_table text not null,
  target_record_id uuid not null,
  field_name text not null,
  current_value text,
  suggested_value text,
  confidence_score numeric(5, 2) check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 100)),
  suggestion_reason text,
  review_status text not null default 'pending'
    check (review_status in ('pending', 'approved', 'rejected', 'ignored', 'applied')),
  reviewed_at timestamptz,
  reviewed_by text,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index catalog_products_public_lookup_idx
  on public.catalog_products (public_status, is_featured, sort_order);
create index catalog_product_variants_product_idx
  on public.catalog_product_variants (product_id, public_status, sort_order);
create index catalog_product_media_product_idx
  on public.catalog_product_media (product_id, is_primary, sort_order);
create index catalog_product_page_sections_page_idx
  on public.catalog_product_page_sections (product_page_id, is_published, sort_order);
create index catalog_option_groups_product_idx
  on public.catalog_option_groups (product_id, sort_order);
create index catalog_options_product_group_idx
  on public.catalog_options (product_id, option_group_id, public_status, sort_order);
create index catalog_variant_options_variant_idx
  on public.catalog_variant_options (variant_id);
create index catalog_packages_product_idx
  on public.catalog_packages (product_id, public_status, sort_order);
create index catalog_package_items_package_idx
  on public.catalog_package_items (package_id);
create index catalog_services_public_idx
  on public.catalog_services (public_status, service_category, sort_order);
create index catalog_product_services_product_idx
  on public.catalog_product_services (product_id, is_available, sort_order);
create index catalog_service_regions_lookup_idx
  on public.catalog_service_regions (state, region_name, public_status);
create index catalog_price_schedules_window_idx
  on public.catalog_price_schedules (public_status, starts_at, ends_at);
create index catalog_source_targets_target_idx
  on catalog_private.catalog_source_targets (target_type, source_brand, is_active, manual_only, public_pricing_monitoring_allowed, check_frequency);
create index catalog_source_targets_product_idx
  on catalog_private.catalog_source_targets (product_id)
  where product_id is not null;
create index catalog_source_targets_variant_idx
  on catalog_private.catalog_source_targets (variant_id)
  where variant_id is not null;
create index catalog_source_targets_option_idx
  on catalog_private.catalog_source_targets (option_id)
  where option_id is not null;
create index catalog_source_targets_package_idx
  on catalog_private.catalog_source_targets (package_id)
  where package_id is not null;
create index catalog_source_targets_service_idx
  on catalog_private.catalog_source_targets (service_id)
  where service_id is not null;
create index catalog_source_targets_product_service_idx
  on catalog_private.catalog_source_targets (product_service_id)
  where product_service_id is not null;
create index catalog_source_snapshots_target_idx
  on catalog_private.catalog_source_snapshots (source_target_id, checked_at desc);
create index catalog_change_suggestions_review_idx
  on catalog_private.catalog_change_suggestions (review_status, created_at);
create index catalog_change_suggestions_target_idx
  on catalog_private.catalog_change_suggestions (target_type, target_record_id);

alter table public.catalog_products enable row level security;
alter table public.catalog_product_variants enable row level security;
alter table public.catalog_product_media enable row level security;
alter table public.catalog_product_pages enable row level security;
alter table public.catalog_product_page_sections enable row level security;
alter table public.catalog_option_groups enable row level security;
alter table public.catalog_options enable row level security;
alter table public.catalog_variant_options enable row level security;
alter table public.catalog_packages enable row level security;
alter table public.catalog_package_items enable row level security;
alter table public.catalog_services enable row level security;
alter table public.catalog_product_services enable row level security;
alter table public.catalog_service_regions enable row level security;
alter table public.catalog_price_schedules enable row level security;
alter table catalog_private.catalog_internal_pricing enable row level security;
alter table catalog_private.catalog_source_targets enable row level security;
alter table catalog_private.catalog_source_snapshots enable row level security;
alter table catalog_private.catalog_change_suggestions enable row level security;

create policy "Public can read visible catalog products"
  on public.catalog_products for select
  to anon, authenticated
  using (public_status <> 'hidden');

create policy "Public can read visible catalog variants"
  on public.catalog_product_variants for select
  to anon, authenticated
  using (
    public_status <> 'hidden'
    and exists (
      select 1 from public.catalog_products p
      where p.id = catalog_product_variants.product_id
        and p.public_status <> 'hidden'
    )
  );

create policy "Public can read visible product media"
  on public.catalog_product_media for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.catalog_products p
      where p.id = catalog_product_media.product_id
        and p.public_status <> 'hidden'
    )
  );

create policy "Public can read published product pages"
  on public.catalog_product_pages for select
  to anon, authenticated
  using (
    is_published
    and exists (
      select 1 from public.catalog_products p
      where p.id = catalog_product_pages.product_id
        and p.public_status <> 'hidden'
    )
  );

create policy "Public can read published product page sections"
  on public.catalog_product_page_sections for select
  to anon, authenticated
  using (
    is_published
    and exists (
      select 1
      from public.catalog_product_pages pp
      join public.catalog_products p on p.id = pp.product_id
      where pp.id = catalog_product_page_sections.product_page_id
        and pp.is_published
        and p.public_status <> 'hidden'
    )
  );

create policy "Public can read visible option groups"
  on public.catalog_option_groups for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.catalog_products p
      where p.id = catalog_option_groups.product_id
        and p.public_status <> 'hidden'
    )
  );

create policy "Public can read visible options"
  on public.catalog_options for select
  to anon, authenticated
  using (
    public_status <> 'hidden'
    and exists (
      select 1 from public.catalog_products p
      where p.id = catalog_options.product_id
        and p.public_status <> 'hidden'
    )
  );

create policy "Public can read visible variant option links"
  on public.catalog_variant_options for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.catalog_product_variants v
      join public.catalog_products p on p.id = v.product_id
      where v.id = catalog_variant_options.variant_id
        and v.public_status <> 'hidden'
        and p.public_status <> 'hidden'
    )
    and exists (
      select 1 from public.catalog_options o
      where o.id = catalog_variant_options.option_id
        and o.public_status <> 'hidden'
    )
  );

create policy "Public can read visible packages"
  on public.catalog_packages for select
  to anon, authenticated
  using (
    public_status <> 'hidden'
    and exists (
      select 1 from public.catalog_products p
      where p.id = catalog_packages.product_id
        and p.public_status <> 'hidden'
    )
  );

create policy "Public can read visible package items"
  on public.catalog_package_items for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.catalog_packages pkg
      join public.catalog_products p on p.id = pkg.product_id
      where pkg.id = catalog_package_items.package_id
        and pkg.public_status <> 'hidden'
        and p.public_status <> 'hidden'
    )
    and exists (
      select 1 from public.catalog_options o
      where o.id = catalog_package_items.option_id
        and o.public_status <> 'hidden'
    )
  );

create policy "Public can read visible services"
  on public.catalog_services for select
  to anon, authenticated
  using (public_status <> 'hidden');

create policy "Public can read visible product services"
  on public.catalog_product_services for select
  to anon, authenticated
  using (
    is_available
    and exists (
      select 1 from public.catalog_products p
      where p.id = catalog_product_services.product_id
        and p.public_status <> 'hidden'
    )
    and exists (
      select 1 from public.catalog_services s
      where s.id = catalog_product_services.service_id
        and s.public_status <> 'hidden'
    )
  );

create policy "Public can read visible service regions"
  on public.catalog_service_regions for select
  to anon, authenticated
  using (public_status <> 'hidden');

create policy "Public can read visible price schedules"
  on public.catalog_price_schedules for select
  to anon, authenticated
  using (
    public_status <> 'hidden'
    and starts_at <= now()
    and (ends_at is null or ends_at >= now())
    and (
      (
        product_id is not null
        and exists (
          select 1 from public.catalog_products p
          where p.id = catalog_price_schedules.product_id
            and p.public_status <> 'hidden'
        )
      )
      or (
        variant_id is not null
        and exists (
          select 1
          from public.catalog_product_variants v
          join public.catalog_products p on p.id = v.product_id
          where v.id = catalog_price_schedules.variant_id
            and v.public_status <> 'hidden'
            and p.public_status <> 'hidden'
        )
      )
      or (
        option_id is not null
        and exists (
          select 1
          from public.catalog_options o
          join public.catalog_products p on p.id = o.product_id
          where o.id = catalog_price_schedules.option_id
            and o.public_status <> 'hidden'
            and p.public_status <> 'hidden'
        )
      )
      or (
        package_id is not null
        and exists (
          select 1
          from public.catalog_packages pkg
          join public.catalog_products p on p.id = pkg.product_id
          where pkg.id = catalog_price_schedules.package_id
            and pkg.public_status <> 'hidden'
            and p.public_status <> 'hidden'
        )
      )
      or (
        service_id is not null
        and exists (
          select 1 from public.catalog_services s
          where s.id = catalog_price_schedules.service_id
            and s.public_status <> 'hidden'
        )
      )
      or (
        product_service_id is not null
        and exists (
          select 1
          from public.catalog_product_services ps
          join public.catalog_products p on p.id = ps.product_id
          join public.catalog_services s on s.id = ps.service_id
          where ps.id = catalog_price_schedules.product_service_id
            and ps.is_available
            and p.public_status <> 'hidden'
            and s.public_status <> 'hidden'
        )
      )
    )
  );

revoke all on schema catalog_private from anon, authenticated;
revoke all on all tables in schema catalog_private from anon, authenticated;
