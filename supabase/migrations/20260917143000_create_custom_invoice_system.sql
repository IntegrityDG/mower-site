begin;

create schema if not exists checkout_private;
revoke all on schema checkout_private from public, anon, authenticated;
grant usage on schema checkout_private to service_role;

create sequence checkout_private.custom_invoice_number_seq;
revoke all on sequence checkout_private.custom_invoice_number_seq from public, anon, authenticated;
grant usage, select on sequence checkout_private.custom_invoice_number_seq to service_role;

create table checkout_private.custom_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text unique,
  status text not null default 'draft' check (status in ('draft','finalized','sent','partially_paid','paid','void')),
  currency text not null default 'usd' check (currency = 'usd'),
  customer_name text not null default '',
  company_name text,
  customer_email text not null default '',
  customer_phone text not null default '',
  billing_address jsonb not null default '{}'::jsonb check (jsonb_typeof(billing_address) = 'object'),
  shipping_address jsonb not null default '{}'::jsonb check (jsonb_typeof(shipping_address) = 'object'),
  customer_notes text not null default '',
  internal_notes text not null default '',
  fulfillment_notes text not null default '',
  due_date date,
  payment_terms text not null default 'full' check (payment_terms in ('full','deposit')),
  deposit_amount_cents bigint check (deposit_amount_cents is null or deposit_amount_cents > 0),
  availability_acknowledged boolean not null default false,
  subtotal_cents bigint not null default 0 check (subtotal_cents >= 0),
  fee_cents bigint not null default 0 check (fee_cents >= 0),
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  credit_cents bigint not null default 0 check (credit_cents >= 0),
  tax_cents bigint not null default 0 check (tax_cents >= 0),
  total_cents bigint not null default 0 check (total_cents >= 0),
  amount_paid_cents bigint not null default 0 check (amount_paid_cents >= 0),
  version bigint not null default 1 check (version > 0),
  source_invoice_id uuid references checkout_private.custom_invoices(id) on delete set null,
  stripe_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finalized_at timestamptz,
  first_sent_at timestamptz,
  paid_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  deleted_at timestamptz,
  check (char_length(customer_name) <= 160),
  check (company_name is null or char_length(company_name) <= 160),
  check (char_length(customer_email) <= 320),
  check (char_length(customer_phone) <= 40),
  check (char_length(customer_notes) <= 5000),
  check (char_length(internal_notes) <= 5000),
  check (char_length(fulfillment_notes) <= 3000),
  check (total_cents <= 100000000000),
  check (amount_paid_cents <= total_cents),
  check ((status = 'draft' and invoice_number is null) or (status <> 'draft' and invoice_number is not null)),
  check (payment_terms = 'deposit' or deposit_amount_cents is null)
);

create table checkout_private.custom_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references checkout_private.custom_invoices(id) on delete cascade,
  line_type text not null check (line_type in ('item','fee','discount','credit')),
  source_type text not null default 'custom' check (source_type in ('custom','product','variant','package','option','service')),
  catalog_id uuid,
  catalog_parent_id uuid,
  description text not null,
  secondary_description text,
  sku text,
  quantity bigint not null check (quantity between 1 and 10000),
  unit_price_cents bigint not null check (unit_price_cents between 0 and 100000000000),
  line_amount_cents bigint generated always as (quantity * unit_price_cents) stored,
  catalog_reference_price_cents bigint check (catalog_reference_price_cents is null or catalog_reference_price_cents >= 0),
  catalog_status text,
  catalog_purchase_state text,
  availability_warning boolean not null default false,
  sort_order integer not null default 0 check (sort_order between 0 and 10000),
  created_at timestamptz not null default now(),
  check (char_length(description) between 1 and 500),
  check (secondary_description is null or char_length(secondary_description) <= 1000),
  check (sku is null or char_length(sku) <= 120),
  check (quantity * unit_price_cents <= 100000000000)
);

create table checkout_private.custom_invoice_payment_requests (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references checkout_private.custom_invoices(id) on delete restrict,
  request_kind text not null check (request_kind in ('full','deposit','balance')),
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'usd' check (currency = 'usd'),
  allowed_payment_methods text[] not null check (cardinality(allowed_payment_methods) between 1 and 2),
  status text not null default 'creating' check (status in ('creating','open','paid','failed','void')),
  operation_key text not null unique,
  stripe_invoice_id text unique,
  hosted_invoice_url text,
  stripe_payment_intent_id text unique,
  email_status text not null default 'not_sent' check (email_status in ('not_sent','sending','sent','failed')),
  email_operation_key text unique,
  email_provider_id text,
  email_last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  paid_at timestamptz,
  unique (id, invoice_id),
  check (char_length(operation_key) between 8 and 200),
  check (allowed_payment_methods in (
    array['card']::text[],
    array['us_bank_account']::text[],
    array['card','us_bank_account']::text[],
    array['us_bank_account','card']::text[]
  ))
);

create table checkout_private.custom_invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references checkout_private.custom_invoices(id) on delete restrict,
  payment_request_id uuid,
  source text not null check (source in ('stripe','manual')),
  method text not null check (method in ('card','ach','cash','check','wire','other')),
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'usd' check (currency = 'usd'),
  operation_key text not null unique,
  external_payment_id text unique,
  reference text,
  note text,
  received_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (id, invoice_id),
  foreign key (payment_request_id, invoice_id) references checkout_private.custom_invoice_payment_requests(id, invoice_id) on delete restrict,
  check (char_length(operation_key) between 8 and 240),
  check (reference is null or char_length(reference) <= 200),
  check (note is null or char_length(note) <= 1000)
);

create table checkout_private.custom_invoice_events (
  id bigint generated always as identity primary key,
  invoice_id uuid not null references checkout_private.custom_invoices(id) on delete restrict,
  event_type text not null,
  operation_key text,
  actor text not null default 'ids_admin',
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now(),
  unique (invoice_id, operation_key),
  check (char_length(event_type) between 1 and 80),
  check (operation_key is null or char_length(operation_key) between 8 and 240)
);

