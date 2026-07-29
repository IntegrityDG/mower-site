begin;

create or replace function public.checkout_create_card_draft(p_idempotency_key text, p_request_fingerprint text, p_customer jsonb, p_snapshot jsonb)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public, checkout_private as $$
declare a checkout_private.payment_attempts; c checkout_private.customers; o checkout_private.orders; item jsonb; ref text;
begin
  select * into a from checkout_private.payment_attempts where idempotency_key=p_idempotency_key;
  if found then
    if a.request_fingerprint<>p_request_fingerprint then raise exception using errcode='23505', message='checkout_idempotency_conflict'; end if;
    select * into o from checkout_private.orders where id=a.order_id;
    return jsonb_build_object('customerId',o.customer_id,'orderId',o.id,'publicReference',o.public_reference,'attemptId',a.id,'attemptNumber',a.attempt_number,'attemptStatus',a.attempt_status,'attemptCreatedAt',a.created_at,'stripeIdempotencyKey',a.idempotency_key,'sessionId',a.stripe_checkout_session_id);
  end if;
  insert into checkout_private.customers(email,normalized_email,name,phone,shipping_address) values(nullif(p_customer->>'email',''),nullif(lower(p_customer->>'email'),''),p_customer->>'name',nullif(p_customer->>'phone',''),p_customer->'shippingAddress') returning * into c;
  ref := 'IDS-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
  insert into checkout_private.orders(customer_id,public_reference,order_status,payment_status,fulfillment_status,currency,subtotal_cents,discount_cents,fee_cents,shipping_cents,tax_cents,total_cents,payment_method_choice,customer_name,customer_email,customer_phone,shipping_address,pricing_snapshot,catalog_priced_at)
  values(c.id,ref,'checkout_pending','unpaid','not_ready','usd',(p_snapshot->>'subtotalCents')::bigint,0,0,0,0,(p_snapshot->>'totalCents')::bigint,'card',p_customer->>'name',nullif(p_customer->>'email',''),nullif(p_customer->>'phone',''),p_customer->'shippingAddress',p_snapshot,(p_snapshot->>'pricedAt')::timestamptz) returning * into o;
  for item in select * from jsonb_array_elements((p_snapshot->'chargeableItems')||(p_snapshot->'includedPackageComponents')) loop
    insert into checkout_private.order_items(order_id,item_type,product_id,variant_id,option_id,package_id,sku,name_snapshot,description_snapshot,quantity,unit_amount_cents,extended_amount_cents,included_in_package_price,metadata_snapshot)
    values(o.id,item->>'itemType',case when item->>'itemType'='product' then (item->>'sourceId')::uuid end,case when item->>'itemType'='variant' then (item->>'sourceId')::uuid end,case when item->>'itemType' in ('option','package_component') then (item->>'sourceId')::uuid end,case when item->>'itemType'='package' then (item->>'sourceId')::uuid end,nullif(item->>'sku',''),item->>'name',nullif(item->>'description',''),(item->>'quantity')::int,(item->>'unitAmountCents')::bigint,(item->>'extendedAmountCents')::bigint,(item->>'includedInPackagePrice')::boolean,'{}');
  end loop;
  insert into checkout_private.payment_attempts(order_id,attempt_number,payment_method,idempotency_key,request_fingerprint,expected_amount_cents,expected_currency) values(o.id,1,'card',p_idempotency_key,p_request_fingerprint,o.total_cents,'usd') returning * into a;
  return jsonb_build_object('customerId',c.id,'orderId',o.id,'publicReference',ref,'attemptId',a.id,'attemptNumber',1,'attemptStatus',a.attempt_status,'attemptCreatedAt',a.created_at,'stripeIdempotencyKey',a.idempotency_key,'sessionId',null);
end $$;

create or replace function public.checkout_link_card_session(p_attempt_id uuid,p_session_id text,p_payment_intent_id text,p_session_status text,p_payment_status text,p_created_at timestamptz,p_expires_at timestamptz)
returns void language plpgsql security invoker set search_path=pg_catalog,public,checkout_private as $$ begin
 if p_session_id is null or btrim(p_session_id) = '' or p_created_at is null then raise exception 'invalid checkout session linkage'; end if;
 update checkout_private.payment_attempts set stripe_checkout_session_id=p_session_id,stripe_payment_intent_id=coalesce(p_payment_intent_id,stripe_payment_intent_id),stripe_session_status=p_session_status,stripe_payment_status=p_payment_status,checkout_url_created_at=p_created_at,expires_at=p_expires_at,attempt_status=case when attempt_status='creating' then 'open' else attempt_status end,updated_at=now()
 where id=p_attempt_id and (stripe_checkout_session_id is null or stripe_checkout_session_id=p_session_id) and (p_payment_intent_id is null or stripe_payment_intent_id is null or stripe_payment_intent_id=p_payment_intent_id);
 if not found then raise exception using errcode='23505',message='checkout_session_link_conflict'; end if;
