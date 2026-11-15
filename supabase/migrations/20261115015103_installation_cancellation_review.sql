begin;

-- Prospective accepted-terms update only. No existing booking, payment, refund,
-- balance, accepted version, RLS policy or privilege is rewritten.
-- Apply after the released Installation/Setup migrations and before the app
-- release, then verify both schema and app before calling the release complete.
alter table public.installations add column cancellation_review jsonb
  check (cancellation_review is null or jsonb_typeof(cancellation_review)='object');

-- Replacing the same signatures preserves their existing service-role-only
-- EXECUTE ACLs. No new functions, roles or permission grants are introduced.
-- Replay checks deliberately precede the current-version requirement so an
-- older already-saved request can still confirm its original terms safely.
-- Versionless older app/forms still create only the legacy terms they displayed.
-- Explicit current-version forms create only the new version. Unknown versions fail.
create or replace function public.ids_create_installation(p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v public.installations%rowtype; v_key uuid:=(p_payload->>'idempotencyKey')::uuid; v_start timestamptz:=(p_payload->>'startAt')::timestamptz; v_now timestamptz:=clock_timestamp();
begin
  perform pg_advisory_xact_lock(7242026);
  if v_key is null or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'invalid_intake'; end if;
  select * into v from public.installations where idempotency_key=v_key;
  if found then
    if v.request_payload is distinct from p_payload then raise exception 'idempotency_conflict'; end if;
    return jsonb_build_object('id',v.id,'public_token',v.public_token);
  end if;
  if p_payload ? 'termsVersion' and p_payload->>'termsVersion' is distinct from '2026-11-15-cancellation-review' then raise exception 'installation_terms_changed'; end if;
  if p_payload ? 'setupSelected' and jsonb_typeof(p_payload->'setupSelected') is distinct from 'boolean' then raise exception 'invalid_intake'; end if;
  if p_payload->'groundingAcknowledged' is distinct from 'true'::jsonb
    or p_payload->'responsibilitiesAcknowledged' is distinct from 'true'::jsonb
    or p_payload->'termsAcknowledged' is distinct from 'true'::jsonb
    or jsonb_typeof(p_payload->'undergroundRequested') is distinct from 'boolean'
    or jsonb_typeof(p_payload->'cashRequested') is distinct from 'boolean'
    or (p_payload->'undergroundRequested'='true'::jsonb and p_payload->'undergroundAcknowledged' is distinct from 'true'::jsonb) then raise exception 'invalid_intake'; end if;
  insert into public.installations(customer_name,customer_email,customer_phone,property_address,equipment,preferred_location,internet_availability,
    underground_requested,estimated_underground_feet,requested_start_at,requested_end_at,cash_status,
    grounding_acknowledged_at,responsibilities_acknowledged_at,terms_acknowledged_at,underground_acknowledged_at,idempotency_key,request_payload,setup_selected,terms_version)
  values(p_payload->>'name',p_payload->>'email',p_payload->>'phone',p_payload->>'address',p_payload->>'equipment',p_payload->>'preferredLocation',p_payload->>'internetAvailability',
    (p_payload->>'undergroundRequested')::boolean,(p_payload->>'estimatedUndergroundFeet')::numeric,v_start,v_start+interval '4 hours',
    case when (p_payload->>'cashRequested')::boolean then 'requested' else 'not_requested' end,
    v_now,v_now,v_now,case when (p_payload->>'undergroundRequested')::boolean then v_now else null end,v_key,p_payload,coalesce((p_payload->>'setupSelected')::boolean,false),coalesce(p_payload->>'termsVersion','2026-09-08-setup')) returning * into v;
  insert into public.installation_audit_events(installation_id,event_type,actor,details) values(v.id,'customer_request','customer',jsonb_build_object('operationKey',v_key));
  return jsonb_build_object('id',v.id,'public_token',v.public_token);
end; $$;

create or replace function public.ids_create_setup_only(p_payload jsonb,p_reason text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v public.installations%rowtype; v_key uuid:=(p_payload->>'idempotencyKey')::uuid;
  v_start timestamptz:=(p_payload->>'startAt')::timestamptz; v_now timestamptz:=clock_timestamp(); v_payload jsonb;
begin
  perform pg_advisory_xact_lock(7242026);
  if v_key is null or jsonb_typeof(p_payload) is distinct from 'object' or p_reason is null or char_length(btrim(p_reason)) not between 1 and 2000
    or p_payload->'setupSelected' is distinct from 'true'::jsonb or p_payload->'responsibilitiesAcknowledged' is distinct from 'true'::jsonb
    or p_payload->'termsAcknowledged' is distinct from 'true'::jsonb or p_payload->'groundingAcknowledged' is distinct from 'false'::jsonb
    or p_payload->'undergroundRequested' is distinct from 'false'::jsonb or coalesce(p_payload->>'equipment','')='' then raise exception 'invalid_setup_only_request'; end if;
  v_payload:=jsonb_build_object('setupOnly',true,'request',p_payload,'reason',btrim(p_reason));
  select * into v from public.installations where idempotency_key=v_key;
  if found then
    if v.request_payload is distinct from v_payload then raise exception 'idempotency_conflict'; end if;
    return jsonb_build_object('ok',true,'id',v.id,'public_token',v.public_token,'replayed',true);
  end if;
  if p_payload ? 'termsVersion' and p_payload->>'termsVersion' is distinct from '2026-11-15-cancellation-review' then raise exception 'installation_terms_changed'; end if;
  insert into public.installations(customer_name,customer_email,customer_phone,property_address,equipment,internet_availability,
    requested_start_at,requested_end_at,grounding_acknowledged_at,responsibilities_acknowledged_at,terms_acknowledged_at,
    installation_selected,setup_selected,terms_version,idempotency_key,request_payload)
  values(p_payload->>'name',p_payload->>'email',p_payload->>'phone',p_payload->>'address',p_payload->>'equipment',p_payload->>'internetAvailability',
    v_start,v_start+interval '4 hours',null,v_now,v_now,false,true,coalesce(p_payload->>'termsVersion','2026-09-08-setup'),v_key,v_payload) returning * into v;
  insert into public.installation_audit_events(installation_id,event_type,actor,details)
    values(v.id,'setup_only_created','IDS shared administrator',jsonb_build_object('operationKey',v_key,'reason',btrim(p_reason),'installationSelected',false,'setupSelected',true));
  return jsonb_build_object('ok',true,'id',v.id,'public_token',v.public_token,'replayed',false);
end; $$;

create or replace function public.ids_apply_installation_admin(p_id uuid,p_key uuid,p_payload jsonb,p_expected jsonb,p_patch jsonb,
  p_adjustments jsonb,p_sessions jsonb,p_stop_session uuid,p_balance_before jsonb,p_balance_after jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v public.installations%rowtype; v_new public.installations%rowtype; v_previous public.installation_admin_operations%rowtype;
  v_now timestamptz:=clock_timestamp(); v_result jsonb; v_key text; v_delta numeric; v_session jsonb; v_review jsonb; v_cause text; v_fee numeric; v_materials numeric; v_net numeric;
begin
  perform pg_advisory_xact_lock(7242026);
  perform pg_advisory_xact_lock(hashtextextended('ids-admin:'||p_key::text,0));
  if p_key is null or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'invalid_admin_operation'; end if;
  select * into v_previous from public.installation_admin_operations where operation_key=p_key;
  if found then
    if v_previous.installation_id<>p_id or v_previous.payload is distinct from p_payload then raise exception 'admin_operation_conflict'; end if;
    return v_previous.result||jsonb_build_object('replayed',true);
  end if;
  select * into strict v from public.installations where id=p_id for update;
  if public.ids_installation_admin_state(p_id) is distinct from p_expected then raise exception 'installation_state_changed'; end if;
  if jsonb_typeof(p_patch) is distinct from 'object' or jsonb_typeof(p_adjustments) is distinct from 'array'
    or jsonb_typeof(p_sessions) is distinct from 'array' then raise exception 'invalid_admin_operation'; end if;
  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key not in ('status','cash_status','safety_status','safety_notes','remediation_evidence_notes','safety_reschedule_used','special_cash_failure_reschedule',
      'reschedule_opportunity_used','requested_start_at','requested_end_at','pricing_snapshot','draft_pricing','approved_at','deposit_due_cents','balance_due_at','completed_at',
      'admin_notes','estimated_one_way_drive_minutes','included_one_way_drive_minutes','excess_one_way_drive_minutes','billable_travel_hours_per_direction',
      'total_billable_travel_hours','calculated_travel_charge_cents','approved_travel_charge_cents','travel_manually_overridden','travel_override_reason',
      'payment_arrangement_reason','deposit_forfeited_cents','cancellation_review','setup_selected','travel_policy','travel_discount_cents') then raise exception 'invalid_admin_patch'; end if;
  end loop;
  v_new:=jsonb_populate_record(null::public.installations,to_jsonb(v)||p_patch);
  if p_payload->>'action' in ('approve','cash_reschedule','reschedule') and not public.ids_installation_slot_available(v_new.requested_start_at,v_new.requested_end_at,p_id) then raise exception 'slot_unavailable'; end if;
  perform public.ids_validate_cash_balance(p_balance_before); perform public.ids_validate_cash_balance(p_balance_after);
  foreach v_key in array array['receivedCents','completedRefundsCents','pendingRefundsCents','receiptCorrectionsCents','netPaidCents'] loop
    if p_balance_before->v_key is distinct from p_balance_after->v_key then raise exception 'invalid_admin_balance'; end if;
  end loop;
  select coalesce(sum((x->>'amount_cents')::numeric),0) into v_delta from jsonb_array_elements(p_adjustments) x;
  if (p_balance_after->>'adjustmentCents')::numeric<>(p_balance_before->>'adjustmentCents')::numeric+v_delta then raise exception 'invalid_admin_balance'; end if;
  if v_new.pricing_snapshot is not null and (p_balance_after->>'approvedChargesCents')::numeric<>
    (v_new.pricing_snapshot->>'laborCents')::numeric+(v_new.pricing_snapshot->>'materialsAllowanceCents')::numeric+(p_balance_after->>'adjustmentCents')::numeric then raise exception 'invalid_admin_balance'; end if;
  if p_payload->>'action'='session_start' and ((p_balance_before->>'balanceDueCents')::numeric<>0
    or v.safety_status not in ('clear','remediation_approved') or v.status not in ('approved','deposit_due','scheduled','balance_due','ready','suspended')
    or v.pricing_snapshot is null or (v.special_cash_failure_reschedule and not v.reschedule_opportunity_used)) then raise exception 'work_cannot_begin'; end if;

  -- The existing state lock, expected-state comparison and administrator-only
  -- RPC privileges remain intact. Enforce the new review shape before writes.
  if v.terms_version='2026-11-15-cancellation-review' then
    if v.cancellation_review->>'settlementFinal'='true' and p_payload->>'action' in
      ('pricing','travel','adjustment','materials','setup_materials','labor','underground','session_correct') then raise exception 'cancellation_settlement_locked'; end if;
    if p_payload->>'action' in ('cancel','decline') then
      if v.status in ('cancelled','declined','terminated','completed') then raise exception 'installation_closed'; end if;
      if exists(select 1 from public.installation_work_sessions where installation_id=p_id) then raise exception 'use_work_or_safety_termination'; end if;
      if v.special_cash_failure_reschedule then raise exception 'use_cash_failure_resolution'; end if;
      if p_payload->>'action'='decline' and v.status<>'requested' then raise exception 'invalid_transition'; end if;
      if (p_balance_before->>'pendingRefundsCents')::numeric>0 then raise exception 'resolve_pending_refunds_before_cancellation'; end if;
      v_cause:=case when p_payload->>'action'='decline' then 'ids' else p_payload->>'cancellationCause' end;
      if v_cause is null or v_cause not in ('customer','ids','full_refund_required')
        or (p_payload->>'action'='cancel' and p_payload->'cancellationReviewed' is distinct from 'true'::jsonb) then raise exception 'cancellation_review_required'; end if;
      if (p_payload ? 'cancellationFeeCents' and jsonb_typeof(p_payload->'cancellationFeeCents') is distinct from 'number')
        or (p_payload ? 'purchasedMaterialsCents' and jsonb_typeof(p_payload->'purchasedMaterialsCents') is distinct from 'number') then raise exception 'invalid_cancellation_amount'; end if;
      v_fee:=coalesce((p_payload->>'cancellationFeeCents')::numeric,0);
      v_materials:=coalesce((p_payload->>'purchasedMaterialsCents')::numeric,0);
      v_net:=(p_balance_before->>'netPaidCents')::numeric;
      if v_fee<0 or v_fee>25000 or v_fee<>trunc(v_fee) or v_materials<0 or v_materials<>trunc(v_materials) or v_materials>v_net then raise exception 'invalid_cancellation_amount'; end if;
      if v_cause<>'customer' and (v_fee<>0 or v_materials<>0) then raise exception 'no_customer_deductions_for_this_cancellation'; end if;
      if v_materials>0 and (jsonb_typeof(p_payload->'materialsPurchaseEvidence') is distinct from 'string'
        or char_length(btrim(p_payload->>'materialsPurchaseEvidence')) not between 1 and 2000) then raise exception 'verified_materials_purchase_required'; end if;
      v_fee:=least(v_fee,greatest(0,v_net-v_materials));
      v_review:=jsonb_build_object('cause',v_cause,'feeCents',v_fee,'purchasedMaterialsCents',v_materials,
        'materialsChoice',case when v_materials>0 then 'awaiting_choice' else 'not_applicable' end,'settlementFinal',v_cause<>'ids');
      if p_patch->'cancellation_review' is distinct from v_review or v_new.status<>(case when p_payload->>'action'='decline' then 'declined' else 'cancelled' end)
        then raise exception 'invalid_cancellation_review'; end if;
      if v_cause<>'ids' and (p_balance_after->>'approvedChargesCents')::numeric<>v_fee+v_materials then raise exception 'invalid_cancellation_settlement'; end if;
    elsif p_payload->>'action'='cancellation_full_refund' then
      if v.status not in ('cancelled','declined') or v.cancellation_review is null or v.special_cash_failure_reschedule
        or exists(select 1 from public.installation_work_sessions where installation_id=p_id)
        or p_payload->'cancellationReviewed' is distinct from 'true'::jsonb then raise exception 'cancellation_full_refund_unavailable'; end if;
      if (p_balance_before->>'pendingRefundsCents')::numeric>0 then raise exception 'resolve_pending_refunds_before_cancellation'; end if;
      v_review:=jsonb_build_object('cause','full_refund_required','feeCents',0,'purchasedMaterialsCents',0,'materialsChoice','not_applicable','settlementFinal',true);
      if p_patch is distinct from jsonb_build_object('cancellation_review',v_review)
        or (p_balance_after->>'approvedChargesCents')::numeric<>0 or p_sessions<>'[]'::jsonb or p_stop_session is not null then raise exception 'invalid_full_refund_correction'; end if;
    elsif p_payload->>'action'='cancellation_materials_choice' then
      if v.status<>'cancelled' or v.cancellation_review->>'cause' is distinct from 'customer'
        or coalesce((v.cancellation_review->>'purchasedMaterialsCents')::numeric,0)<=0
        or p_payload->'customerChoiceConfirmed' is distinct from 'true'::jsonb
        or coalesce(p_payload->>'materialsChoice','') not in ('pickup','forfeit') then raise exception 'customer_materials_choice_required'; end if;
      v_review:=v.cancellation_review||jsonb_build_object('materialsChoice',p_payload->>'materialsChoice');
      if p_patch is distinct from jsonb_build_object('cancellation_review',v_review) or p_adjustments<>'[]'::jsonb or p_sessions<>'[]'::jsonb
        or p_stop_session is not null or p_balance_after is distinct from p_balance_before then raise exception 'invalid_materials_choice_update'; end if;
    elsif p_patch ? 'cancellation_review' then raise exception 'invalid_cancellation_review';
    end if;
  elsif p_patch ? 'cancellation_review' then raise exception 'review_saved_cancellation_terms';
  end if;
  if p_stop_session is not null then
    update public.installation_work_sessions set ended_at=v_now,duration_seconds=greatest(0,extract(epoch from (v_now-started_at))),duration_minutes=greatest(0,ceil(extract(epoch from (v_now-started_at))/60)::integer),
      status=case when v_new.status='completed' then 'completed' when v_new.safety_status<>'clear' then 'suspended' else 'paused' end,
      notes=left(coalesce(p_payload->>'reason',notes),2000) where id=p_stop_session and installation_id=p_id and status='running';
    if not found then raise exception 'work_state_changed'; end if;
  end if;
  for v_session in select value from jsonb_array_elements(p_sessions) loop
    if v_session->>'status'='running' then
      insert into public.installation_work_sessions(installation_id,technician,started_at,notes,service_type)
        values(p_id,'IDS shared administrator',v_now,v_session->>'notes',coalesce(v_session->>'service_type','installation'));
    else
      if not exists(select 1 from public.installation_work_sessions where id=(v_session->>'corrected_from_id')::uuid and installation_id=p_id and status<>'running') then raise exception 'invalid_time_correction'; end if;
      insert into public.installation_work_sessions(installation_id,technician,started_at,ended_at,duration_minutes,status,notes,corrected_from_id,service_type)
        select p_id,technician,started_at,ended_at,(v_session->>'duration_minutes')::integer,'corrected',v_session->>'notes',id,service_type
        from public.installation_work_sessions where id=(v_session->>'corrected_from_id')::uuid and installation_id=p_id;
    end if;
  end loop;
  insert into public.installation_adjustments(installation_id,kind,description,amount_cents,quantity,unit,created_by,reconciliation_kind)
    select p_id,x.kind,x.description,x.amount_cents,x.quantity,x.unit,'IDS shared administrator',x.reconciliation_kind
    from jsonb_to_recordset(p_adjustments) as x(kind text,description text,amount_cents integer,quantity numeric,unit text,reconciliation_kind text);
  -- Updating calendar columns only for a real move avoids revalidating past work
  -- during an unrelated financial or safety operation.
  if v_new.requested_start_at<>v.requested_start_at or v_new.requested_end_at<>v.requested_end_at then
    update public.installations set requested_start_at=v_new.requested_start_at,requested_end_at=v_new.requested_end_at where id=p_id;
  end if;
  update public.installations set status=v_new.status,cash_status=v_new.cash_status,safety_status=v_new.safety_status,safety_notes=v_new.safety_notes,
    remediation_evidence_notes=v_new.remediation_evidence_notes,safety_reschedule_used=v_new.safety_reschedule_used,special_cash_failure_reschedule=v_new.special_cash_failure_reschedule,
    reschedule_opportunity_used=v_new.reschedule_opportunity_used,pricing_snapshot=v_new.pricing_snapshot,draft_pricing=v_new.draft_pricing,
    approved_at=v_new.approved_at,deposit_due_cents=v_new.deposit_due_cents,balance_due_at=v_new.balance_due_at,completed_at=v_new.completed_at,admin_notes=v_new.admin_notes,
    estimated_one_way_drive_minutes=v_new.estimated_one_way_drive_minutes,included_one_way_drive_minutes=v_new.included_one_way_drive_minutes,
    excess_one_way_drive_minutes=v_new.excess_one_way_drive_minutes,billable_travel_hours_per_direction=v_new.billable_travel_hours_per_direction,
    total_billable_travel_hours=v_new.total_billable_travel_hours,calculated_travel_charge_cents=v_new.calculated_travel_charge_cents,
    approved_travel_charge_cents=v_new.approved_travel_charge_cents,travel_manually_overridden=v_new.travel_manually_overridden,travel_override_reason=v_new.travel_override_reason,
    payment_arrangement_reason=v_new.payment_arrangement_reason,deposit_forfeited_cents=v_new.deposit_forfeited_cents,
    cancellation_review=v_new.cancellation_review,setup_selected=v_new.setup_selected,travel_policy=v_new.travel_policy,travel_discount_cents=v_new.travel_discount_cents,
    payment_status=case when v_new.deposit_forfeited_cents>0 or v.payment_status='forfeited' then 'forfeited'
      when (p_balance_after->>'balanceDueCents')::numeric=0 then 'paid' when (p_balance_after->>'netPaidCents')::numeric>0 then 'partially_paid' else 'unpaid' end,
    updated_at=v_now where id=p_id;
  v_result:=jsonb_build_object('ok',true,'operationKey',p_key,'recordedAt',v_now,'replayed',false,'balanceAtRecording',p_balance_after);
  insert into public.installation_audit_events(installation_id,event_type,actor,details,created_at)
    values(p_id,p_payload->>'action','IDS shared administrator',p_payload||jsonb_build_object('previous',to_jsonb(v),'patch',p_patch,'balanceBefore',p_balance_before,'balanceAfter',p_balance_after),v_now);
  insert into public.installation_admin_operations(operation_key,installation_id,payload,result) values(p_key,p_id,p_payload,v_result);
  return v_result;
end; $$;

commit;
