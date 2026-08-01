begin;

do $$
begin
  if exists (select 1 from checkout_private.orders where payment_method_choice not in ('card','ach','ach_debit','wire_transfer')) then raise exception 'unsupported existing order payment method'; end if;
  if exists (select 1 from checkout_private.payment_attempts where payment_method not in ('card','ach','ach_debit','wire_transfer')) then raise exception 'unsupported existing attempt payment method'; end if;
end $$;

alter table checkout_private.orders drop constraint orders_payment_method_choice_check;
alter table checkout_private.orders add constraint orders_payment_method_choice_check check (payment_method_choice in ('card','ach','ach_debit','wire_transfer'));
alter table checkout_private.orders drop constraint orders_payment_status_check;
alter table checkout_private.orders add constraint orders_payment_status_check check (payment_status in ('unpaid','awaiting_customer_action','processing','awaiting_customer_funds','partially_funded','paid','failed','partially_refunded','refunded','disputed'));

alter table checkout_private.payment_attempts drop constraint payment_attempts_payment_method_check;
alter table checkout_private.payment_attempts add constraint payment_attempts_payment_method_check check (payment_method in ('card','ach','ach_debit','wire_transfer'));
alter table checkout_private.payment_attempts drop constraint payment_attempts_attempt_status_check;
alter table checkout_private.payment_attempts add constraint payment_attempts_attempt_status_check check (attempt_status in ('creating','open','awaiting_customer_action','completed','processing','awaiting_customer_funds','partially_funded','succeeded','failed','expired'));
alter table checkout_private.payment_attempts
  add column stripe_payment_intent_status text,
  add column funded_amount_cents bigint check (funded_amount_cents is null or funded_amount_cents >= 0),
  add column amount_remaining_cents bigint check (amount_remaining_cents is null or amount_remaining_cents >= 0),
  add column payment_method_audit_status text check (payment_method_audit_status is null or payment_method_audit_status in ('awaiting_customer_action','processing','awaiting_customer_funds','partially_funded','paid','failed','expired','refund_pending','refunded','disputed','review_required'));

