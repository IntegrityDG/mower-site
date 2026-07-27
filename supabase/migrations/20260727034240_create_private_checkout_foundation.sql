begin;

create schema if not exists checkout_private;

create table checkout_private.customers (
  id uuid primary key default gen_random_uuid(),
  stripe_customer_id text unique,
  email text,
  normalized_email text,
  name text,
  phone text,
  billing_address jsonb,
  shipping_address jsonb,
  identity_verified_at timestamptz,
  stripe_customer_created_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (billing_address is null or jsonb_typeof(billing_address) = 'object'),
  check (shipping_address is null or jsonb_typeof(shipping_address) = 'object')
);

create index checkout_customers_normalized_email_idx
  on checkout_private.customers (normalized_email);

create table checkout_private.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references checkout_private.customers(id) on delete restrict,
  public_reference text not null unique,
  order_status text not null default 'draft' check (order_status in ('draft','checkout_pending','payment_processing','confirmed','canceled')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','processing','paid','failed','partially_refunded','refunded','disputed')),
  fulfillment_status text not null default 'not_ready' check (fulfillment_status in ('not_ready','pending','fulfilled','canceled')),
  currency text not null default 'usd' check (currency = 'usd'),
  subtotal_cents bigint not null default 0 check (subtotal_cents >= 0), discount_cents bigint not null default 0 check (discount_cents >= 0),
  fee_cents bigint not null default 0 check (fee_cents >= 0), shipping_cents bigint not null default 0 check (shipping_cents >= 0),
  tax_cents bigint not null default 0 check (tax_cents >= 0), total_cents bigint not null default 0 check (total_cents >= 0),
  payment_method_choice text not null check (payment_method_choice in ('card','ach')),
  customer_name text not null, customer_email text, customer_phone text, billing_address jsonb, shipping_address jsonb,
  pricing_snapshot jsonb not null, catalog_priced_at timestamptz not null,
  refunded_cents bigint not null default 0 check (refunded_cents >= 0), paid_at timestamptz, canceled_at timestamptz, expired_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (total_cents = subtotal_cents - discount_cents + fee_cents + shipping_cents + tax_cents),
  check (discount_cents <= subtotal_cents), check (refunded_cents <= total_cents),
  check (length(btrim(public_reference)) > 0), check (length(btrim(customer_name)) > 0),
  check (customer_email is not null or customer_phone is not null), check (jsonb_typeof(pricing_snapshot) = 'object')
);

create table checkout_private.order_items (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references checkout_private.orders(id) on delete restrict,
  item_type text not null check (item_type in ('product','variant','option','package','package_component','fee','discount','shipping','tax')),
  product_id uuid references public.catalog_products(id) on delete set null,
  variant_id uuid references public.catalog_product_variants(id) on delete set null,
  option_id uuid references public.catalog_options(id) on delete set null,
  package_id uuid references public.catalog_packages(id) on delete set null,
  sku text, name_snapshot text not null, description_snapshot text,
  quantity integer not null check (quantity > 0), unit_amount_cents bigint not null check (unit_amount_cents >= 0),
  extended_amount_cents bigint not null check (extended_amount_cents >= 0), included_in_package_price boolean not null default false,
  parent_order_item_id uuid,
  metadata_snapshot jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
  unique (order_id, id),
  foreign key (order_id, parent_order_item_id)
    references checkout_private.order_items(order_id, id) on delete restrict,
  check (extended_amount_cents = unit_amount_cents * quantity), check (jsonb_typeof(metadata_snapshot) = 'object'),
  check (item_type = 'package_component' or not included_in_package_price),
  check (not included_in_package_price or (unit_amount_cents = 0 and extended_amount_cents = 0))
);

create table checkout_private.payment_attempts (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references checkout_private.orders(id) on delete restrict,
  attempt_number integer not null check (attempt_number > 0), payment_method text not null check (payment_method in ('card','ach')),
  attempt_status text not null default 'creating' check (attempt_status in ('creating','open','completed','processing','succeeded','failed','expired')),
  idempotency_key text not null unique, request_fingerprint text not null,
  stripe_checkout_session_id text unique, stripe_payment_intent_id text unique,
  stripe_session_status text, stripe_payment_status text,
  expected_amount_cents bigint not null check (expected_amount_cents >= 0), expected_currency text not null default 'usd' check (expected_currency = 'usd'),
  checkout_url_created_at timestamptz, expires_at timestamptz, completed_at timestamptz, failed_at timestamptz, last_error_code text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (order_id, attempt_number)
);

create table checkout_private.stripe_webhook_events (
  stripe_event_id text primary key, event_type text not null, stripe_object_id text, livemode boolean not null, api_version text,
  processing_status text not null default 'received' check (processing_status in ('received','processing','processed','failed','ignored')),
  attempt_count integer not null default 0 check (attempt_count >= 0), received_at timestamptz not null default now(), processed_at timestamptz,
  last_error_at timestamptz, last_error_code text
);

create index checkout_orders_status_idx on checkout_private.orders (payment_status, order_status, created_at);
create index checkout_order_items_order_idx on checkout_private.order_items (order_id);
create index checkout_payment_attempts_order_idx on checkout_private.payment_attempts (order_id, attempt_number);
create index checkout_payment_attempts_status_idx on checkout_private.payment_attempts (attempt_status, created_at);
create index checkout_webhook_events_status_idx on checkout_private.stripe_webhook_events (processing_status, received_at);

alter table checkout_private.customers enable row level security; alter table checkout_private.customers force row level security;
alter table checkout_private.orders enable row level security; alter table checkout_private.orders force row level security;
alter table checkout_private.order_items enable row level security; alter table checkout_private.order_items force row level security;
alter table checkout_private.payment_attempts enable row level security; alter table checkout_private.payment_attempts force row level security;
alter table checkout_private.stripe_webhook_events enable row level security; alter table checkout_private.stripe_webhook_events force row level security;

revoke all on schema checkout_private from public, anon, authenticated;
revoke all on all tables in schema checkout_private from public, anon, authenticated;
grant usage on schema checkout_private to service_role;
grant select, insert, update on table checkout_private.customers to service_role;
grant select, insert, update on table checkout_private.orders to service_role;
grant select, insert, update on table checkout_private.order_items to service_role;
grant select, insert, update on table checkout_private.payment_attempts to service_role;
grant select, insert, update on table checkout_private.stripe_webhook_events to service_role;

commit;

-- Read-only verification after explicit migration approval:
-- select schemaname, tablename, rowsecurity, forcerowsecurity from pg_tables where schemaname = 'checkout_private';
-- select grantee, privilege_type from information_schema.role_table_grants where table_schema = 'checkout_private';
-- select * from pg_policies where schemaname = 'checkout_private';
-- select conrelid::regclass as table_name, conname, pg_get_constraintdef(oid) from pg_constraint where connamespace = 'checkout_private'::regnamespace order by conrelid::regclass::text, conname;
-- select indexname, indexdef from pg_indexes where schemaname = 'checkout_private' order by indexname;
-- Commented rollback (never execute without separate approval):
-- drop schema checkout_private cascade;
