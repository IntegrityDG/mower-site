begin;


-- ============================================================
-- IDS / SALE PRICE PROMOTIONAL CONTENT
-- ============================================================
-- One optional message + one optional image for each price context.
-- Data remains server-controlled. Public display is handled only
-- through explicitly sanitized application code.

create table catalog_private.catalog_price_messages (
  id uuid primary key default gen_random_uuid(),

  product_id uuid references public.catalog_products(id) on delete cascade,
  variant_id uuid references public.catalog_product_variants(id) on delete cascade,
  option_id uuid references public.catalog_options(id) on delete cascade,
  package_id uuid references public.catalog_packages(id) on delete cascade,
  service_id uuid references public.catalog_services(id) on delete cascade,
  service_payment_option_id uuid
    references public.catalog_service_payment_options(id) on delete cascade,
  product_service_id uuid
    references public.catalog_product_services(id) on delete cascade,
  price_schedule_id uuid
    references public.catalog_price_schedules(id) on delete cascade,

  price_context text not null
    check (price_context in ('ids', 'sale')),

  message text
    check (message is null or char_length(message) <= 250),

  image_path text
    check (image_path is null or char_length(image_path) <= 500),

  is_public boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (
    num_nonnulls(
      product_id,
      variant_id,
      option_id,
      package_id,
      service_id,
      service_payment_option_id,
      product_service_id,
      price_schedule_id
    ) = 1
  )
);


-- Exactly one IDS message and one Sale message may exist for each
-- individual pricing record.

create unique index catalog_price_messages_product_unique
  on catalog_private.catalog_price_messages (product_id, price_context)
  where product_id is not null;

create unique index catalog_price_messages_variant_unique
  on catalog_private.catalog_price_messages (variant_id, price_context)
  where variant_id is not null;

create unique index catalog_price_messages_option_unique
  on catalog_private.catalog_price_messages (option_id, price_context)
  where option_id is not null;

create unique index catalog_price_messages_package_unique
  on catalog_private.catalog_price_messages (package_id, price_context)
  where package_id is not null;

create unique index catalog_price_messages_service_unique
  on catalog_private.catalog_price_messages (service_id, price_context)
  where service_id is not null;

create unique index catalog_price_messages_service_payment_unique
  on catalog_private.catalog_price_messages (
    service_payment_option_id,
    price_context
  )
  where service_payment_option_id is not null;

create unique index catalog_price_messages_product_service_unique
  on catalog_private.catalog_price_messages (product_service_id, price_context)
  where product_service_id is not null;

create unique index catalog_price_messages_schedule_unique
  on catalog_private.catalog_price_messages (price_schedule_id, price_context)
  where price_schedule_id is not null;


-- ============================================================
-- MANUFACTURER SALE SHEET IMPORT HISTORY
-- ============================================================

create table catalog_private.catalog_sale_imports (
  id uuid primary key default gen_random_uuid(),

  manufacturer_brand text not null
    check (char_length(trim(manufacturer_brand)) between 1 and 120),

  original_file_name text not null
    check (char_length(original_file_name) between 1 and 255),

  storage_path text
    check (storage_path is null or char_length(storage_path) <= 500),

  file_sha256 text
    check (
      file_sha256 is null
      or file_sha256 ~ '^[0-9a-f]{64}$'
    ),

  status text not null default 'preview'
    check (
      status in (
        'preview',
        'ready',
        'partially_applied',
        'applied',
        'failed'
      )
    ),

  parsed_row_count integer not null default 0
    check (parsed_row_count >= 0),

  safe_match_count integer not null default 0
    check (safe_match_count >= 0),

  needs_review_count integer not null default 0
    check (needs_review_count >= 0),

  applied_row_count integer not null default 0
    check (applied_row_count >= 0),

  failure_message text
    check (
      failure_message is null
      or char_length(failure_message) <= 1000
    ),

  created_at timestamptz not null default now(),
  applied_at timestamptz,
  updated_at timestamptz not null default now()
);

create index catalog_sale_imports_created_idx
  on catalog_private.catalog_sale_imports (created_at desc);

create index catalog_sale_imports_brand_idx
  on catalog_private.catalog_sale_imports (
    lower(manufacturer_brand),
    created_at desc
  );