create table checkout_private.custom_invoice_refunds (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references checkout_private.custom_invoices(id) on delete restrict,
  payment_id uuid not null,
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'usd' check (currency='usd'),
  stripe_event_id text not null unique,
  created_at timestamptz not null default now(),
  foreign key (payment_id, invoice_id) references checkout_private.custom_invoice_payments(id, invoice_id) on delete restrict
);

create table checkout_private.custom_invoice_webhook_receipts (
  stripe_event_id text primary key,
  event_type text not null,
  stripe_object_id text,
  livemode boolean not null,
  status text not null check (status in ('processed','ignored','rejected')),
  created_at timestamptz not null default now()
);

create index custom_invoices_lookup_idx on checkout_private.custom_invoices (status, created_at desc) where deleted_at is null;
create index custom_invoices_customer_idx on checkout_private.custom_invoices (lower(customer_name), lower(customer_email)) where deleted_at is null;
create index custom_invoice_items_invoice_idx on checkout_private.custom_invoice_items (invoice_id, sort_order, id);
create index custom_invoice_requests_invoice_idx on checkout_private.custom_invoice_payment_requests (invoice_id, created_at desc);
create unique index custom_invoice_requests_one_active_uidx on checkout_private.custom_invoice_payment_requests (invoice_id) where status in ('creating','open');
create index custom_invoice_payments_invoice_idx on checkout_private.custom_invoice_payments (invoice_id, received_at);
create index custom_invoice_events_invoice_idx on checkout_private.custom_invoice_events (invoice_id, created_at);
create unique index custom_invoice_events_operation_key_uidx on checkout_private.custom_invoice_events (operation_key) where operation_key is not null;
create index custom_invoice_refunds_invoice_idx on checkout_private.custom_invoice_refunds (invoice_id, created_at);

alter table checkout_private.custom_invoices enable row level security;
alter table checkout_private.custom_invoices force row level security;
alter table checkout_private.custom_invoice_items enable row level security;
alter table checkout_private.custom_invoice_items force row level security;
alter table checkout_private.custom_invoice_payment_requests enable row level security;
alter table checkout_private.custom_invoice_payment_requests force row level security;
alter table checkout_private.custom_invoice_payments enable row level security;
alter table checkout_private.custom_invoice_payments force row level security;
alter table checkout_private.custom_invoice_events enable row level security;
alter table checkout_private.custom_invoice_events force row level security;
alter table checkout_private.custom_invoice_refunds enable row level security;
alter table checkout_private.custom_invoice_refunds force row level security;
alter table checkout_private.custom_invoice_webhook_receipts enable row level security;
alter table checkout_private.custom_invoice_webhook_receipts force row level security;

revoke all on all tables in schema checkout_private from public, anon, authenticated;
revoke all on all sequences in schema checkout_private from public, anon, authenticated;
grant select, insert, update, delete on checkout_private.custom_invoices to service_role;
grant select, insert, delete on checkout_private.custom_invoice_items to service_role;
grant select, insert, update on checkout_private.custom_invoice_payment_requests to service_role;
grant select, insert on checkout_private.custom_invoice_payments, checkout_private.custom_invoice_events, checkout_private.custom_invoice_refunds, checkout_private.custom_invoice_webhook_receipts to service_role;
grant usage, select on all sequences in schema checkout_private to service_role;

create or replace function checkout_private.reject_custom_invoice_history_mutation()
returns trigger language plpgsql set search_path = '' as $$
declare ledger_paid bigint;
begin
  if tg_op = 'DELETE' then raise exception 'Immutable financial history cannot be deleted.' using errcode = '55000'; end if;
  if old.status <> 'draft' and row(old.invoice_number,old.currency,old.customer_name,old.company_name,old.customer_email,old.customer_phone,old.billing_address,old.shipping_address,old.customer_notes,old.internal_notes,old.fulfillment_notes,old.due_date,old.payment_terms,old.deposit_amount_cents,old.availability_acknowledged,old.subtotal_cents,old.fee_cents,old.discount_cents,old.credit_cents,old.tax_cents,old.total_cents,old.source_invoice_id,old.finalized_at,old.deleted_at)
    is distinct from row(new.invoice_number,new.currency,new.customer_name,new.company_name,new.customer_email,new.customer_phone,new.billing_address,new.shipping_address,new.customer_notes,new.internal_notes,new.fulfillment_notes,new.due_date,new.payment_terms,new.deposit_amount_cents,new.availability_acknowledged,new.subtotal_cents,new.fee_cents,new.discount_cents,new.credit_cents,new.tax_cents,new.total_cents,new.source_invoice_id,new.finalized_at,new.deleted_at)
  then raise exception 'Finalized invoice snapshot is immutable.' using errcode = '55000'; end if;
  if old.status <> 'draft' and new.status = 'draft' then raise exception 'A finalized invoice cannot return to draft.' using errcode = '55000'; end if;
  if (old.status='draft' and new.status not in ('draft','finalized'))
    or (old.status='finalized' and new.status not in ('finalized','sent','partially_paid','paid','void'))
    or (old.status='sent' and new.status not in ('sent','partially_paid','paid','void'))
    or (old.status='partially_paid' and new.status not in ('partially_paid','paid','sent','finalized'))
    or (old.status='paid' and new.status not in ('paid','partially_paid','sent','finalized'))
    or (old.status='void' and new.status <> 'void')
  then raise exception 'Invalid invoice status transition.' using errcode = '23514'; end if;
  if (new.status = 'paid' and new.amount_paid_cents <> new.total_cents)
    or (new.status = 'partially_paid' and (new.amount_paid_cents <= 0 or new.amount_paid_cents >= new.total_cents))
    or (new.status in ('finalized','sent','void') and new.amount_paid_cents <> 0)
  then raise exception 'Invoice status and paid amount are inconsistent.' using errcode = '23514'; end if;
  if new.amount_paid_cents is distinct from old.amount_paid_cents then
    select coalesce((select sum(amount_cents) from checkout_private.custom_invoice_payments where invoice_id=new.id),0)
      - coalesce((select sum(amount_cents) from checkout_private.custom_invoice_refunds where invoice_id=new.id),0)
      into ledger_paid;
    if new.amount_paid_cents <> ledger_paid then raise exception 'Invoice paid amount must match the payment ledger.' using errcode = '23514'; end if;
  end if;
  return new;
