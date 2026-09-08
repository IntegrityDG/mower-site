-- Installation cash safeguards and append-only actual cash returns.
-- Ordered correction after the unchanged installation base migration.
-- Dependency: unchanged pending 20260904204800_professional_installations.sql.
-- Shared TypeScript accounting is trusted; SQL validates structure/arithmetic and
-- checks ledger freshness under locks. This is not an independent totals engine.
begin;

alter table public.installation_payments
  add column original_payment_id uuid references public.installation_payments(id) on delete restrict,
  add column recorded_by text,
  add column receipt_reference text check (char_length(receipt_reference) <= 200),
  add column cash_operation_payload jsonb,
  add column cash_balance_after jsonb,
  add constraint installation_payments_installation_id_id_key unique (installation_id, id);
create index installation_payments_installation_idx on public.installation_payments(installation_id);
create index installation_adjustments_installation_idx on public.installation_adjustments(installation_id);

create table public.installation_cash_corrections (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid not null references public.installations(id) on delete restrict,
  original_payment_id uuid not null,
  amount_cents integer not null check (amount_cents > 0),
  reason text not null check (char_length(btrim(reason)) between 1 and 2000),
  recorded_by text not null check (recorded_by = 'IDS shared administrator'),
  idempotency_key text not null unique,
  operation_payload jsonb not null check (jsonb_typeof(operation_payload) = 'object'),
  balance_after jsonb not null check (jsonb_typeof(balance_after) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (installation_id, original_payment_id)
    references public.installation_payments(installation_id, id) on delete restrict
);
create index installation_cash_corrections_original_idx
  on public.installation_cash_corrections(installation_id, original_payment_id);
alter table public.installation_cash_corrections enable row level security;

create table public.installation_cash_refunds (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid not null references public.installations(id) on delete restrict,
  original_payment_id uuid not null,
  amount_cents integer not null check (amount_cents > 0),
  returned_at timestamptz not null check (isfinite(returned_at)),
  reference text check (char_length(reference) <= 200),
  reason text not null check (char_length(btrim(reason)) between 1 and 2000),
  recorded_by text not null check (recorded_by = 'IDS shared administrator'),
  idempotency_key text not null unique,
  operation_payload jsonb not null check (jsonb_typeof(operation_payload) = 'object'),
  balance_after jsonb not null check (jsonb_typeof(balance_after) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (installation_id, original_payment_id)
    references public.installation_payments(installation_id, id) on delete restrict
);
create index installation_cash_refunds_original_idx
  on public.installation_cash_refunds(installation_id, original_payment_id);
alter table public.installation_cash_refunds enable row level security;

-- Consistent cash lock order: operation advisory lock, installation, original.
-- Direct child writers also acquire the parent lock.
create function public.ids_lock_installation_ledger() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.installation_id <> old.installation_id then
    raise exception 'installation_ledger_reparent_forbidden';
  end if;
  if tg_op = 'DELETE' then
    perform 1 from public.installations where id = old.installation_id for update;
    return old;
  end if;
  perform 1 from public.installations where id = new.installation_id for update;
  return new;
end;
$$;
create trigger installation_payments_ledger_lock before insert or update or delete
  on public.installation_payments for each row execute function public.ids_lock_installation_ledger();
create trigger installation_adjustments_ledger_lock before insert or update or delete
  on public.installation_adjustments for each row execute function public.ids_lock_installation_ledger();

create function public.ids_protect_cash_receipt() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.installations where id = old.installation_id for update;
  if old.cash_operation_payload is not null or exists (
    select 1 from public.installation_cash_corrections where original_payment_id = old.id
  ) or exists (select 1 from public.installation_cash_refunds where original_payment_id = old.id) then raise exception 'cash_receipt_is_immutable_use_linked_correction'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger installation_cash_receipt_immutable before update or delete
  on public.installation_payments for each row execute function public.ids_protect_cash_receipt();

-- Also enforces eligibility/cap on direct correction inserts. Owners/superusers
-- can change triggers/schema; this is not protection against privileged tampering.
create function public.ids_guard_cash_correction() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare v_original public.installation_payments%rowtype; v_corrected bigint;
begin
  if tg_op <> 'INSERT' then raise exception 'cash_correction_is_immutable'; end if;
  perform 1 from public.installations where id = new.installation_id for update;
  select * into v_original from public.installation_payments
    where id = new.original_payment_id and installation_id = new.installation_id for update;
  if not found or v_original.method <> 'cash' or v_original.purpose = 'refund'
     or v_original.status not in ('paid','partially_refunded','refunded') or v_original.paid_at is null then
    raise exception 'invalid_correction_original';
  end if;
  select coalesce(sum(amount_cents), 0) into v_corrected from public.installation_cash_corrections
    where original_payment_id = new.original_payment_id;
  if v_corrected + new.amount_cents > v_original.amount_cents::bigint - v_original.refunded_cents
    - (select coalesce(sum(amount_cents),0) from public.installation_cash_refunds where original_payment_id = new.original_payment_id) then
    raise exception 'cash_correction_exceeds_eligible_amount';
  end if;
  return new;
end;
$$;
create trigger installation_cash_corrections_guard before insert or update or delete
  on public.installation_cash_corrections for each row execute function public.ids_guard_cash_correction();

create function public.ids_guard_cash_refund() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare v_original public.installation_payments%rowtype; v_corrected bigint;
begin
  if tg_op <> 'INSERT' then raise exception 'cash_refund_is_immutable'; end if;
  perform 1 from public.installations where id = new.installation_id for update;
  select * into v_original from public.installation_payments
    where id = new.original_payment_id and installation_id = new.installation_id for update;
  if not found or v_original.method <> 'cash' or v_original.purpose = 'refund'
     or v_original.status not in ('paid','partially_refunded','refunded') or v_original.paid_at is null then
    raise exception 'invalid_cash_refund_original';
  end if;
  select coalesce(sum(amount_cents), 0) into v_corrected from public.installation_cash_refunds
    where original_payment_id = new.original_payment_id;
  if v_corrected + new.amount_cents > v_original.amount_cents::bigint - v_original.refunded_cents
    - (select coalesce(sum(amount_cents),0) from public.installation_cash_corrections where original_payment_id = new.original_payment_id) then
    raise exception 'cash_refund_exceeds_eligible_amount';
  end if;
  return new;
end;
$$;
create trigger installation_cash_refunds_guard before insert or update or delete
  on public.installation_cash_refunds for each row execute function public.ids_guard_cash_refund();

-- All money fields are required, numeric, integral, finite JSON numbers, and
-- bounded to JavaScript safe integer cents. Only adjustment/balance may be signed.
create function public.ids_validate_cash_balance(p_balance jsonb) returns void
language plpgsql immutable security invoker set search_path = '' as $$
declare v_key text; v_value numeric; v_state text;
begin
  if jsonb_typeof(p_balance) is distinct from 'object' then raise exception 'invalid_cash_balance_result'; end if;
  foreach v_key in array array['approvedChargesCents','adjustmentCents','receivedCents',
    'completedRefundsCents','pendingRefundsCents','receiptCorrectionsCents','netPaidCents',
    'balanceCents','balanceDueCents','customerCreditCents'] loop
    if jsonb_typeof(p_balance->v_key) is distinct from 'number' then raise exception 'invalid_cash_balance_result'; end if;
    v_value := (p_balance->>v_key)::numeric;
    if v_value <> trunc(v_value) or abs(v_value) > 9007199254740991
       or (v_key not in ('adjustmentCents','balanceCents') and v_value < 0) then
      raise exception 'invalid_cash_balance_result';
    end if;
  end loop;
  if (p_balance->>'netPaidCents')::numeric <>
       (p_balance->>'receivedCents')::numeric - (p_balance->>'completedRefundsCents')::numeric - (p_balance->>'receiptCorrectionsCents')::numeric
     or (p_balance->>'balanceCents')::numeric <> (p_balance->>'approvedChargesCents')::numeric - (p_balance->>'netPaidCents')::numeric
     or (p_balance->>'balanceDueCents')::numeric <> greatest(0, (p_balance->>'balanceCents')::numeric)
     or (p_balance->>'customerCreditCents')::numeric <> greatest(0, -(p_balance->>'balanceCents')::numeric) then
    raise exception 'invalid_cash_balance_result';
  end if;
  v_state := case when (p_balance->>'balanceCents')::numeric < 0 then 'customer_credit'
    when (p_balance->>'balanceCents')::numeric = 0 then 'paid'
    when (p_balance->>'netPaidCents')::numeric > 0 then 'partially_paid' else 'unpaid' end;
  if p_balance->>'paymentState' is distinct from v_state then raise exception 'invalid_cash_balance_result'; end if;
end;
$$;

create function public.ids_validate_cash_delta(p_before jsonb, p_after jsonb, p_amount integer, p_kind text, p_status text) returns void
language plpgsql immutable security invoker set search_path = '' as $$
declare v_key text;
begin
  perform public.ids_validate_cash_balance(p_before);
  perform public.ids_validate_cash_balance(p_after);
  if p_amount is null or p_amount <= 0 or p_kind is null or p_kind not in ('receipt','correction','refund') then raise exception 'invalid_cash_balance_result'; end if;
  foreach v_key in array array['approvedChargesCents','adjustmentCents','pendingRefundsCents'] loop
    if p_before->v_key is distinct from p_after->v_key then raise exception 'invalid_cash_balance_result'; end if;
  end loop;
  if (p_after->>'receivedCents')::numeric <> (p_before->>'receivedCents')::numeric + (case when p_kind = 'receipt' then p_amount else 0 end)
     or (p_after->>'receiptCorrectionsCents')::numeric <> (p_before->>'receiptCorrectionsCents')::numeric + (case when p_kind = 'correction' then p_amount else 0 end)
     or (p_after->>'completedRefundsCents')::numeric <> (p_before->>'completedRefundsCents')::numeric + (case when p_kind = 'refund' then p_amount else 0 end)
     or p_status is distinct from (case when (p_after->>'balanceDueCents')::numeric = 0 then 'paid'
       when (p_after->>'netPaidCents')::numeric > 0 then 'partially_paid' else 'unpaid' end) then
    raise exception 'invalid_cash_balance_result';
  end if;
end;
$$;

-- Caller must hold the installation lock before using this snapshot for a write.
create function public.ids_installation_ledger(p_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'pricing', jsonb_build_object('laborCents', i.pricing_snapshot->'laborCents',
      'materialsAllowanceCents', i.pricing_snapshot->'materialsAllowanceCents'),
    'adjustments', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'amount_cents', a.amount_cents) order by a.id)
      from public.installation_adjustments a where a.installation_id = i.id), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'purpose', p.purpose, 'method', p.method,
      'status', p.status, 'amount_cents', p.amount_cents, 'refunded_cents', p.refunded_cents,
      'confirmed', p.paid_at is not null, 'original_payment_id', p.original_payment_id) order by p.id)
      from public.installation_payments p where p.installation_id = i.id), '[]'::jsonb),
    'corrections', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'original_payment_id', c.original_payment_id,
      'amount_cents', c.amount_cents) order by c.id) from public.installation_cash_corrections c
      where c.installation_id = i.id), '[]'::jsonb),
    'cashRefunds', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'original_payment_id', r.original_payment_id,
      'amount_cents', r.amount_cents) order by r.id) from public.installation_cash_refunds r
      where r.installation_id = i.id), '[]'::jsonb)
  ) from public.installations i where i.id = p_id;