-- Individual spreadsheet rows remain reviewable before anything
-- changes in the live pricing catalog.

create table catalog_private.catalog_sale_import_rows (
  id uuid primary key default gen_random_uuid(),

  import_id uuid not null
    references catalog_private.catalog_sale_imports(id)
    on delete cascade,

  sheet_name text
    check (sheet_name is null or char_length(sheet_name) <= 120),

  source_row_number integer
    check (source_row_number is null or source_row_number > 0),

  manufacturer_item_name text
    check (
      manufacturer_item_name is null
      or char_length(manufacturer_item_name) <= 250
    ),

  manufacturer_sku text
    check (
      manufacturer_sku is null
      or char_length(manufacturer_sku) <= 120
    ),

  raw_row jsonb not null default '{}'::jsonb,

  product_id uuid references public.catalog_products(id) on delete set null,
  variant_id uuid
    references public.catalog_product_variants(id) on delete set null,
  option_id uuid references public.catalog_options(id) on delete set null,
  package_id uuid references public.catalog_packages(id) on delete set null,

  match_status text not null default 'needs_review'
    check (
      match_status in (
        'matched',
        'needs_review',
        'skipped',
        'applied'
      )
    ),

  match_confidence numeric(5,4)
    check (
      match_confidence is null
      or match_confidence between 0 and 1
    ),

  approved boolean not null default false,

  proposed_display_msrp_price_cents integer
    check (
      proposed_display_msrp_price_cents is null
      or proposed_display_msrp_price_cents >= 0
    ),

  proposed_sale_price_cents integer
    check (
      proposed_sale_price_cents is null
      or proposed_sale_price_cents >= 0
    ),

  proposed_sale_starts_at timestamptz,
  proposed_sale_ends_at timestamptz,

  proposed_promotional_dealer_cost_cents integer
    check (
      proposed_promotional_dealer_cost_cents is null
      or proposed_promotional_dealer_cost_cents >= 0
    ),

  proposed_sale_message text
    check (
      proposed_sale_message is null
      or char_length(proposed_sale_message) <= 250
    ),

  proposed_sale_image_path text
    check (
      proposed_sale_image_path is null
      or char_length(proposed_sale_image_path) <= 500
    ),

  proposed_show_sale_message_public boolean not null default false,

  before_values jsonb,
  applied_values jsonb,

  created_at timestamptz not null default now(),
  applied_at timestamptz,
  updated_at timestamptz not null default now(),

  check (
    num_nonnulls(
      product_id,
      variant_id,
      option_id,
      package_id
    ) <= 1
  ),

  check (
    proposed_sale_ends_at is null
    or proposed_sale_starts_at is null
    or proposed_sale_ends_at >= proposed_sale_starts_at
  )
);

create index catalog_sale_import_rows_import_idx
  on catalog_private.catalog_sale_import_rows (
    import_id,
    source_row_number
  );

create index catalog_sale_import_rows_review_idx
  on catalog_private.catalog_sale_import_rows (
    import_id,
    match_status,
    approved
  );


-- ============================================================
-- TEMPORARY PROMOTIONAL DEALER COSTS
-- ============================================================
-- Normal dealer cost remains untouched in catalog_internal_pricing.
-- This table is an effective-dated overlay. When no promotional
-- record is currently active, code automatically falls back to the
-- original dealer cost.