end $$;

create trigger custom_invoices_history_guard before update or delete on checkout_private.custom_invoices for each row execute function checkout_private.reject_custom_invoice_history_mutation();

create or replace function checkout_private.reject_custom_invoice_item_mutation()
returns trigger language plpgsql set search_path = '' as $$
declare parent_status text;
begin
  if tg_op = 'UPDATE' and new.invoice_id is distinct from old.invoice_id then
    raise exception 'Invoice items cannot be moved between invoices.' using errcode = '55000';
  end if;
  if tg_op in ('DELETE','UPDATE') then
    select status into parent_status from checkout_private.custom_invoices where id = old.invoice_id;
  else
    select status into parent_status from checkout_private.custom_invoices where id = new.invoice_id;
  end if;
  if parent_status <> 'draft' then raise exception 'Finalized invoice items are immutable.' using errcode = '55000'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger custom_invoice_items_guard before insert or update or delete on checkout_private.custom_invoice_items for each row execute function checkout_private.reject_custom_invoice_item_mutation();

create or replace function checkout_private.guard_custom_invoice_payment_request()
returns trigger language plpgsql set search_path = '' as $$
begin
  if row(old.invoice_id,old.request_kind,old.amount_cents,old.currency,old.allowed_payment_methods,old.operation_key)
    is distinct from row(new.invoice_id,new.request_kind,new.amount_cents,new.currency,new.allowed_payment_methods,new.operation_key)
  then raise exception 'Payment request financial terms are immutable.' using errcode = '55000'; end if;
  if (old.stripe_invoice_id is not null and new.stripe_invoice_id is distinct from old.stripe_invoice_id)
    or (old.hosted_invoice_url is not null and new.hosted_invoice_url is distinct from old.hosted_invoice_url)
    or (old.stripe_payment_intent_id is not null and new.stripe_payment_intent_id is distinct from old.stripe_payment_intent_id)
  then raise exception 'Payment request provider identity is immutable.' using errcode = '55000'; end if;
  if (old.status='creating' and new.status not in ('creating','open','failed','void'))
    or (old.status='open' and new.status not in ('open','paid','failed','void'))
    or (old.status in ('paid','void') and new.status<>old.status)
    or (old.status='failed' and new.status not in ('failed','void'))
  then raise exception 'Invalid payment request status transition.' using errcode = '23514'; end if;
  return new;
end $$;

create trigger custom_invoice_payment_requests_guard before update on checkout_private.custom_invoice_payment_requests for each row execute function checkout_private.guard_custom_invoice_payment_request();

create or replace function public.custom_invoice_save_draft(p_invoice_id uuid,p_expected_version bigint,p_invoice jsonb,p_items jsonb,p_operation_key text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare inv checkout_private.custom_invoices; item jsonb; new_id uuid := coalesce(p_invoice_id,gen_random_uuid());
begin
  select i.* into inv from checkout_private.custom_invoice_events e join checkout_private.custom_invoices i on i.id=e.invoice_id where e.operation_key=p_operation_key;
  if found then return to_jsonb(inv); end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>200 then raise exception 'Invalid invoice lines.' using errcode='22023'; end if;
  if p_invoice_id is null then
    insert into checkout_private.custom_invoices(id,customer_name,company_name,customer_email,customer_phone,billing_address,shipping_address,customer_notes,internal_notes,fulfillment_notes,due_date,payment_terms,deposit_amount_cents,availability_acknowledged,tax_cents)
    values(new_id,p_invoice->>'customerName',nullif(p_invoice->>'companyName',''),p_invoice->>'customerEmail',p_invoice->>'customerPhone',p_invoice->'billingAddress',p_invoice->'shippingAddress',coalesce(p_invoice->>'customerNotes',''),coalesce(p_invoice->>'internalNotes',''),coalesce(p_invoice->>'fulfillmentNotes',''),nullif(p_invoice->>'dueDate','')::date,p_invoice->>'paymentTerms',nullif(p_invoice->>'depositAmountCents','')::bigint,coalesce((p_invoice->>'availabilityAcknowledged')::boolean,false),(p_invoice->>'taxCents')::bigint) returning * into inv;
  else
    select * into inv from checkout_private.custom_invoices where id=p_invoice_id and deleted_at is null for update;
    if not found or inv.status<>'draft' then raise exception 'Draft not found.' using errcode='P0002'; end if;
    if inv.version<>p_expected_version then raise exception 'Stale invoice version.' using errcode='40001'; end if;
    update checkout_private.custom_invoices set customer_name=p_invoice->>'customerName',company_name=nullif(p_invoice->>'companyName',''),customer_email=p_invoice->>'customerEmail',customer_phone=p_invoice->>'customerPhone',billing_address=p_invoice->'billingAddress',shipping_address=p_invoice->'shippingAddress',customer_notes=coalesce(p_invoice->>'customerNotes',''),internal_notes=coalesce(p_invoice->>'internalNotes',''),fulfillment_notes=coalesce(p_invoice->>'fulfillmentNotes',''),due_date=nullif(p_invoice->>'dueDate','')::date,payment_terms=p_invoice->>'paymentTerms',deposit_amount_cents=nullif(p_invoice->>'depositAmountCents','')::bigint,availability_acknowledged=coalesce((p_invoice->>'availabilityAcknowledged')::boolean,false),tax_cents=(p_invoice->>'taxCents')::bigint,updated_at=now(),version=version+1 where id=p_invoice_id returning * into inv;
    delete from checkout_private.custom_invoice_items where invoice_id=p_invoice_id;
  end if;
  for item in select value from jsonb_array_elements(p_items) loop
    insert into checkout_private.custom_invoice_items(id,invoice_id,line_type,source_type,catalog_id,catalog_parent_id,description,secondary_description,sku,quantity,unit_price_cents,catalog_reference_price_cents,catalog_status,catalog_purchase_state,availability_warning,sort_order)
    values(coalesce(nullif(item->>'id','')::uuid,gen_random_uuid()),new_id,item->>'lineType',item->>'sourceType',nullif(item->>'catalogId','')::uuid,nullif(item->>'catalogParentId','')::uuid,item->>'description',nullif(item->>'secondaryDescription',''),nullif(item->>'sku',''),(item->>'quantity')::bigint,(item->>'unitPriceCents')::bigint,nullif(item->>'catalogReferencePriceCents','')::bigint,nullif(item->>'catalogStatus',''),nullif(item->>'catalogPurchaseState',''),coalesce((item->>'availabilityWarning')::boolean,false),(item->>'sortOrder')::integer);
  end loop;
  insert into checkout_private.custom_invoice_events(invoice_id,event_type,operation_key,details) values(new_id,case when p_invoice_id is null then 'draft_created' else 'draft_updated' end,p_operation_key,jsonb_build_object('version',inv.version));
  return to_jsonb(inv);
end $$;

create or replace function public.custom_invoice_list(p_search text default '',p_status text default 'all',p_offset integer default 0,p_limit integer default 50)
returns jsonb language sql stable security invoker set search_path='' as $$
  with filtered as (
    select id,invoice_number,status,customer_name,company_name,customer_email,total_cents,amount_paid_cents,due_date,created_at,updated_at,version
    from checkout_private.custom_invoices
    where deleted_at is null and (p_status='all' or status=p_status)
      and (trim(p_search)='' or invoice_number ilike '%'||p_search||'%' or customer_name ilike '%'||p_search||'%' or customer_email ilike '%'||p_search||'%' or company_name ilike '%'||p_search||'%')
  ), page as (select * from filtered order by created_at desc offset greatest(p_offset,0) limit least(greatest(p_limit,1),100))
  select jsonb_build_object('invoices',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb),'count',(select count(*) from filtered));