$$;

-- Read-only lookup: matching receipt recognition never requires today's ledger.
-- A key belonging to another installation reveals no receipt details.
create function public.ids_confirm_installation_cash(p_installation_id uuid, p_operation_key uuid, p_kind text, p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v_payment public.installation_payments%rowtype; v_correction public.installation_cash_corrections%rowtype; v_refund public.installation_cash_refunds%rowtype;
begin
  if p_installation_id is null or p_operation_key is null or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'invalid_cash_receipt'; end if;
  if p_kind = 'receipt' then
    select * into v_payment from public.installation_payments where idempotency_key = 'cash:' || p_operation_key::text;
    if not found then return null; end if;
    if v_payment.installation_id is distinct from p_installation_id or v_payment.cash_operation_payload is distinct from p_payload then raise exception 'cash_operation_conflict'; end if;
    return jsonb_build_object('paymentId', v_payment.id, 'recordedAt', v_payment.created_at,
      'replayed', true, 'balanceAtRecording', v_payment.cash_balance_after);
  elsif p_kind = 'correction' then
    select * into v_correction from public.installation_cash_corrections where idempotency_key = 'cash-correction:' || p_operation_key::text;
    if not found then return null; end if;
    if v_correction.installation_id is distinct from p_installation_id or v_correction.operation_payload is distinct from p_payload then raise exception 'cash_operation_conflict'; end if;
    return jsonb_build_object('paymentId', v_correction.original_payment_id, 'correctionId', v_correction.id,
      'recordedAt', v_correction.created_at, 'replayed', true, 'balanceAtRecording', v_correction.balance_after);
  elsif p_kind = 'refund' then
    select * into v_refund from public.installation_cash_refunds where idempotency_key = 'cash-refund:' || p_operation_key::text;
    if not found then return null; end if;
    if v_refund.installation_id is distinct from p_installation_id or v_refund.operation_payload is distinct from p_payload then raise exception 'cash_operation_conflict'; end if;
    return jsonb_build_object('paymentId', v_refund.original_payment_id, 'refundId', v_refund.id,
      'recordedAt', v_refund.created_at, 'replayed', true, 'balanceAtRecording', v_refund.balance_after);
  end if;
  raise exception 'invalid_cash_entry_kind';
end;
$$;

create function public.ids_record_installation_cash(
  p_installation_id uuid, p_operation_key uuid, p_amount_cents integer,
  p_received_at timestamptz, p_reference text, p_notes text,
  p_confirm_overpayment boolean, p_actor text, p_expected_ledger jsonb,
  p_balance_before jsonb, p_balance_after jsonb, p_payment_status text
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v_installation public.installations%rowtype; v_key text; v_payload jsonb;
  v_existing jsonb; v_payment_id uuid; v_recorded_at timestamptz;
begin
  if p_installation_id is null or p_operation_key is null or p_amount_cents is null or p_amount_cents <= 0
     or p_received_at is null or not pg_catalog.isfinite(p_received_at)
     or p_received_at <> date_trunc('milliseconds', p_received_at)
     or p_received_at > clock_timestamp() + interval '1 minute'
     or p_confirm_overpayment is null or p_actor is distinct from 'IDS shared administrator'
     or char_length(p_reference) > 200 or char_length(p_notes) > 2000 then raise exception 'invalid_cash_receipt'; end if;
  v_key := 'cash:' || p_operation_key::text;
  v_payload := jsonb_build_object('installationId', p_installation_id, 'operationKey', p_operation_key,
    'amountCents', p_amount_cents, 'receivedAt', to_char(p_received_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'reference', p_reference, 'notes', p_notes, 'confirmOverpayment', p_confirm_overpayment, 'actor', p_actor);
  perform pg_advisory_xact_lock(hashtextextended('ids-cash:' || v_key, 0));
  v_existing := public.ids_confirm_installation_cash(p_installation_id, p_operation_key, 'receipt', v_payload);
  if v_existing is not null then return v_existing; end if;
  select * into strict v_installation from public.installations where id = p_installation_id for update;
  if v_installation.pricing_snapshot is null then raise exception 'missing_approved_pricing'; end if;
  if p_expected_ledger is distinct from public.ids_installation_ledger(p_installation_id) then raise exception 'installation_ledger_changed'; end if;
  perform public.ids_validate_cash_delta(p_balance_before, p_balance_after, p_amount_cents, 'receipt', p_payment_status);
  if p_amount_cents > (p_balance_before->>'balanceDueCents')::numeric and not p_confirm_overpayment then raise exception 'cash_overpayment_confirmation_required'; end if;

  v_recorded_at := clock_timestamp();
  insert into public.installation_payments(installation_id, purpose, method, status,
    amount_cents, refunded_cents, idempotency_key, paid_at, created_at, updated_at,
    recorded_by, receipt_reference, notes, cash_operation_payload, cash_balance_after)
  values(p_installation_id, 'cash', 'cash', 'paid', p_amount_cents, 0, v_key,
    p_received_at, v_recorded_at, v_recorded_at, p_actor, p_reference, p_notes, v_payload, p_balance_after)
  returning id into v_payment_id;
  -- Only financial status/time; never reopen work or alter safety/charges/flags.
  update public.installations set payment_status = case when payment_status = 'forfeited' then payment_status else p_payment_status end,
    updated_at = v_recorded_at where id = p_installation_id;
  if not found then raise exception 'cash_installation_update_missing'; end if;
  insert into public.installation_audit_events(installation_id, event_type, actor, details, created_at)
  values(p_installation_id, 'cash_received', p_actor, v_payload || jsonb_build_object('paymentId', v_payment_id,
    'recordedAt', v_recorded_at, 'balanceBefore', p_balance_before, 'balanceAfter', p_balance_after), v_recorded_at);
  return jsonb_build_object('paymentId', v_payment_id, 'recordedAt', v_recorded_at, 'replayed', false, 'balanceAtRecording', p_balance_after);
end;
$$;

create function public.ids_correct_installation_cash(
  p_installation_id uuid, p_operation_key uuid, p_original_payment_id uuid, p_amount_cents integer,
  p_reason text, p_actor text, p_expected_ledger jsonb,
  p_balance_before jsonb, p_balance_after jsonb, p_payment_status text
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v_installation public.installations%rowtype; v_original public.installation_payments%rowtype;
  v_key text; v_payload jsonb; v_existing jsonb; v_id uuid; v_recorded_at timestamptz; v_corrected bigint;
begin
  if p_installation_id is null or p_operation_key is null or p_original_payment_id is null
     or p_amount_cents is null or p_amount_cents <= 0 or p_reason is null
     or char_length(btrim(p_reason)) not between 1 and 2000
     or p_actor is distinct from 'IDS shared administrator' then raise exception 'invalid_cash_correction'; end if;
  v_key := 'cash-correction:' || p_operation_key::text;
  v_payload := jsonb_build_object('installationId', p_installation_id, 'operationKey', p_operation_key,
    'originalPaymentId', p_original_payment_id, 'amountCents', p_amount_cents, 'reason', btrim(p_reason), 'actor', p_actor);
  perform pg_advisory_xact_lock(hashtextextended('ids-cash:' || v_key, 0));
  v_existing := public.ids_confirm_installation_cash(p_installation_id, p_operation_key, 'correction', v_payload);
  if v_existing is not null then return v_existing; end if;
  select * into strict v_installation from public.installations where id = p_installation_id for update;
  if v_installation.pricing_snapshot is null then raise exception 'missing_approved_pricing'; end if;
  select * into v_original from public.installation_payments
    where id = p_original_payment_id and installation_id = p_installation_id for update;
  if not found or v_original.method <> 'cash' or v_original.purpose = 'refund'
     or v_original.status not in ('paid','partially_refunded','refunded') or v_original.paid_at is null then raise exception 'invalid_correction_original'; end if;
  if p_expected_ledger is distinct from public.ids_installation_ledger(p_installation_id) then raise exception 'installation_ledger_changed'; end if;
  select coalesce(sum(amount_cents), 0) into v_corrected from public.installation_cash_corrections where original_payment_id = p_original_payment_id;
  if p_amount_cents + v_corrected > v_original.amount_cents::bigint - v_original.refunded_cents
    - (select coalesce(sum(amount_cents),0) from public.installation_cash_refunds where original_payment_id = p_original_payment_id) then raise exception 'cash_correction_exceeds_eligible_amount'; end if;
  perform public.ids_validate_cash_delta(p_balance_before, p_balance_after, p_amount_cents, 'correction', p_payment_status);
  v_recorded_at := clock_timestamp();
  insert into public.installation_cash_corrections(installation_id, original_payment_id, amount_cents, reason,
    recorded_by, idempotency_key, operation_payload, balance_after, created_at)
  values(p_installation_id, p_original_payment_id, p_amount_cents, btrim(p_reason), p_actor, v_key, v_payload, p_balance_after, v_recorded_at)
  returning id into v_id;
  update public.installations set payment_status = case when payment_status = 'forfeited' then payment_status else p_payment_status end,
    updated_at = v_recorded_at where id = p_installation_id;
  if not found then raise exception 'cash_installation_update_missing'; end if;
  insert into public.installation_audit_events(installation_id, event_type, actor, details, created_at)
  values(p_installation_id, 'cash_receipt_corrected', p_actor, v_payload || jsonb_build_object('correctionId', v_id,
    'recordedAt', v_recorded_at, 'balanceBefore', p_balance_before, 'balanceAfter', p_balance_after,
    'cashReturned', false), v_recorded_at);
  return jsonb_build_object('paymentId', p_original_payment_id, 'correctionId', v_id, 'recordedAt', v_recorded_at,
    'replayed', false, 'balanceAtRecording', p_balance_after);
end;
$$;

create function public.ids_record_installation_cash_refund(
  p_installation_id uuid, p_operation_key uuid, p_original_payment_id uuid, p_amount_cents integer,
  p_reason text, p_returned_at timestamptz, p_reference text, p_confirm_money_returned boolean, p_actor text, p_expected_ledger jsonb,
  p_balance_before jsonb, p_balance_after jsonb, p_payment_status text
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v_installation public.installations%rowtype; v_original public.installation_payments%rowtype;
  v_key text; v_payload jsonb; v_existing jsonb; v_id uuid; v_recorded_at timestamptz; v_corrected bigint;
begin
  if p_installation_id is null or p_operation_key is null or p_original_payment_id is null
     or p_amount_cents is null or p_amount_cents <= 0 or p_reason is null
     or char_length(btrim(p_reason)) not between 1 and 2000
     or p_returned_at is null or not isfinite(p_returned_at) or p_returned_at <> date_trunc('milliseconds', p_returned_at)
     or p_returned_at > clock_timestamp() + interval '1 minute' or p_confirm_money_returned is distinct from true
     or char_length(p_reference) > 200
     or p_actor is distinct from 'IDS shared administrator' then raise exception 'invalid_cash_refund'; end if;
  v_key := 'cash-refund:' || p_operation_key::text;
  v_payload := jsonb_build_object('installationId', p_installation_id, 'operationKey', p_operation_key,
    'originalPaymentId', p_original_payment_id, 'amountCents', p_amount_cents, 'reason', btrim(p_reason), 'actor', p_actor,
    'returnedAt', to_char(p_returned_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'reference', p_reference, 'confirmMoneyReturned', true);
  perform pg_advisory_xact_lock(hashtextextended('ids-cash:' || v_key, 0));
  v_existing := public.ids_confirm_installation_cash(p_installation_id, p_operation_key, 'refund', v_payload);
  if v_existing is not null then return v_existing; end if;
  select * into strict v_installation from public.installations where id = p_installation_id for update;
  if v_installation.pricing_snapshot is null then raise exception 'missing_approved_pricing'; end if;
  select * into v_original from public.installation_payments
    where id = p_original_payment_id and installation_id = p_installation_id for update;
  if not found or v_original.method <> 'cash' or v_original.purpose = 'refund'
     or v_original.status not in ('paid','partially_refunded','refunded') or v_original.paid_at is null then raise exception 'invalid_cash_refund_original'; end if;
  if p_expected_ledger is distinct from public.ids_installation_ledger(p_installation_id) then raise exception 'installation_ledger_changed'; end if;
  select coalesce(sum(amount_cents), 0) into v_corrected from public.installation_cash_refunds where original_payment_id = p_original_payment_id;
  if p_amount_cents + v_corrected > v_original.amount_cents::bigint - v_original.refunded_cents
    - (select coalesce(sum(amount_cents),0) from public.installation_cash_corrections where original_payment_id = p_original_payment_id) then raise exception 'cash_refund_exceeds_eligible_amount'; end if;
  perform public.ids_validate_cash_delta(p_balance_before, p_balance_after, p_amount_cents, 'refund', p_payment_status);
  v_recorded_at := clock_timestamp();
  insert into public.installation_cash_refunds(installation_id, original_payment_id, amount_cents, reason, returned_at, reference,
    recorded_by, idempotency_key, operation_payload, balance_after, created_at)
  values(p_installation_id, p_original_payment_id, p_amount_cents, btrim(p_reason), p_returned_at, p_reference, p_actor, v_key, v_payload, p_balance_after, v_recorded_at)
  returning id into v_id;
  update public.installations set payment_status = case when payment_status = 'forfeited' then payment_status else p_payment_status end,
    updated_at = v_recorded_at where id = p_installation_id;
  if not found then raise exception 'cash_installation_update_missing'; end if;
  insert into public.installation_audit_events(installation_id, event_type, actor, details, created_at)
  values(p_installation_id, 'cash_returned', p_actor, v_payload || jsonb_build_object('refundId', v_id,
    'recordedAt', v_recorded_at, 'balanceBefore', p_balance_before, 'balanceAfter', p_balance_after,
    'cashReturned', true), v_recorded_at);
  return jsonb_build_object('paymentId', p_original_payment_id, 'refundId', v_id, 'recordedAt', v_recorded_at,
    'replayed', false, 'balanceAtRecording', p_balance_after);
end;
$$;

-- Existing installation table grants are retained, including broader DML from the
-- pending migration. GRANT is additive. This is NOT function-only service access.
grant usage on schema public to service_role;
grant select, insert, update on public.installations, public.installation_payments to service_role;
grant select on public.installation_adjustments to service_role;
grant insert on public.installation_audit_events to service_role;
revoke all on table public.installation_cash_corrections, public.installation_cash_refunds from public, anon, authenticated, service_role;
grant select, insert on table public.installation_cash_corrections, public.installation_cash_refunds to service_role;
-- The pending migration already GRANTs USAGE,SELECT. The correction is REVOKE
-- first, including service_role; inherited privileges must also be verified.
revoke all on sequence public.installation_audit_events_id_seq from public, anon, authenticated, service_role;
grant usage, select on sequence public.installation_audit_events_id_seq to service_role;
revoke all on function public.ids_lock_installation_ledger(), public.ids_protect_cash_receipt(),
  public.ids_guard_cash_correction(), public.ids_guard_cash_refund(), public.ids_validate_cash_balance(jsonb),
  public.ids_validate_cash_delta(jsonb,jsonb,integer,text,text), public.ids_installation_ledger(uuid),
  public.ids_confirm_installation_cash(uuid,uuid,text,jsonb),
  public.ids_record_installation_cash(uuid,uuid,integer,timestamptz,text,text,boolean,text,jsonb,jsonb,jsonb,text),
  public.ids_correct_installation_cash(uuid,uuid,uuid,integer,text,text,jsonb,jsonb,jsonb,text),
  public.ids_record_installation_cash_refund(uuid,uuid,uuid,integer,text,timestamptz,text,boolean,text,jsonb,jsonb,jsonb,text)
  from public, anon, authenticated;
grant execute on function public.ids_lock_installation_ledger(), public.ids_protect_cash_receipt(),
  public.ids_guard_cash_correction(), public.ids_guard_cash_refund(), public.ids_validate_cash_balance(jsonb),
  public.ids_validate_cash_delta(jsonb,jsonb,integer,text,text), public.ids_installation_ledger(uuid),
  public.ids_confirm_installation_cash(uuid,uuid,text,jsonb),
  public.ids_record_installation_cash(uuid,uuid,integer,timestamptz,text,text,boolean,text,jsonb,jsonb,jsonb,text),
  public.ids_correct_installation_cash(uuid,uuid,uuid,integer,text,text,jsonb,jsonb,jsonb,text),
  public.ids_record_installation_cash_refund(uuid,uuid,uuid,integer,text,timestamptz,text,boolean,text,jsonb,jsonb,jsonb,text)
  to service_role;
commit;
