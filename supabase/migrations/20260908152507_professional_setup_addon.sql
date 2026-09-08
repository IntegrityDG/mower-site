begin;

-- Extend the released Installation job and its one ledger. Legacy jobs and
-- sessions retain their Installation-only meaning; no historical charge backfill.
alter table public.installation_pricing_settings add column setup_labor_cents integer not null default 50000 check (setup_labor_cents>=0);
alter table public.installations
  add column installation_selected boolean not null default true,
  add column setup_selected boolean not null default false,
  add column travel_policy text not null default 'round_trip' check(travel_policy in ('round_trip','combined_visit')),
  add column travel_discount_cents integer not null default 0 check(travel_discount_cents>=0),
  add constraint installation_service_selected check(installation_selected or setup_selected);
-- Subscriber eligibility belongs to the upcoming website subscription system.
-- This migration creates no subscription table or manual eligibility fields.
-- Setup-only does not pretend that installation/grounding was purchased or
-- acknowledged. Installation's mandatory grounding acknowledgement is retained.
alter table public.installations alter column grounding_acknowledged_at drop not null;
alter table public.installations add constraint installation_grounding_required check(not installation_selected or grounding_acknowledged_at is not null);
alter table public.installations add constraint setup_only_no_installation_allowance check(installation_selected or
  (not underground_requested and (pricing_snapshot is null or ((pricing_snapshot->>'laborCents')::numeric=0 and (pricing_snapshot->>'materialsAllowanceCents')::numeric=0))));
alter table public.installation_work_sessions add column service_type text not null default 'installation' check(service_type in ('installation','setup'));
alter table public.installation_work_sessions add constraint installation_work_component_identity unique(installation_id,id,service_type),
  add constraint installation_work_correction_same_component foreign key(installation_id,corrected_from_id,service_type) references public.installation_work_sessions(installation_id,id,service_type);

create function public.ids_guard_work_component() returns trigger
language plpgsql security invoker set search_path='' as $$
declare v public.installations%rowtype;
begin
  if tg_op='UPDATE' and new.service_type is distinct from old.service_type then raise exception 'work_component_is_immutable'; end if;
  if tg_op='INSERT' and new.corrected_from_id is null then
    select * into strict v from public.installations where id=new.installation_id for update;
    if (new.service_type='installation' and not v.installation_selected) or (new.service_type='setup' and not v.setup_selected) then raise exception 'service_component_not_selected'; end if;
  end if;
  return new;
end; $$;
create trigger installation_work_component_guard before insert or update on public.installation_work_sessions for each row execute function public.ids_guard_work_component();
revoke all on function public.ids_guard_work_component() from public,anon,authenticated;
grant execute on function public.ids_guard_work_component() to service_role;

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
    v_now,v_now,v_now,case when (p_payload->>'undergroundRequested')::boolean then v_now else null end,v_key,p_payload,coalesce((p_payload->>'setupSelected')::boolean,false),'2026-09-08-setup') returning * into v;
  insert into public.installation_audit_events(installation_id,event_type,actor,details) values(v.id,'customer_request','customer',jsonb_build_object('operationKey',v_key));
  return jsonb_build_object('id',v.id,'public_token',v.public_token);
end; $$;

create or replace function public.ids_apply_installation_admin(p_id uuid,p_key uuid,p_payload jsonb,p_expected jsonb,p_patch jsonb,
  p_adjustments jsonb,p_sessions jsonb,p_stop_session uuid,p_balance_before jsonb,p_balance_after jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v public.installations%rowtype; v_new public.installations%rowtype; v_previous public.installation_admin_operations%rowtype;
  v_now timestamptz:=clock_timestamp(); v_result jsonb; v_key text; v_delta numeric; v_session jsonb;
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
      'payment_arrangement_reason','deposit_forfeited_cents','setup_selected','travel_policy','travel_discount_cents') then raise exception 'invalid_admin_patch'; end if;
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
    setup_selected=v_new.setup_selected,travel_policy=v_new.travel_policy,travel_discount_cents=v_new.travel_discount_cents,
    payment_status=case when v_new.deposit_forfeited_cents>0 or v.payment_status='forfeited' then 'forfeited'
      when (p_balance_after->>'balanceDueCents')::numeric=0 then 'paid' when (p_balance_after->>'netPaidCents')::numeric>0 then 'partially_paid' else 'unpaid' end,
    updated_at=v_now where id=p_id;
  v_result:=jsonb_build_object('ok',true,'operationKey',p_key,'recordedAt',v_now,'replayed',false,'balanceAtRecording',p_balance_after);
  insert into public.installation_audit_events(installation_id,event_type,actor,details,created_at)
    values(p_id,p_payload->>'action','IDS shared administrator',p_payload||jsonb_build_object('previous',to_jsonb(v),'patch',p_patch,'balanceBefore',p_balance_before,'balanceAfter',p_balance_after),v_now);
  insert into public.installation_admin_operations(operation_key,installation_id,payload,result) values(p_key,p_id,p_payload,v_result);
  return v_result;