$$;

create or replace function public.custom_invoice_read(p_invoice_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select case when i.id is null then null else jsonb_build_object(
    'invoice',to_jsonb(i),
    'items',coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order,x.id) from checkout_private.custom_invoice_items x where x.invoice_id=i.id),'[]'::jsonb),
    'paymentRequests',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from checkout_private.custom_invoice_payment_requests x where x.invoice_id=i.id),'[]'::jsonb),
    'payments',coalesce((select jsonb_agg(to_jsonb(x) order by x.received_at desc) from checkout_private.custom_invoice_payments x where x.invoice_id=i.id),'[]'::jsonb),
    'refunds',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from checkout_private.custom_invoice_refunds x where x.invoice_id=i.id),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'event_type',x.event_type,'actor',x.actor,'details',x.details,'created_at',x.created_at) order by x.created_at desc) from checkout_private.custom_invoice_events x where x.invoice_id=i.id),'[]'::jsonb)
  ) end from checkout_private.custom_invoices i where i.id=p_invoice_id and i.deleted_at is null;
$$;

create or replace function public.custom_invoice_request_by_stripe_id(p_stripe_invoice_id text)
returns jsonb language sql stable security invoker set search_path='' as $$
  select to_jsonb(x) from (select id,invoice_id,amount_cents,currency,status,stripe_invoice_id from checkout_private.custom_invoice_payment_requests where stripe_invoice_id=p_stripe_invoice_id) x;
$$;

create or replace function public.custom_invoice_delete_draft(p_invoice_id uuid,p_expected_version bigint,p_operation_key text)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if exists(select 1 from checkout_private.custom_invoice_events where invoice_id=p_invoice_id and operation_key=p_operation_key and event_type='draft_deleted') then return; end if;
  update checkout_private.custom_invoices set deleted_at=now(),updated_at=now(),version=version+1 where id=p_invoice_id and status='draft' and version=p_expected_version and deleted_at is null;
  if not found then raise exception 'Draft not found or stale.' using errcode='40001'; end if;
  insert into checkout_private.custom_invoice_events(invoice_id,event_type,operation_key) values(p_invoice_id,'draft_deleted',p_operation_key);
end $$;