end $$;

create or replace function public.checkout_record_webhook(p_event_id text,p_event_type text,p_object_id text,p_livemode boolean,p_api_version text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public,checkout_private as $$ declare s text; begin
 if p_event_id is null or btrim(p_event_id)='' or p_event_type is null or btrim(p_event_type)='' then raise exception 'invalid webhook receipt'; end if;
 insert into checkout_private.stripe_webhook_events(stripe_event_id,event_type,stripe_object_id,livemode,api_version,processing_status,attempt_count) values(p_event_id,p_event_type,p_object_id,p_livemode,p_api_version,'processing',1) on conflict do nothing;
 if found then return jsonb_build_object('state','new'); end if;
 update checkout_private.stripe_webhook_events set processing_status='processing',attempt_count=attempt_count+1,last_error_code=null where stripe_event_id=p_event_id and processing_status='failed' returning processing_status into s;
 if found then return jsonb_build_object('state','new'); end if;
 select processing_status into s from checkout_private.stripe_webhook_events where stripe_event_id=p_event_id;
 return jsonb_build_object('state',s);
end $$;

create or replace function public.checkout_finish_webhook(p_event_id text,p_status text,p_error_code text default null)
returns void language plpgsql security invoker set search_path=pg_catalog,public,checkout_private as $$ begin
 if p_status not in ('processed','failed','ignored') then raise exception 'invalid webhook state'; end if;
 update checkout_private.stripe_webhook_events set processing_status=p_status,processed_at=case when p_status in ('processed','ignored') then now() else processed_at end,last_error_at=case when p_status='failed' then now() else last_error_at end,last_error_code=p_error_code where stripe_event_id=p_event_id and ((p_status='failed' and processing_status='processing') or (p_status in ('processed','ignored') and processing_status in ('processing','failed')));
 if not found then raise exception 'unknown webhook event'; end if;
end $$;

create or replace function public.checkout_find_attempt(p_session_id text default null,p_payment_intent_id text default null)
returns jsonb language sql security invoker set search_path=pg_catalog,public,checkout_private as $$
 select jsonb_build_object('attemptId',a.id,'orderId',o.id,'customerId',o.customer_id,'publicReference',o.public_reference,'attemptStatus',a.attempt_status,'paymentStatus',o.payment_status,'orderStatus',o.order_status,'fulfillmentStatus',o.fulfillment_status,'currency',o.currency,'totalCents',o.total_cents,'refundedCents',o.refunded_cents,'snapshot',o.pricing_snapshot,'sessionId',a.stripe_checkout_session_id,'paymentIntentId',a.stripe_payment_intent_id)
 from checkout_private.payment_attempts a join checkout_private.orders o on o.id=a.order_id
 where (p_session_id is not null and a.stripe_checkout_session_id=p_session_id) or (p_payment_intent_id is not null and a.stripe_payment_intent_id=p_payment_intent_id) limit 1
$$;

create or replace function public.checkout_apply_card_event(p_kind text,p_session_id text,p_payment_intent_id text,p_order_id uuid,p_attempt_id uuid,p_amount bigint,p_currency text,p_refunded bigint default null,p_stripe_customer_id text default null,p_contact jsonb default null)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public,checkout_private as $$ declare a checkout_private.payment_attempts; o checkout_private.orders; begin
 if p_kind not in ('paid','processing','expired','refund','dispute') then raise exception 'unsupported checkout event'; end if;
 select * into a from checkout_private.payment_attempts where id=p_attempt_id and order_id=p_order_id and (stripe_checkout_session_id=p_session_id or (p_kind in ('refund','dispute') and stripe_payment_intent_id=p_payment_intent_id)) for update;
 if not found then raise exception 'checkout_relationship_mismatch'; end if;
 select * into o from checkout_private.orders where id=p_order_id for update;
 if (p_kind='dispute' and (p_amount < 1 or p_amount > a.expected_amount_cents)) or (p_kind<>'dispute' and a.expected_amount_cents<>p_amount) or a.expected_currency<>lower(p_currency) then raise exception 'checkout_reconciliation_mismatch'; end if;
 if p_payment_intent_id is not null and a.stripe_payment_intent_id is not null and a.stripe_payment_intent_id<>p_payment_intent_id then raise exception 'checkout_payment_intent_conflict'; end if;
 if p_kind='paid' and a.attempt_status in ('expired','failed') then raise exception 'invalid attempt transition'; end if;
 if p_kind='processing' and a.attempt_status in ('succeeded','expired','failed') then raise exception 'invalid attempt transition'; end if;
 if p_kind='refund' and (p_refunded is null or p_refunded < 1 or p_refunded > o.total_cents) then raise exception 'invalid refund amount'; end if;
 update checkout_private.payment_attempts set stripe_payment_intent_id=coalesce(stripe_payment_intent_id,p_payment_intent_id),attempt_status=case when p_kind='paid' then 'succeeded' when p_kind='processing' then 'processing' when p_kind='expired' and attempt_status not in ('succeeded','expired') then 'expired' else attempt_status end,completed_at=case when p_kind='paid' then coalesce(completed_at,now()) else completed_at end,updated_at=now() where id=a.id;
 if p_stripe_customer_id is not null then update checkout_private.customers set stripe_customer_id=p_stripe_customer_id,stripe_customer_created_at=coalesce(stripe_customer_created_at,now()),email=coalesce(p_contact->>'email',email),normalized_email=coalesce(lower(p_contact->>'email'),normalized_email),name=coalesce(p_contact->>'name',name),phone=coalesce(p_contact->>'phone',phone),billing_address=coalesce(p_contact->'billingAddress',billing_address),shipping_address=coalesce(p_contact->'shippingAddress',shipping_address),updated_at=now() where id=o.customer_id and (stripe_customer_id is null or stripe_customer_id=p_stripe_customer_id); if not found then raise exception 'checkout_customer_conflict'; end if; end if;
 if p_kind='paid' then update checkout_private.orders set order_status='confirmed',payment_status='paid',fulfillment_status=case when fulfillment_status='not_ready' then 'pending' else fulfillment_status end,paid_at=coalesce(paid_at,now()),updated_at=now() where id=o.id and payment_status in ('unpaid','processing','failed','paid');
 elsif p_kind='processing' then update checkout_private.orders set order_status=case when order_status='draft' then 'checkout_pending' else order_status end,payment_status=case when payment_status in ('unpaid','failed') then 'processing' else payment_status end,updated_at=now() where id=o.id;
 elsif p_kind='refund' then update checkout_private.orders set refunded_cents=greatest(refunded_cents,p_refunded),payment_status=case when greatest(refunded_cents,p_refunded)=total_cents then 'refunded' else 'partially_refunded' end,updated_at=now() where id=o.id and payment_status in ('paid','partially_refunded','refunded','disputed');
 elsif p_kind='dispute' then update checkout_private.orders set payment_status='disputed',updated_at=now() where id=o.id and payment_status in ('paid','partially_refunded','refunded','disputed'); end if;
 if p_kind in ('paid','processing','refund','dispute') and not found then raise exception 'invalid order transition'; end if;
 return jsonb_build_object('publicReference',o.public_reference);
end $$;

revoke all on function public.checkout_create_card_draft(text,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.checkout_link_card_session(uuid,text,text,text,text,timestamptz,timestamptz) from public,anon,authenticated;
revoke all on function public.checkout_record_webhook(text,text,text,boolean,text) from public,anon,authenticated;
revoke all on function public.checkout_finish_webhook(text,text,text) from public,anon,authenticated;
revoke all on function public.checkout_find_attempt(text,text) from public,anon,authenticated;
revoke all on function public.checkout_apply_card_event(text,text,text,uuid,uuid,bigint,text,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.checkout_create_card_draft(text,text,jsonb,jsonb),public.checkout_link_card_session(uuid,text,text,text,text,timestamptz,timestamptz),public.checkout_record_webhook(text,text,text,boolean,text),public.checkout_finish_webhook(text,text,text),public.checkout_find_attempt(text,text),public.checkout_apply_card_event(text,text,text,uuid,uuid,bigint,text,bigint,text,jsonb) to service_role;
commit;
-- Verification: select routine_name,security_type from information_schema.routines where routine_name like 'checkout_%';
-- Rollback after separate approval: drop function public.checkout_apply_card_event(text,text,text,uuid,uuid,bigint,text,bigint,text,jsonb), public.checkout_find_attempt(text,text), public.checkout_finish_webhook(text,text,text), public.checkout_record_webhook(text,text,text,boolean,text), public.checkout_link_card_session(uuid,text,text,text,text,timestamptz,timestamptz), public.checkout_create_card_draft(text,text,jsonb,jsonb);
