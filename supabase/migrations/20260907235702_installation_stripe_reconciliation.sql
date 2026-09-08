begin;
alter table public.installation_payments
  add column currency text not null default 'usd' check(currency='usd'),
  add column livemode boolean not null default false,
  add column processor_state text check(processor_state in ('reserved','open','expired','superseded','paid')),
  add column processor_request jsonb,
  add column processor_operation_payload jsonb,
  add column processor_expires_at timestamptz,
  add column processor_status text,
  add column processor_created_at timestamptz,
  add column processor_observed_at timestamptz,
  add column stripe_charge_id text,
  add column stripe_refund_id text unique,
  add column refund_balance_transaction_id text,
  add column refund_failure_balance_transaction_id text,
  add column last_processor_event_created bigint;
create unique index installation_one_active_checkout on public.installation_payments(installation_id)
  where method='stripe' and purpose<>'refund' and status='pending' and processor_state in ('reserved','open');
create unique index installation_original_stripe_charge on public.installation_payments(stripe_charge_id) where purpose<>'refund';
create table public.installation_processor_events (
  event_id text primary key, installation_id uuid not null references public.installations(id), payment_id uuid not null references public.installation_payments(id),
  event_type text not null, object_id text not null, event_created bigint, payload_hash text not null check(payload_hash~'^[0-9a-f]{64}$'),
  received_at timestamptz not null, processed_at timestamptz not null default clock_timestamp(), evidence jsonb not null
);
alter table public.installation_processor_events enable row level security;
revoke all on public.installation_processor_events from public,anon,authenticated,service_role;
grant select,insert on public.installation_processor_events to service_role;