create or replace function public.custom_invoice_finalize(p_invoice_id uuid, p_expected_version bigint, p_operation_key text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare inv checkout_private.custom_invoices; sums record; new_number text;
begin
  select * into inv from checkout_private.custom_invoices where id=p_invoice_id and deleted_at is null for update;
  if not found then raise exception 'Invoice not found.' using errcode='P0002'; end if;
  if inv.status <> 'draft' then return to_jsonb(inv); end if;
  if inv.version <> p_expected_version then raise exception 'Stale invoice version.' using errcode='40001'; end if;
  if trim(inv.customer_name)='' or inv.customer_email !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or trim(inv.customer_phone)='' then raise exception 'Complete customer information is required.' using errcode='22023'; end if;
  if inv.due_date is null then raise exception 'Due date is required.' using errcode='22023'; end if;
  if not (inv.billing_address ?& array['line1','city','state','postalCode']) then raise exception 'Complete billing address is required.' using errcode='22023'; end if;
  if not (inv.shipping_address ?& array['line1','city','state','postalCode']) then raise exception 'Complete shipping address is required.' using errcode='22023'; end if;
  if trim(inv.billing_address->>'line1')='' or trim(inv.billing_address->>'city')='' or inv.billing_address->>'state' !~ '^[A-Z]{2}$' or inv.billing_address->>'postalCode' !~ '^\d{5}(-\d{4})?$' then raise exception 'Complete billing address is required.' using errcode='22023'; end if;
  if trim(inv.shipping_address->>'line1')='' or trim(inv.shipping_address->>'city')='' or inv.shipping_address->>'state' !~ '^[A-Z]{2}$' or inv.shipping_address->>'postalCode' !~ '^\d{5}(-\d{4})?$' then raise exception 'Complete shipping address is required.' using errcode='22023'; end if;
  select count(*) n,
    coalesce(sum(line_amount_cents) filter(where line_type='item'),0) subtotal,
    coalesce(sum(line_amount_cents) filter(where line_type='fee'),0) fees,
    coalesce(sum(line_amount_cents) filter(where line_type='discount'),0) discounts,
    coalesce(sum(line_amount_cents) filter(where line_type='credit'),0) credits,
    coalesce(bool_or(availability_warning),false) warning
  into sums from checkout_private.custom_invoice_items where invoice_id=p_invoice_id;
  if sums.n=0 then raise exception 'At least one line is required.' using errcode='22023'; end if;
  if sums.warning and not inv.availability_acknowledged then raise exception 'Availability acknowledgment is required.' using errcode='22023'; end if;
  if sums.subtotal+sums.fees+inv.tax_cents-sums.discounts-sums.credits < 0 then raise exception 'Invoice total cannot be negative.' using errcode='22003'; end if;
  new_number := 'IDS-INV-'||to_char(current_date,'YYYY')||'-'||lpad(nextval('checkout_private.custom_invoice_number_seq')::text,5,'0');
  update checkout_private.custom_invoices set invoice_number=new_number,status='finalized',subtotal_cents=sums.subtotal,fee_cents=sums.fees,discount_cents=sums.discounts,credit_cents=sums.credits,total_cents=sums.subtotal+sums.fees+tax_cents-sums.discounts-sums.credits,finalized_at=now(),updated_at=now(),version=version+1 where id=p_invoice_id returning * into inv;
  if inv.total_cents <= 0 then raise exception 'Finalized invoice total must be greater than zero.' using errcode='22023'; end if;
  if inv.payment_terms='deposit' and (inv.deposit_amount_cents is null or inv.deposit_amount_cents >= inv.total_cents) then raise exception 'Deposit must be greater than zero and less than total.' using errcode='22023'; end if;
  insert into checkout_private.custom_invoice_events(invoice_id,event_type,operation_key,details) values(p_invoice_id,'finalized',p_operation_key,jsonb_build_object('invoiceNumber',new_number,'totalCents',inv.total_cents));
  return to_jsonb(inv);
end $$;

create or replace function public.custom_invoice_record_manual_payment(p_invoice_id uuid,p_amount_cents bigint,p_method text,p_reference text,p_note text,p_received_at timestamptz,p_operation_key text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare inv checkout_private.custom_invoices; payment checkout_private.custom_invoice_payments; reserved bigint;
begin
  select * into payment from checkout_private.custom_invoice_payments where operation_key=p_operation_key;
  if found then return to_jsonb(payment); end if;
  select * into inv from checkout_private.custom_invoices where id=p_invoice_id for update;
  if not found or inv.status not in ('finalized','sent','partially_paid') then raise exception 'Invoice cannot accept payment.' using errcode='22023'; end if;
  select coalesce(sum(amount_cents),0) into reserved from checkout_private.custom_invoice_payment_requests where invoice_id=p_invoice_id and status in ('creating','open');
  if p_method not in ('cash','check','wire','other') or p_amount_cents <= 0 or p_amount_cents > inv.total_cents-inv.amount_paid_cents-reserved then raise exception 'Invalid or excessive payment.' using errcode='22023'; end if;
  insert into checkout_private.custom_invoice_payments(invoice_id,source,method,amount_cents,operation_key,reference,note,received_at) values(p_invoice_id,'manual',p_method,p_amount_cents,p_operation_key,nullif(trim(p_reference),''),nullif(trim(p_note),''),p_received_at) returning * into payment;
  update checkout_private.custom_invoices set amount_paid_cents=amount_paid_cents+p_amount_cents,status=case when amount_paid_cents+p_amount_cents=total_cents then 'paid' else 'partially_paid' end,paid_at=case when amount_paid_cents+p_amount_cents=total_cents then now() else null end,updated_at=now(),version=version+1 where id=p_invoice_id;
  insert into checkout_private.custom_invoice_events(invoice_id,event_type,operation_key,details) values(p_invoice_id,'manual_payment_recorded','event:'||p_operation_key,jsonb_build_object('amountCents',p_amount_cents,'method',p_method,'paymentId',payment.id));
  return to_jsonb(payment);
end $$;

create or replace function public.custom_invoice_cancel_payment_requests(p_invoice_id uuid,p_operation_key text)
returns void language plpgsql security invoker set search_path='' as $$
declare canceled_count bigint;
begin
  perform 1 from checkout_private.custom_invoices where id=p_invoice_id and deleted_at is null for update;
  if not found then raise exception 'Invoice not found.' using errcode='P0002'; end if;
  if exists(select 1 from checkout_private.custom_invoice_events where invoice_id=p_invoice_id and operation_key=p_operation_key) then return; end if;
  update checkout_private.custom_invoice_payment_requests set status='void',updated_at=now() where invoice_id=p_invoice_id and status in ('creating','open');
  get diagnostics canceled_count = row_count;
  insert into checkout_private.custom_invoice_events(invoice_id,event_type,operation_key,details) values(p_invoice_id,'payment_requests_canceled',p_operation_key,jsonb_build_object('count',canceled_count));
end $$;

create or replace function public.custom_invoice_reserve_payment_request(p_invoice_id uuid,p_kind text,p_methods text[],p_operation_key text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare inv checkout_private.custom_invoices; req checkout_private.custom_invoice_payment_requests; amount_due bigint;
begin
  select * into req from checkout_private.custom_invoice_payment_requests where operation_key=p_operation_key;
  if found then return to_jsonb(req); end if;
  select * into inv from checkout_private.custom_invoices where id=p_invoice_id for update;
  if not found or inv.status not in ('finalized','sent','partially_paid') then raise exception 'Invoice cannot be sent.' using errcode='22023'; end if;
  if p_methods is null or p_methods not in (array['card']::text[],array['us_bank_account']::text[],array['card','us_bank_account']::text[],array['us_bank_account','card']::text[]) then raise exception 'Invalid payment methods.' using errcode='22023'; end if;
  select * into req from checkout_private.custom_invoice_payment_requests where invoice_id=p_invoice_id and status in ('creating','open') order by created_at desc limit 1 for update;
  if found then return to_jsonb(req); end if;
  if p_kind='deposit' and inv.payment_terms='deposit' and inv.amount_paid_cents=0 then amount_due=inv.deposit_amount_cents;
  elsif p_kind in ('full','balance') then amount_due=inv.total_cents-inv.amount_paid_cents;
  else raise exception 'Invalid payment request kind.' using errcode='22023'; end if;
  if amount_due is null or amount_due <= 0 then raise exception 'No balance is available to request.' using errcode='22023'; end if;
  insert into checkout_private.custom_invoice_payment_requests(invoice_id,request_kind,amount_cents,allowed_payment_methods,operation_key) values(p_invoice_id,p_kind,amount_due,p_methods,p_operation_key) returning * into req;
  insert into checkout_private.custom_invoice_events(invoice_id,event_type,operation_key,details) values(p_invoice_id,'payment_request_reserved','event:'||p_operation_key,jsonb_build_object('requestId',req.id,'amountCents',amount_due,'kind',p_kind));
  return to_jsonb(req);
end $$;

create or replace function public.custom_invoice_link_payment_request(p_request_id uuid,p_stripe_invoice_id text,p_hosted_url text,p_stripe_customer_id text)
returns void language plpgsql security invoker set search_path='' as $$
declare iid uuid;
begin
  update checkout_private.custom_invoice_payment_requests set stripe_invoice_id=p_stripe_invoice_id,hosted_invoice_url=p_hosted_url,status='open',updated_at=now() where id=p_request_id and status='creating' returning invoice_id into iid;
  if not found then raise exception 'Payment request cannot be linked.' using errcode='55000'; end if;
  update checkout_private.custom_invoices set stripe_customer_id=coalesce(stripe_customer_id,p_stripe_customer_id),updated_at=now() where id=iid;
end $$;

create or replace function public.custom_invoice_void(p_invoice_id uuid,p_reason text,p_operation_key text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare inv checkout_private.custom_invoices;
begin
  select * into inv from checkout_private.custom_invoices where id=p_invoice_id for update;
  if not found then raise exception 'Invoice not found.' using errcode='P0002'; end if;
  if inv.status='void' then return to_jsonb(inv); end if;
  if inv.status not in ('finalized','sent') or inv.amount_paid_cents<>0 or char_length(trim(p_reason))<3 then raise exception 'Only an unpaid invoice may be voided with a reason.' using errcode='22023'; end if;
  update checkout_private.custom_invoices set status='void',void_reason=left(trim(p_reason),1000),voided_at=now(),updated_at=now(),version=version+1 where id=p_invoice_id returning * into inv;
  update checkout_private.custom_invoice_payment_requests set status='void',updated_at=now() where invoice_id=p_invoice_id and status in ('creating','open');
  insert into checkout_private.custom_invoice_events(invoice_id,event_type,operation_key,details) values(p_invoice_id,'voided',p_operation_key,jsonb_build_object('reason',left(trim(p_reason),1000)));
  return to_jsonb(inv);
end $$;

create or replace function public.custom_invoice_duplicate(p_invoice_id uuid,p_operation_key text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare source checkout_private.custom_invoices; new_id uuid := gen_random_uuid();
begin
  select (details->>'newInvoiceId')::uuid into new_id from checkout_private.custom_invoice_events where invoice_id=p_invoice_id and operation_key=p_operation_key and event_type='duplicated_to_draft';
  if found then return new_id; end if;
  new_id := gen_random_uuid();
  select * into source from checkout_private.custom_invoices where id=p_invoice_id and status<>'draft' and deleted_at is null;
  if not found then raise exception 'Source invoice not found.' using errcode='P0002'; end if;
  insert into checkout_private.custom_invoices(id,customer_name,company_name,customer_email,customer_phone,billing_address,shipping_address,customer_notes,internal_notes,fulfillment_notes,due_date,payment_terms,deposit_amount_cents,availability_acknowledged,tax_cents,source_invoice_id)
  values(new_id,source.customer_name,source.company_name,source.customer_email,source.customer_phone,source.billing_address,source.shipping_address,source.customer_notes,source.internal_notes,source.fulfillment_notes,source.due_date,source.payment_terms,source.deposit_amount_cents,source.availability_acknowledged,source.tax_cents,p_invoice_id);
  insert into checkout_private.custom_invoice_items(invoice_id,line_type,source_type,catalog_id,catalog_parent_id,description,secondary_description,sku,quantity,unit_price_cents,catalog_reference_price_cents,catalog_status,catalog_purchase_state,availability_warning,sort_order)
  select new_id,line_type,source_type,catalog_id,catalog_parent_id,description,secondary_description,sku,quantity,unit_price_cents,catalog_reference_price_cents,catalog_status,catalog_purchase_state,availability_warning,sort_order from checkout_private.custom_invoice_items where invoice_id=p_invoice_id;
  insert into checkout_private.custom_invoice_events(invoice_id,event_type,operation_key,details) values(p_invoice_id,'duplicated_to_draft',p_operation_key,jsonb_build_object('newInvoiceId',new_id));
  insert into checkout_private.custom_invoice_events(invoice_id,event_type,operation_key,details) values(new_id,'draft_created_from_invoice','source:'||p_operation_key,jsonb_build_object('sourceInvoiceId',p_invoice_id));
  return new_id;
end $$;

create or replace function public.custom_invoice_apply_stripe_event(p_event_id text,p_event_type text,p_stripe_invoice_id text,p_payment_intent_id text,p_amount_paid bigint,p_currency text,p_livemode boolean,p_expected_livemode boolean)
returns text language plpgsql security invoker set search_path='' as $$
declare req checkout_private.custom_invoice_payment_requests; inv checkout_private.custom_invoices; inserted_count bigint; result text;
begin
  if exists(select 1 from checkout_private.custom_invoice_webhook_receipts where stripe_event_id=p_event_id) then return 'duplicate'; end if;
  select * into req from checkout_private.custom_invoice_payment_requests where stripe_invoice_id=p_stripe_invoice_id for update;
  if not found then return 'not_custom_invoice'; end if;
  if exists(select 1 from checkout_private.custom_invoice_webhook_receipts where stripe_event_id=p_event_id) then return 'duplicate'; end if;
  if p_livemode<>p_expected_livemode or p_currency<>'usd' then result='rejected';
  elsif p_event_type='invoice.paid' and p_amount_paid=req.amount_cents and p_payment_intent_id is not null and p_payment_intent_id ~ '^pi_[A-Za-z0-9_]+$' then
    select * into inv from checkout_private.custom_invoices where id=req.invoice_id for update;
    if p_amount_paid > inv.total_cents-inv.amount_paid_cents then result='rejected'; else
      insert into checkout_private.custom_invoice_payments(invoice_id,payment_request_id,source,method,amount_cents,operation_key,external_payment_id,received_at) values(req.invoice_id,req.id,'stripe',case when req.allowed_payment_methods=array['us_bank_account']::text[] then 'ach' when req.allowed_payment_methods=array['card']::text[] then 'card' else 'other' end,p_amount_paid,'stripe:'||p_stripe_invoice_id,p_payment_intent_id,now()) on conflict(operation_key) do nothing;
      get diagnostics inserted_count = row_count;
      if inserted_count=1 then
        update checkout_private.custom_invoice_payment_requests set status='paid',stripe_payment_intent_id=coalesce(stripe_payment_intent_id,p_payment_intent_id),paid_at=coalesce(paid_at,now()),updated_at=now() where id=req.id;
        update checkout_private.custom_invoices set amount_paid_cents=amount_paid_cents+p_amount_paid,status=case when amount_paid_cents+p_amount_paid=total_cents then 'paid' else 'partially_paid' end,paid_at=case when amount_paid_cents+p_amount_paid=total_cents then now() else null end,updated_at=now(),version=version+1 where id=req.invoice_id;
        insert into checkout_private.custom_invoice_events(invoice_id,event_type,operation_key,details) values(req.invoice_id,'stripe_payment_recorded','stripe-event:'||p_event_id,jsonb_build_object('amountCents',p_amount_paid,'requestId',req.id));
      end if;
      result='processed';
    end if;
  elsif p_event_type='invoice.payment_failed' and req.status='open' then
    update checkout_private.custom_invoice_payment_requests set updated_at=now() where id=req.id and status='open';
    insert into checkout_private.custom_invoice_events(invoice_id,event_type,operation_key,details) values(req.invoice_id,'stripe_payment_failed','stripe-event:'||p_event_id,jsonb_build_object('requestId',req.id));
    result='processed';
  elsif p_event_type='invoice.voided' and req.status<>'paid' then
    update checkout_private.custom_invoice_payment_requests set status='void',updated_at=now() where id=req.id;
    insert into checkout_private.custom_invoice_events(invoice_id,event_type,operation_key,details) values(req.invoice_id,'stripe_payment_request_voided','stripe-event:'||p_event_id,jsonb_build_object('requestId',req.id));
    result='processed';
  else result='ignored'; end if;
  if result='rejected' then raise exception 'Custom invoice reconciliation rejected.' using errcode='22023'; end if;
  insert into checkout_private.custom_invoice_webhook_receipts(stripe_event_id,event_type,stripe_object_id,livemode,status) values(p_event_id,p_event_type,p_stripe_invoice_id,p_livemode,result);
  return result;
end $$;

create or replace function public.custom_invoice_apply_stripe_refund(p_event_id text,p_payment_intent_id text,p_charge_amount bigint,p_cumulative_refunded bigint,p_currency text,p_livemode boolean,p_expected_livemode boolean)
returns text language plpgsql security invoker set search_path='' as $$
declare payment checkout_private.custom_invoice_payments; inv checkout_private.custom_invoices; already bigint; delta bigint;
begin
  if exists(select 1 from checkout_private.custom_invoice_webhook_receipts where stripe_event_id=p_event_id) then return 'duplicate'; end if;
  select * into payment from checkout_private.custom_invoice_payments where external_payment_id=p_payment_intent_id and source='stripe' for update;
  if not found then return 'not_custom_invoice'; end if;
  if exists(select 1 from checkout_private.custom_invoice_webhook_receipts where stripe_event_id=p_event_id) then return 'duplicate'; end if;
  if p_livemode<>p_expected_livemode or p_currency<>'usd' or p_charge_amount<>payment.amount_cents or p_cumulative_refunded<0 or p_cumulative_refunded>payment.amount_cents then raise exception 'Custom invoice refund reconciliation rejected.' using errcode='22023'; end if;
  select coalesce(sum(amount_cents),0) into already from checkout_private.custom_invoice_refunds where payment_id=payment.id;
  delta := p_cumulative_refunded-already;
  if delta<0 then raise exception 'Custom invoice refund moved backwards.' using errcode='22023'; end if;
  if delta>0 then
    select * into inv from checkout_private.custom_invoices where id=payment.invoice_id for update;
    insert into checkout_private.custom_invoice_refunds(invoice_id,payment_id,amount_cents,stripe_event_id) values(payment.invoice_id,payment.id,delta,p_event_id);
    update checkout_private.custom_invoices set amount_paid_cents=amount_paid_cents-delta,status=case when amount_paid_cents-delta=0 and first_sent_at is null then 'finalized' when amount_paid_cents-delta=0 then 'sent' else 'partially_paid' end,paid_at=null,updated_at=now(),version=version+1 where id=payment.invoice_id;
    insert into checkout_private.custom_invoice_events(invoice_id,event_type,operation_key,details) values(payment.invoice_id,'stripe_refund_recorded','stripe-event:'||p_event_id,jsonb_build_object('amountCents',delta,'paymentId',payment.id));
  end if;
  insert into checkout_private.custom_invoice_webhook_receipts(stripe_event_id,event_type,stripe_object_id,livemode,status) values(p_event_id,'charge.refunded',p_payment_intent_id,p_livemode,'processed');
  return 'processed';
end $$;

create or replace function public.custom_invoice_claim_delivery(p_request_id uuid,p_operation_key text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare req checkout_private.custom_invoice_payment_requests;
begin
  select * into req from checkout_private.custom_invoice_payment_requests where id=p_request_id for update;
  if not found or req.status <> 'open' then raise exception 'Payment request is not deliverable.' using errcode='22023'; end if;
  if req.email_status='sent' then return to_jsonb(req); end if;
  if req.email_status='sending' and req.email_operation_key<>p_operation_key and req.updated_at >= now()-interval '15 minutes' then raise exception 'Invoice delivery is already in progress.' using errcode='55000'; end if;
  update checkout_private.custom_invoice_payment_requests set email_status='sending',email_operation_key=p_operation_key,email_last_error=null,updated_at=now() where id=p_request_id returning * into req;
  return to_jsonb(req);
end $$;

create or replace function public.custom_invoice_finish_delivery(p_request_id uuid,p_operation_key text,p_provider_id text)
returns void language plpgsql security invoker set search_path='' as $$
declare iid uuid;
begin
  update checkout_private.custom_invoice_payment_requests set email_status='sent',email_provider_id=p_provider_id,sent_at=coalesce(sent_at,now()),updated_at=now() where id=p_request_id and email_operation_key=p_operation_key and email_status in ('sending','sent') returning invoice_id into iid;
  if not found then raise exception 'Invoice delivery claim was lost.' using errcode='55000'; end if;
  update checkout_private.custom_invoices set status=case when status='finalized' then 'sent' else status end,first_sent_at=coalesce(first_sent_at,now()),updated_at=now(),version=version+1 where id=iid;
  insert into checkout_private.custom_invoice_events(invoice_id,event_type,operation_key,details) values(iid,'invoice_emailed','email:'||p_operation_key,jsonb_build_object('requestId',p_request_id)) on conflict(invoice_id,operation_key) do nothing;
end $$;

create or replace function public.custom_invoice_fail_delivery(p_request_id uuid,p_operation_key text)
returns void language plpgsql security invoker set search_path='' as $$
begin
  update checkout_private.custom_invoice_payment_requests set email_status='failed',email_last_error='Delivery provider rejected the request.',updated_at=now() where id=p_request_id and email_status='sending' and email_operation_key=p_operation_key;
end $$;

revoke all on function public.custom_invoice_finalize(uuid,bigint,text) from public, anon, authenticated;
revoke all on function public.custom_invoice_save_draft(uuid,bigint,jsonb,jsonb,text) from public, anon, authenticated;
revoke all on function public.custom_invoice_list(text,text,integer,integer) from public, anon, authenticated;
revoke all on function public.custom_invoice_read(uuid) from public, anon, authenticated;
revoke all on function public.custom_invoice_request_by_stripe_id(text) from public, anon, authenticated;
revoke all on function public.custom_invoice_delete_draft(uuid,bigint,text) from public, anon, authenticated;
revoke all on function public.custom_invoice_record_manual_payment(uuid,bigint,text,text,text,timestamptz,text) from public, anon, authenticated;
revoke all on function public.custom_invoice_cancel_payment_requests(uuid,text) from public, anon, authenticated;
revoke all on function public.custom_invoice_reserve_payment_request(uuid,text,text[],text) from public, anon, authenticated;
revoke all on function public.custom_invoice_link_payment_request(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.custom_invoice_void(uuid,text,text) from public, anon, authenticated;
revoke all on function public.custom_invoice_duplicate(uuid,text) from public, anon, authenticated;
revoke all on function public.custom_invoice_apply_stripe_event(text,text,text,text,bigint,text,boolean,boolean) from public, anon, authenticated;
revoke all on function public.custom_invoice_apply_stripe_refund(text,text,bigint,bigint,text,boolean,boolean) from public, anon, authenticated;
revoke all on function public.custom_invoice_claim_delivery(uuid,text) from public, anon, authenticated;
revoke all on function public.custom_invoice_finish_delivery(uuid,text,text) from public, anon, authenticated;
revoke all on function public.custom_invoice_fail_delivery(uuid,text) from public, anon, authenticated;
grant execute on function public.custom_invoice_finalize(uuid,bigint,text) to service_role;
grant execute on function public.custom_invoice_save_draft(uuid,bigint,jsonb,jsonb,text) to service_role;
grant execute on function public.custom_invoice_list(text,text,integer,integer) to service_role;
grant execute on function public.custom_invoice_read(uuid) to service_role;
grant execute on function public.custom_invoice_request_by_stripe_id(text) to service_role;
grant execute on function public.custom_invoice_delete_draft(uuid,bigint,text) to service_role;
grant execute on function public.custom_invoice_record_manual_payment(uuid,bigint,text,text,text,timestamptz,text) to service_role;
grant execute on function public.custom_invoice_cancel_payment_requests(uuid,text) to service_role;
grant execute on function public.custom_invoice_reserve_payment_request(uuid,text,text[],text) to service_role;
grant execute on function public.custom_invoice_link_payment_request(uuid,text,text,text) to service_role;
grant execute on function public.custom_invoice_void(uuid,text,text) to service_role;
grant execute on function public.custom_invoice_duplicate(uuid,text) to service_role;
grant execute on function public.custom_invoice_apply_stripe_event(text,text,text,text,bigint,text,boolean,boolean) to service_role;
grant execute on function public.custom_invoice_apply_stripe_refund(text,text,bigint,bigint,text,boolean,boolean) to service_role;
grant execute on function public.custom_invoice_claim_delivery(uuid,text) to service_role;
grant execute on function public.custom_invoice_finish_delivery(uuid,text,text) to service_role;
grant execute on function public.custom_invoice_fail_delivery(uuid,text) to service_role;

revoke all on all functions in schema checkout_private from public, anon, authenticated;
grant execute on all functions in schema checkout_private to service_role;

commit;