end; $$;

create or replace function public.ids_save_installation_pricing(p_key uuid,p_pricing jsonb,p_expected jsonb,p_reason text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v public.installation_pricing_settings%rowtype; h public.installation_pricing_history%rowtype;
begin
  select * into strict v from public.installation_pricing_settings where id for update;
  select * into h from public.installation_pricing_history where operation_key=p_key;
  if found then
    if h.pricing is distinct from p_pricing or h.reason is distinct from p_reason then raise exception 'admin_operation_conflict'; end if;
    return jsonb_build_object('ok',true,'replayed',true);
  end if;
  if p_key is null or p_expected is distinct from to_jsonb(v) then raise exception 'pricing_changed'; end if;
  if p_pricing ? 'setupLaborCents' and (jsonb_typeof(p_pricing->'setupLaborCents') is distinct from 'number' or (p_pricing->>'setupLaborCents')::numeric<0 or (p_pricing->>'setupLaborCents')::numeric<>trunc((p_pricing->>'setupLaborCents')::numeric)) then raise exception 'invalid_setup_price'; end if;
  update public.installation_pricing_settings set setup_labor_cents=coalesce((p_pricing->>'setupLaborCents')::integer,v.setup_labor_cents),labor_cents=(p_pricing->>'laborCents')::integer,materials_allowance_cents=(p_pricing->>'materialsAllowanceCents')::integer,
    deposit_cents=(p_pricing->>'depositCents')::integer,additional_labor_hourly_cents=(p_pricing->>'additionalLaborHourlyCents')::integer,
    underground_per_segment_cents=(p_pricing->>'undergroundPerSegmentCents')::integer,travel_hourly_cents=(p_pricing->>'travelHourlyCents')::integer,updated_at=clock_timestamp() where id;
  insert into public.installation_pricing_history(operation_key,previous_pricing,pricing,reason,actor) values(p_key,to_jsonb(v),p_pricing,p_reason,'IDS shared administrator');
  return jsonb_build_object('ok',true,'replayed',false);
end; $$;

-- This RPC is internal/service-role only. The HTTP server separately requires
-- the existing IDS administrator authentication; public intake never calls it.
create function public.ids_create_setup_only(p_payload jsonb,p_reason text) returns jsonb
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
  insert into public.installations(customer_name,customer_email,customer_phone,property_address,equipment,internet_availability,
    requested_start_at,requested_end_at,grounding_acknowledged_at,responsibilities_acknowledged_at,terms_acknowledged_at,
    installation_selected,setup_selected,terms_version,idempotency_key,request_payload)
  values(p_payload->>'name',p_payload->>'email',p_payload->>'phone',p_payload->>'address',p_payload->>'equipment',p_payload->>'internetAvailability',
    v_start,v_start+interval '4 hours',null,v_now,v_now,false,true,'2026-09-08-setup',v_key,v_payload) returning * into v;
  insert into public.installation_audit_events(installation_id,event_type,actor,details)
    values(v.id,'setup_only_created','IDS shared administrator',jsonb_build_object('operationKey',v_key,'reason',btrim(p_reason),'installationSelected',false,'setupSelected',true));
  return jsonb_build_object('ok',true,'id',v.id,'public_token',v.public_token,'replayed',false);
end; $$;
revoke all on function public.ids_create_setup_only(jsonb,text) from public,anon,authenticated;
grant execute on function public.ids_create_setup_only(jsonb,text) to service_role;

-- Existing RLS, ledger RPC signatures, cash/processor protections, table grants
-- and audit sequence privileges are retained. No public database write grants.
commit;