create table checkout_private.bank_payment_reconciliation_reviews (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references checkout_private.payment_attempts(id) on delete restrict,
  customer_id uuid not null references checkout_private.customers(id) on delete restrict,
  stripe_event_id text not null unique references checkout_private.stripe_webhook_events(stripe_event_id) on delete restrict,
  review_kind text not null check (review_kind in ('overpayment','partial_funding_expiration','unallocated_customer_balance','refund_failure')),
  amount_cents bigint check (amount_cents is null or amount_cents >= 0),
  currency text check (currency is null or currency = 'usd'),
  review_status text not null default 'open' check (review_status in ('open','resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check ((review_status='resolved') = (resolved_at is not null))
);
create index checkout_bank_payment_reviews_open_idx on checkout_private.bank_payment_reconciliation_reviews(review_status,created_at);
alter table checkout_private.bank_payment_reconciliation_reviews enable row level security;
alter table checkout_private.bank_payment_reconciliation_reviews force row level security;
revoke all on table checkout_private.bank_payment_reconciliation_reviews from public,anon,authenticated;
grant select,insert,update on table checkout_private.bank_payment_reconciliation_reviews to service_role;

create or replace function public.checkout_create_ach_draft(p_idempotency_key text,p_request_fingerprint text,p_customer jsonb,p_snapshot jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public,checkout_private as $$
declare a checkout_private.payment_attempts; c checkout_private.customers; o checkout_private.orders; item jsonb; ref text; subtotal bigint; discount bigint; fee bigint; shipping bigint; tax bigint; total bigint; monetary_key text; monetary_text text;
begin
  foreach monetary_key in array array['subtotalCents','discountCents','feeCents','shippingCents','taxCents','totalCents'] loop
    monetary_text := p_snapshot->>monetary_key;
    if jsonb_typeof(p_snapshot->monetary_key) is distinct from 'number' or monetary_text !~ '^(0|[1-9][0-9]*)$' or length(monetary_text)>19 or (length(monetary_text)=19 and monetary_text>'9223372036854775807') then raise exception 'invalid ach monetary field: %',monetary_key; end if;
  end loop;
  subtotal := (p_snapshot->>'subtotalCents')::bigint; discount := (p_snapshot->>'discountCents')::bigint; fee := (p_snapshot->>'feeCents')::bigint; shipping := (p_snapshot->>'shippingCents')::bigint; tax := (p_snapshot->>'taxCents')::bigint; total := (p_snapshot->>'totalCents')::bigint;
  if p_snapshot->>'paymentMethod' is distinct from 'ach_debit' or p_snapshot->>'currency' is distinct from 'usd' or discount<>round(subtotal*275::numeric/10000)::bigint or fee<>0 or subtotal::numeric-discount+fee+shipping+tax>9223372036854775807::numeric or total::numeric<>subtotal::numeric-discount+fee+shipping+tax then raise exception 'invalid ach pricing snapshot'; end if;
  select * into a from checkout_private.payment_attempts where idempotency_key=p_idempotency_key;
  if found then
    if a.payment_method<>'ach_debit' or a.request_fingerprint<>p_request_fingerprint then raise exception using errcode='23505',message='checkout_idempotency_conflict'; end if;
    select * into o from checkout_private.orders where id=a.order_id;
    select * into c from checkout_private.customers where id=o.customer_id;
    return jsonb_build_object('customerId',c.id,'stripeCustomerId',c.stripe_customer_id,'orderId',o.id,'publicReference',o.public_reference,'attemptId',a.id,'attemptNumber',a.attempt_number,'attemptStatus',a.attempt_status,'attemptCreatedAt',a.created_at,'stripeIdempotencyKey',a.idempotency_key,'sessionId',a.stripe_checkout_session_id);
  end if;
  insert into checkout_private.customers(email,normalized_email,name,phone,shipping_address) values(nullif(p_customer->>'email',''),nullif(lower(p_customer->>'email'),''),p_customer->>'name',nullif(p_customer->>'phone',''),p_customer->'shippingAddress') returning * into c;
  ref := 'IDS-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
  insert into checkout_private.orders(customer_id,public_reference,order_status,payment_status,fulfillment_status,currency,subtotal_cents,discount_cents,fee_cents,shipping_cents,tax_cents,total_cents,payment_method_choice,customer_name,customer_email,customer_phone,shipping_address,pricing_snapshot,catalog_priced_at)
  values(c.id,ref,'checkout_pending','unpaid','not_ready','usd',subtotal,discount,fee,shipping,tax,total,'ach_debit',p_customer->>'name',nullif(p_customer->>'email',''),nullif(p_customer->>'phone',''),p_customer->'shippingAddress',p_snapshot,(p_snapshot->>'pricedAt')::timestamptz) returning * into o;
  for item in select * from jsonb_array_elements((p_snapshot->'chargeableItems')||(p_snapshot->'includedPackageComponents')) loop
    insert into checkout_private.order_items(order_id,item_type,product_id,variant_id,option_id,package_id,sku,name_snapshot,description_snapshot,quantity,unit_amount_cents,extended_amount_cents,included_in_package_price,metadata_snapshot)
    values(o.id,item->>'itemType',case when item->>'itemType'='product' then (item->>'sourceId')::uuid end,case when item->>'itemType'='variant' then (item->>'sourceId')::uuid end,case when item->>'itemType' in ('option','package_component') then (item->>'sourceId')::uuid end,case when item->>'itemType'='package' then (item->>'sourceId')::uuid end,nullif(item->>'sku',''),item->>'name',nullif(item->>'description',''),(item->>'quantity')::int,(item->>'unitAmountCents')::bigint,(item->>'extendedAmountCents')::bigint,(item->>'includedInPackagePrice')::boolean,'{}');
  end loop;
  insert into checkout_private.payment_attempts(order_id,attempt_number,payment_method,idempotency_key,request_fingerprint,expected_amount_cents,expected_currency) values(o.id,1,'ach_debit',p_idempotency_key,p_request_fingerprint,total,'usd') returning * into a;
  return jsonb_build_object('customerId',c.id,'stripeCustomerId',null,'orderId',o.id,'publicReference',ref,'attemptId',a.id,'attemptNumber',1,'attemptStatus',a.attempt_status,'attemptCreatedAt',a.created_at,'stripeIdempotencyKey',a.idempotency_key,'sessionId',null);
end $$;

create or replace function public.checkout_create_wire_draft(p_idempotency_key text,p_request_fingerprint text,p_customer jsonb,p_snapshot jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public,checkout_private as $$
declare a checkout_private.payment_attempts; c checkout_private.customers; o checkout_private.orders; item jsonb; ref text; subtotal bigint; discount bigint; fee bigint; shipping bigint; tax bigint; total bigint; monetary_key text; monetary_text text;
begin
  foreach monetary_key in array array['subtotalCents','discountCents','feeCents','shippingCents','taxCents','totalCents'] loop
    monetary_text := p_snapshot->>monetary_key;
    if jsonb_typeof(p_snapshot->monetary_key) is distinct from 'number' or monetary_text !~ '^(0|[1-9][0-9]*)$' or length(monetary_text)>19 or (length(monetary_text)=19 and monetary_text>'9223372036854775807') then raise exception 'invalid wire monetary field: %',monetary_key; end if;
  end loop;
  subtotal := (p_snapshot->>'subtotalCents')::bigint; discount := (p_snapshot->>'discountCents')::bigint; fee := (p_snapshot->>'feeCents')::bigint; shipping := (p_snapshot->>'shippingCents')::bigint; tax := (p_snapshot->>'taxCents')::bigint; total := (p_snapshot->>'totalCents')::bigint;
  if p_snapshot->>'paymentMethod' is distinct from 'wire_transfer' or p_snapshot->>'currency' is distinct from 'usd' or discount<>round(subtotal*275::numeric/10000)::bigint or fee<>0 or subtotal::numeric-discount+fee+shipping+tax>9223372036854775807::numeric or total::numeric<>subtotal::numeric-discount+fee+shipping+tax then raise exception 'invalid wire pricing snapshot'; end if;
  select * into a from checkout_private.payment_attempts where idempotency_key=p_idempotency_key;
  if found then
    if a.payment_method<>'wire_transfer' or a.request_fingerprint<>p_request_fingerprint then raise exception using errcode='23505',message='checkout_idempotency_conflict'; end if;
    select * into o from checkout_private.orders where id=a.order_id;
    select * into c from checkout_private.customers where id=o.customer_id;
    return jsonb_build_object('customerId',c.id,'stripeCustomerId',c.stripe_customer_id,'orderId',o.id,'publicReference',o.public_reference,'attemptId',a.id,'attemptNumber',a.attempt_number,'attemptStatus',a.attempt_status,'attemptCreatedAt',a.created_at,'stripeIdempotencyKey',a.idempotency_key,'sessionId',a.stripe_checkout_session_id);
  end if;
  insert into checkout_private.customers(email,normalized_email,name,phone,shipping_address) values(nullif(p_customer->>'email',''),nullif(lower(p_customer->>'email'),''),p_customer->>'name',nullif(p_customer->>'phone',''),p_customer->'shippingAddress') returning * into c;
  ref := 'IDS-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
  insert into checkout_private.orders(customer_id,public_reference,order_status,payment_status,fulfillment_status,currency,subtotal_cents,discount_cents,fee_cents,shipping_cents,tax_cents,total_cents,payment_method_choice,customer_name,customer_email,customer_phone,shipping_address,pricing_snapshot,catalog_priced_at)
  values(c.id,ref,'checkout_pending','awaiting_customer_funds','not_ready','usd',subtotal,discount,fee,shipping,tax,total,'wire_transfer',p_customer->>'name',nullif(p_customer->>'email',''),nullif(p_customer->>'phone',''),p_customer->'shippingAddress',p_snapshot,(p_snapshot->>'pricedAt')::timestamptz) returning * into o;
  for item in select * from jsonb_array_elements((p_snapshot->'chargeableItems')||(p_snapshot->'includedPackageComponents')) loop
    insert into checkout_private.order_items(order_id,item_type,product_id,variant_id,option_id,package_id,sku,name_snapshot,description_snapshot,quantity,unit_amount_cents,extended_amount_cents,included_in_package_price,metadata_snapshot)
    values(o.id,item->>'itemType',case when item->>'itemType'='product' then (item->>'sourceId')::uuid end,case when item->>'itemType'='variant' then (item->>'sourceId')::uuid end,case when item->>'itemType' in ('option','package_component') then (item->>'sourceId')::uuid end,case when item->>'itemType'='package' then (item->>'sourceId')::uuid end,nullif(item->>'sku',''),item->>'name',nullif(item->>'description',''),(item->>'quantity')::int,(item->>'unitAmountCents')::bigint,(item->>'extendedAmountCents')::bigint,(item->>'includedInPackagePrice')::boolean,'{}');
  end loop;
  insert into checkout_private.payment_attempts(order_id,attempt_number,payment_method,idempotency_key,request_fingerprint,expected_amount_cents,expected_currency,attempt_status,payment_method_audit_status,funded_amount_cents,amount_remaining_cents) values(o.id,1,'wire_transfer',p_idempotency_key,p_request_fingerprint,total,'usd','awaiting_customer_funds','awaiting_customer_funds',0,total) returning * into a;
  return jsonb_build_object('customerId',c.id,'stripeCustomerId',null,'orderId',o.id,'publicReference',ref,'attemptId',a.id,'attemptNumber',1,'attemptStatus',a.attempt_status,'attemptCreatedAt',a.created_at,'stripeIdempotencyKey',a.idempotency_key,'sessionId',null);
end $$;

create or replace function public.checkout_link_ach_session(p_attempt_id uuid,p_session_id text,p_payment_intent_id text,p_session_status text,p_payment_status text,p_payment_intent_status text,p_created_at timestamptz,p_expires_at timestamptz)
returns void language plpgsql security invoker set search_path=pg_catalog,public,checkout_private as $$
declare n integer;
begin
  if p_session_id is null or btrim(p_session_id)='' or p_created_at is null then raise exception 'invalid ach session linkage'; end if;
  update checkout_private.payment_attempts set stripe_checkout_session_id=p_session_id,stripe_payment_intent_id=coalesce(p_payment_intent_id,stripe_payment_intent_id),stripe_session_status=p_session_status,stripe_payment_status=p_payment_status,stripe_payment_intent_status=p_payment_intent_status,checkout_url_created_at=p_created_at,expires_at=p_expires_at,attempt_status=case when attempt_status='creating' then 'open' else attempt_status end,updated_at=now()
  where id=p_attempt_id and payment_method='ach_debit' and (stripe_checkout_session_id is null or stripe_checkout_session_id=p_session_id) and (p_payment_intent_id is null or stripe_payment_intent_id is null or stripe_payment_intent_id=p_payment_intent_id);
  get diagnostics n=row_count; if n<>1 then raise exception 'ach_session_link_conflict'; end if;
end $$;

create or replace function public.checkout_link_wire_session(p_attempt_id uuid,p_stripe_customer_id text,p_session_id text,p_payment_intent_id text,p_session_status text,p_payment_status text,p_payment_intent_status text,p_created_at timestamptz,p_expires_at timestamptz)
returns void language plpgsql security invoker set search_path=pg_catalog,public,checkout_private as $$
declare a checkout_private.payment_attempts; o checkout_private.orders; n integer;
begin
  if p_stripe_customer_id is null or btrim(p_stripe_customer_id)='' or p_session_id is null or btrim(p_session_id)='' or p_created_at is null then raise exception 'invalid wire session linkage'; end if;
  select * into a from checkout_private.payment_attempts where id=p_attempt_id and payment_method='wire_transfer' for update; if not found then raise exception 'wire_attempt_missing'; end if;
  select * into o from checkout_private.orders where id=a.order_id for update; if not found then raise exception 'wire_order_missing'; end if;
  update checkout_private.customers set stripe_customer_id=p_stripe_customer_id,stripe_customer_created_at=coalesce(stripe_customer_created_at,now()),updated_at=now() where id=o.customer_id and (stripe_customer_id is null or stripe_customer_id=p_stripe_customer_id);
  get diagnostics n=row_count; if n<>1 then raise exception 'wire_customer_conflict'; end if;
  update checkout_private.payment_attempts set stripe_checkout_session_id=p_session_id,stripe_payment_intent_id=coalesce(p_payment_intent_id,stripe_payment_intent_id),stripe_session_status=p_session_status,stripe_payment_status=p_payment_status,stripe_payment_intent_status=p_payment_intent_status,checkout_url_created_at=p_created_at,expires_at=p_expires_at,attempt_status='awaiting_customer_funds',payment_method_audit_status='awaiting_customer_funds',updated_at=now()
  where id=a.id and (stripe_checkout_session_id is null or stripe_checkout_session_id=p_session_id) and (p_payment_intent_id is null or stripe_payment_intent_id is null or stripe_payment_intent_id=p_payment_intent_id);
  get diagnostics n=row_count; if n<>1 then raise exception 'wire_session_link_conflict'; end if;
end $$;

create or replace function public.checkout_apply_ach_event_v1(p_kind text,p_session_id text,p_payment_intent_id text,p_order_id uuid,p_attempt_id uuid,p_amount bigint,p_currency text,p_stripe_session_status text,p_stripe_payment_status text,p_payment_intent_status text,p_refunded bigint default null)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public,checkout_private as $$
declare a checkout_private.payment_attempts; o checkout_private.orders; n integer;
begin
  if p_kind is null or p_kind not in ('awaiting_customer_action','processing','paid','failed','expired','refund','dispute') then raise exception 'unsupported ach event'; end if;
  select * into a from checkout_private.payment_attempts where id=p_attempt_id and order_id=p_order_id and payment_method='ach_debit' and (stripe_checkout_session_id=p_session_id or stripe_payment_intent_id=p_payment_intent_id) for update; if not found then raise exception 'ach_relationship_mismatch'; end if;
  select * into o from checkout_private.orders where id=p_order_id and payment_method_choice='ach_debit' for update; if not found then raise exception 'ach_order_missing'; end if;
  if p_amount is null or p_currency is null or (p_kind<>'dispute' and a.expected_amount_cents<>p_amount) or (p_kind='dispute' and (p_amount<1 or p_amount>a.expected_amount_cents)) or a.expected_currency<>lower(p_currency) then raise exception 'ach_reconciliation_mismatch'; end if;
  if p_kind='paid' and (p_payment_intent_status is distinct from 'succeeded' or a.attempt_status in ('failed','expired')) then raise exception 'invalid ach success'; end if;
  if p_kind='processing' and a.attempt_status in ('succeeded','failed','expired') then raise exception 'invalid ach processing transition'; end if;
  if p_kind='expired' and a.attempt_status in ('processing','succeeded','failed') then raise exception 'invalid ach expiration'; end if;
  if p_kind='refund' and (p_refunded is null or p_refunded<1 or p_refunded>o.total_cents) then raise exception 'invalid ach refund'; end if;
  update checkout_private.payment_attempts set stripe_payment_intent_id=coalesce(stripe_payment_intent_id,p_payment_intent_id),stripe_session_status=coalesce(p_stripe_session_status,stripe_session_status),stripe_payment_status=coalesce(p_stripe_payment_status,stripe_payment_status),stripe_payment_intent_status=coalesce(p_payment_intent_status,stripe_payment_intent_status),attempt_status=case p_kind when 'awaiting_customer_action' then 'awaiting_customer_action' when 'processing' then 'processing' when 'paid' then 'succeeded' when 'failed' then 'failed' when 'expired' then 'expired' else attempt_status end,payment_method_audit_status=case when p_kind='refund' then 'refunded' when p_kind='dispute' then 'disputed' else p_kind end,completed_at=case when p_kind='paid' then coalesce(completed_at,now()) else completed_at end,failed_at=case when p_kind='failed' then coalesce(failed_at,now()) else failed_at end,updated_at=now() where id=a.id;
  get diagnostics n=row_count; if n<>1 then raise exception 'ach attempt update mismatch'; end if;
  if p_kind='awaiting_customer_action' then update checkout_private.orders set payment_status='awaiting_customer_action',fulfillment_status='not_ready',updated_at=now() where id=o.id and payment_status in ('unpaid','awaiting_customer_action');
  elsif p_kind='processing' then update checkout_private.orders set order_status='payment_processing',payment_status='processing',fulfillment_status='not_ready',updated_at=now() where id=o.id and payment_status in ('unpaid','awaiting_customer_action','processing','failed');
  elsif p_kind='paid' then update checkout_private.orders set order_status='confirmed',payment_status='paid',fulfillment_status=case when fulfillment_status='not_ready' then 'pending' else fulfillment_status end,paid_at=coalesce(paid_at,now()),updated_at=now() where id=o.id and payment_status in ('unpaid','awaiting_customer_action','processing','failed','paid');
  elsif p_kind='failed' then update checkout_private.orders set payment_status='failed',fulfillment_status='not_ready',updated_at=now() where id=o.id and payment_status in ('unpaid','awaiting_customer_action','processing','failed');
  elsif p_kind='expired' then update checkout_private.orders set expired_at=coalesce(expired_at,now()),updated_at=now() where id=o.id and payment_status in ('unpaid','awaiting_customer_action');
  elsif p_kind='refund' then update checkout_private.orders set refunded_cents=greatest(refunded_cents,p_refunded),payment_status=case when greatest(refunded_cents,p_refunded)=total_cents then 'refunded' else 'partially_refunded' end,updated_at=now() where id=o.id and payment_status in ('paid','partially_refunded','refunded','disputed');
  else update checkout_private.orders set payment_status='disputed',updated_at=now() where id=o.id and payment_status in ('paid','partially_refunded','refunded','disputed'); end if;
  get diagnostics n=row_count; if n<>1 then raise exception 'ach order update mismatch'; end if;
  return jsonb_build_object('publicReference',o.public_reference);
end $$;

create or replace function public.checkout_apply_wire_event_v1(p_kind text,p_event_id text,p_session_id text,p_payment_intent_id text,p_order_id uuid,p_attempt_id uuid,p_amount bigint,p_currency text,p_stripe_session_status text,p_stripe_payment_status text,p_payment_intent_status text,p_funded bigint,p_remaining bigint,p_refunded bigint default null)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public,checkout_private as $$
declare a checkout_private.payment_attempts; o checkout_private.orders; n integer;
begin
  if p_kind is null or p_kind not in ('awaiting_customer_funds','partially_funded','paid','failed','expired','refund','dispute','overpayment') then raise exception 'unsupported wire event'; end if;
  select * into a from checkout_private.payment_attempts where id=p_attempt_id and order_id=p_order_id and payment_method='wire_transfer' and (stripe_checkout_session_id=p_session_id or stripe_payment_intent_id=p_payment_intent_id) for update; if not found then raise exception 'wire_relationship_mismatch'; end if;
  select * into o from checkout_private.orders where id=p_order_id and payment_method_choice='wire_transfer' for update; if not found then raise exception 'wire_order_missing'; end if;
  if p_amount is null or p_currency is null or a.expected_amount_cents<>p_amount or a.expected_currency<>lower(p_currency) or p_funded is null or p_remaining is null or p_funded<0 or p_remaining<0 then raise exception 'wire_reconciliation_mismatch'; end if;
  if p_kind='paid' and (p_payment_intent_status is distinct from 'succeeded' or p_funded<>a.expected_amount_cents or p_remaining<>0) then raise exception 'invalid wire success'; end if;
  if p_kind='partially_funded' and (p_funded<1 or p_funded>=a.expected_amount_cents or p_remaining<>a.expected_amount_cents-p_funded) then raise exception 'invalid partial funding'; end if;
  if p_kind='expired' and (p_funded<>0 or a.attempt_status in ('partially_funded','succeeded','failed')) then raise exception 'invalid wire expiration'; end if;
  if p_kind='refund' and (p_refunded is null or p_refunded<1 or p_refunded>o.total_cents) then raise exception 'invalid wire refund'; end if;
  if p_kind='overpayment' and (p_event_id is null or p_funded<=a.expected_amount_cents or p_remaining<>0) then raise exception 'invalid wire overpayment'; end if;
  update checkout_private.payment_attempts set stripe_payment_intent_id=coalesce(stripe_payment_intent_id,p_payment_intent_id),stripe_session_status=coalesce(p_stripe_session_status,stripe_session_status),stripe_payment_status=coalesce(p_stripe_payment_status,stripe_payment_status),stripe_payment_intent_status=coalesce(p_payment_intent_status,stripe_payment_intent_status),funded_amount_cents=greatest(coalesce(funded_amount_cents,0),p_funded),amount_remaining_cents=p_remaining,attempt_status=case p_kind when 'awaiting_customer_funds' then 'awaiting_customer_funds' when 'partially_funded' then 'partially_funded' when 'paid' then 'succeeded' when 'failed' then 'failed' when 'expired' then 'expired' else attempt_status end,payment_method_audit_status=case when p_kind='overpayment' then 'review_required' when p_kind='refund' then 'refunded' when p_kind='dispute' then 'disputed' else p_kind end,completed_at=case when p_kind='paid' then coalesce(completed_at,now()) else completed_at end,failed_at=case when p_kind='failed' then coalesce(failed_at,now()) else failed_at end,updated_at=now() where id=a.id;
  get diagnostics n=row_count; if n<>1 then raise exception 'wire attempt update mismatch'; end if;
  if p_kind='awaiting_customer_funds' then update checkout_private.orders set payment_status='awaiting_customer_funds',fulfillment_status='not_ready',updated_at=now() where id=o.id and payment_status in ('awaiting_customer_funds','unpaid');
  elsif p_kind='partially_funded' then update checkout_private.orders set payment_status='partially_funded',fulfillment_status='not_ready',updated_at=now() where id=o.id and payment_status in ('awaiting_customer_funds','partially_funded');
  elsif p_kind='paid' then update checkout_private.orders set order_status='confirmed',payment_status='paid',fulfillment_status=case when fulfillment_status='not_ready' then 'pending' else fulfillment_status end,paid_at=coalesce(paid_at,now()),updated_at=now() where id=o.id and payment_status in ('awaiting_customer_funds','partially_funded','paid');
  elsif p_kind='failed' then update checkout_private.orders set payment_status='failed',fulfillment_status='not_ready',updated_at=now() where id=o.id and payment_status in ('awaiting_customer_funds','partially_funded','failed');
  elsif p_kind='expired' then update checkout_private.orders set expired_at=coalesce(expired_at,now()),updated_at=now() where id=o.id and payment_status='awaiting_customer_funds';
  elsif p_kind='refund' then update checkout_private.orders set refunded_cents=greatest(refunded_cents,p_refunded),payment_status=case when greatest(refunded_cents,p_refunded)=total_cents then 'refunded' else 'partially_refunded' end,updated_at=now() where id=o.id and payment_status in ('paid','partially_refunded','refunded','disputed');
  elsif p_kind='dispute' then update checkout_private.orders set payment_status='disputed',updated_at=now() where id=o.id and payment_status in ('paid','partially_refunded','refunded','disputed');
  else
    insert into checkout_private.bank_payment_reconciliation_reviews(attempt_id,customer_id,stripe_event_id,review_kind,amount_cents,currency) values(a.id,o.customer_id,p_event_id,'overpayment',greatest(p_funded-a.expected_amount_cents,0),lower(p_currency)) on conflict(stripe_event_id) do nothing;
    if not found then perform 1 from checkout_private.bank_payment_reconciliation_reviews where stripe_event_id=p_event_id and attempt_id=a.id; if not found then raise exception 'wire review conflict'; end if; end if;
    return jsonb_build_object('publicReference',o.public_reference,'reviewRequired',true);
  end if;
  get diagnostics n=row_count; if n<>1 then raise exception 'wire order update mismatch'; end if;
  return jsonb_build_object('publicReference',o.public_reference);
end $$;

create or replace function public.checkout_find_attempt(p_session_id text default null,p_payment_intent_id text default null)
returns jsonb language sql security invoker set search_path=pg_catalog,public,checkout_private as $$
 select jsonb_build_object('attemptId',a.id,'orderId',o.id,'customerId',o.customer_id,'publicReference',o.public_reference,'attemptStatus',a.attempt_status,'paymentStatus',o.payment_status,'orderStatus',o.order_status,'fulfillmentStatus',o.fulfillment_status,'currency',o.currency,'totalCents',o.total_cents,'refundedCents',o.refunded_cents,'fundedAmountCents',a.funded_amount_cents,'amountRemainingCents',a.amount_remaining_cents,'snapshot',o.pricing_snapshot,'sessionId',a.stripe_checkout_session_id,'paymentIntentId',a.stripe_payment_intent_id)
 from checkout_private.payment_attempts a join checkout_private.orders o on o.id=a.order_id
 where (p_session_id is not null and a.stripe_checkout_session_id=p_session_id) or (p_payment_intent_id is not null and a.stripe_payment_intent_id=p_payment_intent_id) limit 1
$$;

create or replace function public.checkout_find_wire_attempt_by_customer(p_stripe_customer_id text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public,checkout_private as $$
declare result jsonb; n integer;
begin
  select count(*) into n from checkout_private.payment_attempts a join checkout_private.orders o on o.id=a.order_id join checkout_private.customers c on c.id=o.customer_id where c.stripe_customer_id=p_stripe_customer_id and a.payment_method='wire_transfer' and a.attempt_status in ('awaiting_customer_funds','partially_funded');
  if n<>1 then return null; end if;
  select jsonb_build_object('attemptId',a.id,'orderId',o.id,'customerId',o.customer_id,'publicReference',o.public_reference,'attemptStatus',a.attempt_status,'paymentStatus',o.payment_status,'orderStatus',o.order_status,'fulfillmentStatus',o.fulfillment_status,'currency',o.currency,'totalCents',o.total_cents,'refundedCents',o.refunded_cents,'fundedAmountCents',a.funded_amount_cents,'amountRemainingCents',a.amount_remaining_cents,'snapshot',o.pricing_snapshot,'sessionId',a.stripe_checkout_session_id,'paymentIntentId',a.stripe_payment_intent_id) into result from checkout_private.payment_attempts a join checkout_private.orders o on o.id=a.order_id join checkout_private.customers c on c.id=o.customer_id where c.stripe_customer_id=p_stripe_customer_id and a.payment_method='wire_transfer' and a.attempt_status in ('awaiting_customer_funds','partially_funded');
  return result;
end $$;

revoke all on function public.checkout_create_ach_draft(text,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.checkout_create_wire_draft(text,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.checkout_link_ach_session(uuid,text,text,text,text,text,timestamptz,timestamptz) from public,anon,authenticated;
revoke all on function public.checkout_link_wire_session(uuid,text,text,text,text,text,text,timestamptz,timestamptz) from public,anon,authenticated;
revoke all on function public.checkout_apply_ach_event_v1(text,text,text,uuid,uuid,bigint,text,text,text,text,bigint) from public,anon,authenticated;
revoke all on function public.checkout_apply_wire_event_v1(text,text,text,text,uuid,uuid,bigint,text,text,text,text,bigint,bigint,bigint) from public,anon,authenticated;
revoke all on function public.checkout_find_wire_attempt_by_customer(text) from public,anon,authenticated;
grant execute on function public.checkout_create_ach_draft(text,text,jsonb,jsonb) to service_role;
grant execute on function public.checkout_create_wire_draft(text,text,jsonb,jsonb) to service_role;
grant execute on function public.checkout_link_ach_session(uuid,text,text,text,text,text,timestamptz,timestamptz) to service_role;
grant execute on function public.checkout_link_wire_session(uuid,text,text,text,text,text,text,timestamptz,timestamptz) to service_role;
grant execute on function public.checkout_apply_ach_event_v1(text,text,text,uuid,uuid,bigint,text,text,text,text,bigint) to service_role;
grant execute on function public.checkout_apply_wire_event_v1(text,text,text,text,uuid,uuid,bigint,text,text,text,text,bigint,bigint,bigint) to service_role;
grant execute on function public.checkout_find_wire_attempt_by_customer(text) to service_role;

commit;

-- This migration is intentionally additive and must be applied only after separate approval.