create table catalog_private.catalog_promotional_dealer_costs (
  id uuid primary key default gen_random_uuid(),

  product_id uuid references public.catalog_products(id) on delete cascade,
  variant_id uuid
    references public.catalog_product_variants(id) on delete cascade,
  option_id uuid references public.catalog_options(id) on delete cascade,
  package_id uuid references public.catalog_packages(id) on delete cascade,
  service_id uuid references public.catalog_services(id) on delete cascade,
  product_service_id uuid
    references public.catalog_product_services(id) on delete cascade,

  dealer_cost_cents integer not null
    check (dealer_cost_cents >= 0),

  starts_at timestamptz,
  ends_at timestamptz,

  source_import_id uuid
    references catalog_private.catalog_sale_imports(id)
    on delete set null,

  source_import_row_id uuid
    references catalog_private.catalog_sale_import_rows(id)
    on delete set null,

  source_label text
    check (
      source_label is null
      or char_length(source_label) <= 250
    ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (
    num_nonnulls(
      product_id,
      variant_id,
      option_id,
      package_id,
      service_id,
      product_service_id
    ) = 1
  ),

  check (
    ends_at is null
    or starts_at is null
    or ends_at >= starts_at
  )
);

-- One imported spreadsheet row may create at most one promotional
-- dealer-cost overlay. This makes import application retry-safe.
create unique index catalog_promotional_costs_import_row_unique
  on catalog_private.catalog_promotional_dealer_costs (source_import_row_id)
  where source_import_row_id is not null;


create index catalog_promotional_costs_product_idx
  on catalog_private.catalog_promotional_dealer_costs
    (product_id, starts_at desc, ends_at)
  where product_id is not null;

create index catalog_promotional_costs_variant_idx
  on catalog_private.catalog_promotional_dealer_costs
    (variant_id, starts_at desc, ends_at)
  where variant_id is not null;

create index catalog_promotional_costs_option_idx
  on catalog_private.catalog_promotional_dealer_costs
    (option_id, starts_at desc, ends_at)
  where option_id is not null;

create index catalog_promotional_costs_package_idx
  on catalog_private.catalog_promotional_dealer_costs
    (package_id, starts_at desc, ends_at)
  where package_id is not null;

create index catalog_promotional_costs_service_idx
  on catalog_private.catalog_promotional_dealer_costs
    (service_id, starts_at desc, ends_at)
  where service_id is not null;

create index catalog_promotional_costs_product_service_idx
  on catalog_private.catalog_promotional_dealer_costs
    (product_service_id, starts_at desc, ends_at)
  where product_service_id is not null;


-- ============================================================
-- PRIVATE STORAGE
-- ============================================================

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'catalog-price-promotions-private',
  'catalog-price-promotions-private',
  false,
  15728640,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;


insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'catalog-sale-imports-private',
  'catalog-sale-imports-private',
  false,
  26214400,
  array[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
    'application/csv',
    'text/plain'
  ]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;


-- ============================================================
-- SECURITY
-- ============================================================

alter table catalog_private.catalog_price_messages
  enable row level security;

alter table catalog_private.catalog_price_messages
  force row level security;

alter table catalog_private.catalog_sale_imports
  enable row level security;

alter table catalog_private.catalog_sale_imports
  force row level security;

alter table catalog_private.catalog_sale_import_rows
  enable row level security;

alter table catalog_private.catalog_sale_import_rows
  force row level security;

alter table catalog_private.catalog_promotional_dealer_costs
  enable row level security;

alter table catalog_private.catalog_promotional_dealer_costs
  force row level security;


revoke all on table catalog_private.catalog_price_messages
  from public, anon, authenticated;

revoke all on table catalog_private.catalog_sale_imports
  from public, anon, authenticated;

revoke all on table catalog_private.catalog_sale_import_rows
  from public, anon, authenticated;

revoke all on table catalog_private.catalog_promotional_dealer_costs
  from public, anon, authenticated;


grant usage on schema catalog_private to service_role;

grant select, insert, update, delete
  on table catalog_private.catalog_price_messages
  to service_role;

grant select, insert, update, delete
  on table catalog_private.catalog_sale_imports
  to service_role;

grant select, insert, update, delete
  on table catalog_private.catalog_sale_import_rows
  to service_role;

grant select, insert, update, delete
  on table catalog_private.catalog_promotional_dealer_costs
  to service_role;


comment on table catalog_private.catalog_price_messages is
  'Private IDS and temporary-sale promotional text/photo metadata. Public presentation requires explicit is_public=true and server-side price-context authorization.';

comment on table catalog_private.catalog_promotional_dealer_costs is
  'Effective-dated promotional dealer-cost overlay. Normal dealer cost remains stored in catalog_internal_pricing and resumes automatically when no promotion is active.';

comment on table catalog_private.catalog_sale_imports is
  'IDS-admin-only manufacturer sale-sheet import history. Manufacturer list is derived dynamically from catalog_products.brand.';


commit;