create function public.ids_reserve_installation_checkout(p_id uuid,p_payment_id uuid,p_purpose text,p_amount integer,p_request jsonb,p_expected_ledger jsonb,p_balance jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare i public.installations%rowtype; p public.installation_payments%rowtype; v_amount numeric;
begin
  select * into strict i from public.installations where id=p_id for update;
  if i.pricing_snapshot is null or i.status not in ('approved','deposit_due','scheduled','balance_due','ready') then raise exception 'installation_not_payable'; end if;
  if p_purpose is null or p_purpose not in ('deposit','balance') or p_amount is null or p_amount<=0 or p_payment_id is null then raise exception 'invalid_checkout'; end if;
  if p_expected_ledger is distinct from public.ids_installation_ledger(p_id) then raise exception 'installation_ledger_changed'; end if;
  perform public.ids_validate_cash_balance(p_balance);
  v_amount:=(p_balance->>'balanceDueCents')::numeric;
  if p_purpose='deposit' then v_amount:=least(v_amount,greatest(0,i.deposit_due_cents-(p_balance->>'netPaidCents')::numeric)); end if;
  if v_amount is distinct from p_amount::numeric then raise exception 'checkout_amount_changed'; end if;
  if p_purpose='balance' and i.cash_status='approved' then raise exception 'cash_approved'; end if;
  select * into p from public.installation_payments where installation_id=p_id and method='stripe' and purpose<>'refund' and status='pending' and processor_state in ('reserved','open');
  if found then return to_jsonb(p); end if;
  if jsonb_typeof(p_request) is distinct from 'object' or p_request->'metadata'->>'payment_id' is distinct from p_payment_id::text
    or p_request->'metadata'->>'installation_id' is distinct from p_id::text or p_request->'metadata'->>'purpose' is distinct from p_purpose
    or p_request->'metadata'->>'ids_kind' is distinct from 'professional_installation'
    or p_request->'line_items'->0->'price_data'->>'unit_amount' is distinct from p_amount::text then raise exception 'invalid_checkout_request'; end if;
  insert into public.installation_payments(id,installation_id,purpose,method,status,amount_cents,idempotency_key,processor_state,processor_request,currency,livemode)
    values(p_payment_id,p_id,p_purpose,'stripe','pending',p_amount,'ids-installation-checkout:'||p_payment_id::text,'reserved',p_request,'usd',false) returning * into p;
  insert into public.installation_audit_events(installation_id,event_type,actor,details) values(p_id,'checkout_reserved','customer',jsonb_build_object('paymentId',p.id,'amountCents',p_amount,'purpose',p_purpose));
  return to_jsonb(p);
end; $$;
create function public.ids_attach_installation_checkout(p_id uuid,p_payment_id uuid,p_session_id text,p_expires timestamptz) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare p public.installation_payments%rowtype;
begin
  perform 1 from public.installations where id=p_id for update;
  select * into strict p from public.installation_payments where id=p_payment_id and installation_id=p_id for update;
  if p.method<>'stripe' or p.purpose='refund' or p.processor_request is null or p_session_id is null or p_session_id not like 'cs_test_%' or p_expires is null then raise exception 'invalid_checkout_link'; end if;
  if p.stripe_session_id is not null and p.stripe_session_id<>p_session_id then raise exception 'checkout_link_conflict'; end if;
  update public.installation_payments set stripe_session_id=p_session_id,processor_expires_at=p_expires,
    processor_state=case when processor_state='reserved' then 'open' else processor_state end,updated_at=clock_timestamp() where id=p_payment_id returning * into p;
  return to_jsonb(p);
end; $$;

create function public.ids_reserve_installation_refund(p_id uuid,p_refund_id uuid,p_original_id uuid,p_key uuid,p_payload jsonb,p_request jsonb,
  p_expected_ledger jsonb,p_balance_before jsonb,p_balance_after jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare p public.installation_payments%rowtype; r public.installation_payments%rowtype; v_amount integer:=(p_payload->>'amountCents')::integer; v_pending bigint; v_field text;
begin
  perform pg_advisory_xact_lock(hashtextextended('ids-stripe-refund:'||p_key::text,0));
  select * into r from public.installation_payments where idempotency_key='ids-installation-refund:'||p_key::text;
  if found then
    if r.installation_id<>p_id or r.original_payment_id<>p_original_id or r.processor_operation_payload is distinct from p_payload then raise exception 'refund_operation_conflict'; end if;
    return to_jsonb(r);
  end if;
  perform 1 from public.installations where id=p_id for update;
  select * into strict p from public.installation_payments where id=p_original_id and installation_id=p_id for update;
  if p.method<>'stripe' or p.purpose='refund' or p.status not in ('paid','partially_refunded') or p.paid_at is null or p.stripe_payment_intent_id is null or p.livemode then raise exception 'invalid_refund_original'; end if;
  if p_key is null or p_refund_id is null or v_amount is null or v_amount<=0 or p_payload->>'actor' is distinct from 'IDS shared administrator'
    or char_length(btrim(p_payload->>'reason')) not between 1 and 2000 or p_payload->>'reason' is null then raise exception 'invalid_refund_request'; end if;
  if p_expected_ledger is distinct from public.ids_installation_ledger(p_id) then raise exception 'installation_ledger_changed'; end if;
  select coalesce(sum(amount_cents),0) into v_pending from public.installation_payments where original_payment_id=p_original_id and purpose='refund' and status='pending';
  if v_amount>p.amount_cents::bigint-p.refunded_cents-v_pending then raise exception 'refund_exceeds_eligible_amount'; end if;
  perform public.ids_validate_cash_balance(p_balance_before);perform public.ids_validate_cash_balance(p_balance_after);
  foreach v_field in array array['approvedChargesCents','adjustmentCents','receivedCents','completedRefundsCents','receiptCorrectionsCents','netPaidCents','balanceCents'] loop
    if p_balance_before->v_field is distinct from p_balance_after->v_field then raise exception 'invalid_refund_balance'; end if;
  end loop;
  if (p_balance_after->>'pendingRefundsCents')::numeric<>(p_balance_before->>'pendingRefundsCents')::numeric+v_amount then raise exception 'invalid_refund_balance'; end if;
  if p_request->>'payment_intent' is distinct from p.stripe_payment_intent_id or p_request->>'amount' is distinct from v_amount::text
    or p_request->'metadata'->>'refund_operation_key' is distinct from p_key::text then raise exception 'invalid_refund_request'; end if;
  insert into public.installation_payments(id,installation_id,original_payment_id,purpose,method,status,amount_cents,idempotency_key,processor_request,processor_operation_payload,recorded_by,notes,receipt_reference,processor_status)
    values(p_refund_id,p_id,p_original_id,'refund','stripe','pending',v_amount,'ids-installation-refund:'||p_key::text,p_request,p_payload,'IDS shared administrator',p_payload->>'reason',p_payload->>'reference','requested') returning * into r;
  insert into public.installation_audit_events(installation_id,event_type,actor,details) values(p_id,'stripe_refund_requested','IDS shared administrator',p_payload||jsonb_build_object('refundId',r.id,'balanceAfter',p_balance_after));
  return to_jsonb(r);
end; $$;

create function public.ids_reconcile_installation_stripe(p_id uuid,p_payment_id uuid,p_expected_ledger jsonb,p_balance_before jsonb,p_balance_after jsonb,p_evidence jsonb,p_refunds jsonb,p_event jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare i public.installations%rowtype; p public.installation_payments%rowtype; e public.installation_processor_events%rowtype;
  v_refund jsonb; r public.installation_payments%rowtype; v_field text; v_received_delta bigint; v_pending_before bigint; v_pending_after bigint;
  v_refunded integer:=(p_evidence->>'refundedCents')::integer; v_paid boolean:=(p_evidence->>'paid')::boolean; v_now timestamptz:=clock_timestamp();
begin
  perform pg_advisory_xact_lock(7242026);
  perform pg_advisory_xact_lock(hashtextextended('ids-processor:'||(p_event->>'id'),0));
  select * into e from public.installation_processor_events where event_id=p_event->>'id';
  if found then
    if e.payment_id<>p_payment_id or e.installation_id<>p_id or e.payload_hash is distinct from p_event->>'hash' then raise exception 'processor_event_conflict'; end if;
    return jsonb_build_object('ok',true,'replayed',true);
  end if;
  select * into strict i from public.installations where id=p_id for update;
  select * into strict p from public.installation_payments where id=p_payment_id and installation_id=p_id for update;
  if p_expected_ledger is distinct from public.ids_installation_ledger(p_id) then raise exception 'installation_ledger_changed'; end if;
  if p.method<>'stripe' or p.purpose='refund' or p.livemode or p_evidence->'livemode' is distinct from 'false'::jsonb or p_evidence->>'currency' is distinct from p.currency
    or p_evidence->>'amountCents' is distinct from p.amount_cents::text or p_evidence->>'purpose' is distinct from p.purpose
    or p_evidence->>'installationId' is distinct from p_id::text or p_evidence->>'paymentId' is distinct from p_payment_id::text
    or (p.stripe_session_id is not null and p.stripe_session_id is distinct from p_evidence->>'sessionId')
    or (p.stripe_payment_intent_id is not null and p.stripe_payment_intent_id is distinct from p_evidence->>'intentId')
    or (p.stripe_charge_id is not null and p.stripe_charge_id is distinct from p_evidence->>'chargeId') then raise exception 'processor_payment_mismatch'; end if;
  if jsonb_typeof(p_evidence->'paid') is distinct from 'boolean' or jsonb_typeof(p_evidence->'refundedCents') is distinct from 'number'
    or p_evidence->>'observedAt' is null or not isfinite((p_evidence->>'observedAt')::timestamptz)
    or p_evidence->>'processorCreatedAt' is null or not isfinite((p_evidence->>'processorCreatedAt')::timestamptz)
    or p_evidence->>'sessionExpiresAt' is null or not isfinite((p_evidence->>'sessionExpiresAt')::timestamptz)
    or p_evidence->>'sessionId' is null or p_evidence->>'sessionId' not like 'cs_test_%'
    or p_evidence->>'sessionState' is null or p_evidence->>'sessionState' not in ('open','complete','expired')
    or p_event->>'receivedAt' is null or not isfinite((p_event->>'receivedAt')::timestamptz)
    or v_paid is null or v_refunded is null or v_refunded<0 or v_refunded>p.amount_cents or jsonb_typeof(p_refunds) is distinct from 'array'
    or (v_paid and (p_evidence->>'paymentOccurredAt' is null or not isfinite((p_evidence->>'paymentOccurredAt')::timestamptz) or p_evidence->>'sessionState'<>'complete' or p_evidence->>'chargeId' is null or p_evidence->>'intentId' is null)) then raise exception 'invalid_processor_evidence'; end if;
  if (p_evidence->>'observedAt')::timestamptz<p.processor_observed_at then raise exception 'processor_observation_stale'; end if;
  if not v_paid and p.paid_at is not null then raise exception 'processor_payment_regression'; end if;
  perform public.ids_validate_cash_balance(p_balance_before);perform public.ids_validate_cash_balance(p_balance_after);
  foreach v_field in array array['approvedChargesCents','adjustmentCents','receiptCorrectionsCents'] loop
    if p_balance_before->v_field is distinct from p_balance_after->v_field then raise exception 'invalid_processor_balance'; end if;
  end loop;
  v_received_delta:=case when v_paid and p.paid_at is null then p.amount_cents else 0 end;
  if (p_balance_after->>'receivedCents')::numeric<>(p_balance_before->>'receivedCents')::numeric+v_received_delta
    or (p_balance_after->>'completedRefundsCents')::numeric<>(p_balance_before->>'completedRefundsCents')::numeric+v_refunded-p.refunded_cents then raise exception 'invalid_processor_balance'; end if;
  select coalesce(sum(amount_cents),0) into v_pending_before from public.installation_payments where installation_id=p_id and purpose='refund' and status='pending';
  for v_refund in select value from jsonb_array_elements(p_refunds) loop
    select * into r from public.installation_payments where id=(v_refund->>'id')::uuid for update;
    if found and (r.installation_id<>p_id or r.original_payment_id<>p_payment_id or r.purpose<>'refund' or r.method<>'stripe'
      or r.amount_cents is distinct from (v_refund->>'amount_cents')::integer
      or (r.stripe_refund_id is not null and r.stripe_refund_id is distinct from v_refund->>'stripe_refund_id')) then raise exception 'processor_refund_mismatch'; end if;
    if r.id is not null and r.status in ('paid','failed','cancelled') and v_refund->>'status'='pending' then raise exception 'processor_refund_regression'; end if;
    if r.id is not null and r.status='paid' and v_refund->>'status'<>'paid'
      and (v_refund->>'status'<>'failed' or v_refund->>'refund_failure_balance_transaction_id' is null or p_event->>'created' is null or (p_event->>'created')::bigint<=coalesce(r.last_processor_event_created,0)) then raise exception 'processor_refund_regression'; end if;
    if r.id is not null and r.status in ('failed','cancelled') and v_refund->>'status'<>r.status then raise exception 'processor_refund_terminal_conflict'; end if;
    insert into public.installation_payments(id,installation_id,original_payment_id,purpose,method,status,amount_cents,idempotency_key,stripe_refund_id,stripe_charge_id,
      processor_status,processor_created_at,paid_at,processor_observed_at,refund_balance_transaction_id,refund_failure_balance_transaction_id,last_processor_event_created)
    values((v_refund->>'id')::uuid,p_id,p_payment_id,'refund','stripe',v_refund->>'status',(v_refund->>'amount_cents')::integer,
      'ids-stripe-refund-reference:'||(v_refund->>'stripe_refund_id'),v_refund->>'stripe_refund_id',p_evidence->>'chargeId',v_refund->>'processor_status',
      (v_refund->>'processor_created_at')::timestamptz,(v_refund->>'paid_at')::timestamptz,(p_evidence->>'observedAt')::timestamptz,
      v_refund->>'refund_balance_transaction_id',v_refund->>'refund_failure_balance_transaction_id',(p_event->>'created')::bigint)
    on conflict(id) do update set status=excluded.status,stripe_refund_id=excluded.stripe_refund_id,stripe_charge_id=excluded.stripe_charge_id,processor_status=excluded.processor_status,
      processor_created_at=excluded.processor_created_at,paid_at=excluded.paid_at,processor_observed_at=excluded.processor_observed_at,
      refund_balance_transaction_id=excluded.refund_balance_transaction_id,refund_failure_balance_transaction_id=excluded.refund_failure_balance_transaction_id,
      last_processor_event_created=greatest(public.installation_payments.last_processor_event_created,excluded.last_processor_event_created),updated_at=v_now;
  end loop;
  if v_refunded<>(select coalesce(sum(amount_cents),0) from public.installation_payments where original_payment_id=p_payment_id and purpose='refund' and status='paid') then raise exception 'processor_refund_total_mismatch'; end if;
  select coalesce(sum(amount_cents),0) into v_pending_after from public.installation_payments where installation_id=p_id and purpose='refund' and status='pending';
  if (p_balance_after->>'pendingRefundsCents')::numeric<>(p_balance_before->>'pendingRefundsCents')::numeric+v_pending_after-v_pending_before then raise exception 'invalid_processor_balance'; end if;
  update public.installation_payments set stripe_session_id=p_evidence->>'sessionId',stripe_payment_intent_id=p_evidence->>'intentId',stripe_charge_id=p_evidence->>'chargeId',
    status=case when v_paid then case when v_refunded=amount_cents then 'refunded' when v_refunded>0 then 'partially_refunded' else 'paid' end
      when p_evidence->>'sessionState'='expired' then 'cancelled' else 'pending' end,
    processor_state=case when v_paid then 'paid' when p_evidence->>'sessionState'='expired' then 'expired' else 'open' end,
    processor_status=p_evidence->>'processorStatus',refunded_cents=v_refunded,paid_at=(p_evidence->>'paymentOccurredAt')::timestamptz,
    processor_created_at=(p_evidence->>'processorCreatedAt')::timestamptz,processor_expires_at=(p_evidence->>'sessionExpiresAt')::timestamptz,
    processor_observed_at=(p_evidence->>'observedAt')::timestamptz,last_processor_event_created=greatest(last_processor_event_created,(p_event->>'created')::bigint),updated_at=v_now where id=p_payment_id;
  update public.installations set payment_status=case when payment_status='forfeited' then payment_status when (p_balance_after->>'balanceDueCents')::numeric=0 then 'paid'
    when (p_balance_after->>'netPaidCents')::numeric>0 then 'partially_paid' else 'unpaid' end,
    status=case when safety_status='clear' and not special_cash_failure_reschedule and status in ('approved','deposit_due','scheduled','balance_due','ready')
      then case when (p_balance_after->>'balanceDueCents')::numeric=0 then 'ready' when (p_balance_after->>'netPaidCents')::numeric>=deposit_due_cents then 'scheduled' else status end else status end,updated_at=v_now where id=p_id;
  insert into public.installation_processor_events(event_id,installation_id,payment_id,event_type,object_id,event_created,payload_hash,received_at,processed_at,evidence)
    values(p_event->>'id',p_id,p_payment_id,p_event->>'type',p_event->>'objectId',(p_event->>'created')::bigint,p_event->>'hash',(p_event->>'receivedAt')::timestamptz,v_now,p_evidence);
  insert into public.installation_audit_events(installation_id,event_type,actor,details,created_at)
    values(p_id,'stripe_reconciled','Stripe',jsonb_build_object('event',p_event,'paymentId',p_payment_id,'evidence',p_evidence,'refunds',p_refunds,'balanceBefore',p_balance_before,'balanceAfter',p_balance_after),v_now);
  return jsonb_build_object('ok',true,'replayed',false,'balance',p_balance_after);
end; $$;
revoke all on function public.ids_reserve_installation_checkout(uuid,uuid,text,integer,jsonb,jsonb,jsonb),public.ids_attach_installation_checkout(uuid,uuid,text,timestamptz),
 public.ids_reserve_installation_refund(uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb),public.ids_reconcile_installation_stripe(uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ids_reserve_installation_checkout(uuid,uuid,text,integer,jsonb,jsonb,jsonb),public.ids_attach_installation_checkout(uuid,uuid,text,timestamptz),
 public.ids_reserve_installation_refund(uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb),public.ids_reconcile_installation_stripe(uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) to service_role;
commit;
