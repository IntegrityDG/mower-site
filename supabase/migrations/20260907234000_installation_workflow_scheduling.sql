begin;

-- One schedule lock precedes row locks, including direct calendar writers.
create function public.ids_lock_shared_schedule() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin perform pg_advisory_xact_lock(7242026); return null; end; $$;
create trigger installation_schedule_statement_lock before insert or update of requested_start_at,requested_end_at,status or delete
  on public.installations for each statement execute function public.ids_lock_shared_schedule();
create trigger demo_schedule_statement_lock before insert or update of requested_start_at,requested_end_at,status or delete
  on public.demo_requests for each statement execute function public.ids_lock_shared_schedule();
create trigger installation_rules_statement_lock before insert or update or delete on public.demo_availability_rules
  for each statement execute function public.ids_lock_shared_schedule();
create trigger installation_blackouts_statement_lock before insert or update or delete on public.demo_availability_exceptions
  for each statement execute function public.ids_lock_shared_schedule();
create trigger installation_horizon_statement_lock before update on public.demo_settings
  for each statement execute function public.ids_lock_shared_schedule();

-- Same four-hour grid, Chicago wall time, horizon and raw occupancy for listing,
-- intake and approval/reschedule. Only demo/demo carries the existing hour buffer.
create function public.ids_installation_slot_available(p_start timestamptz, p_end timestamptz, p_exclude uuid default null, p_now timestamptz default clock_timestamp())
returns boolean language plpgsql stable security invoker set search_path = '' as $$
declare v_local timestamp; v_rule public.demo_availability_rules%rowtype; v_horizon integer; v_canonical timestamptz;
begin
  select scheduling_horizon_days into strict v_horizon from public.demo_settings where id;
  if p_start is null or p_end is null or not isfinite(p_start) or not isfinite(p_end)
    or p_end <> p_start + interval '4 hours' or p_start <= p_now
    or p_start > p_now + v_horizon * interval '24 hours' then return false; end if;
  v_local := p_start at time zone 'America/Chicago';
  select * into v_rule from public.demo_availability_rules where weekday=extract(dow from v_local)::integer and enabled;
  if not found or v_local<>date_trunc('minute',v_local) or v_local::time<v_rule.start_time
    or mod(extract(epoch from (v_local::time-v_rule.start_time))::bigint,14400)<>0
    or (p_end at time zone 'America/Chicago')::date<>v_local::date
    or (p_end at time zone 'America/Chicago')::time>v_rule.end_time then return false; end if;
  v_canonical := v_local at time zone 'America/Chicago';
  if (v_canonical-interval '1 hour') at time zone 'America/Chicago'=v_local then v_canonical:=v_canonical-interval '1 hour'; end if;
  if p_start<>v_canonical then return false; end if;
  return not exists(select 1 from public.demo_availability_exceptions where tstzrange(starts_at,ends_at,'[)')&&tstzrange(p_start,p_end,'[)'))
    and not exists(select 1 from public.demo_requests where status in ('pending','approved') and tstzrange(requested_start_at,requested_end_at,'[)')&&tstzrange(p_start,p_end,'[)'))
    and not exists(select 1 from public.installations where id is distinct from p_exclude
      and status in ('requested','approved','deposit_due','scheduled','balance_due','ready','in_progress','suspended')
      and tstzrange(requested_start_at,requested_end_at,'[)')&&tstzrange(p_start,p_end,'[)'));
end; $$;
create function public.ids_guard_installation_slot() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if not public.ids_installation_slot_available(new.requested_start_at,new.requested_end_at,new.id) then raise exception 'slot_unavailable'; end if;
  return new;
end; $$;
create trigger installation_available_slot before insert or update of requested_start_at,requested_end_at
  on public.installations for each row execute function public.ids_guard_installation_slot();
create function public.ids_list_installation_slots(p_start date,p_end date) returns table(start_at timestamptz,end_at timestamptz)
language plpgsql stable security invoker set search_path = '' as $$
declare v_date date; v_rule public.demo_availability_rules%rowtype; v_wall timestamp; v_start timestamptz; v_now timestamptz:=clock_timestamp();
begin
  if p_start is null or p_end is null or p_end<p_start or p_end-p_start>42 then raise exception 'invalid_availability_range'; end if;
  v_date:=p_start;
  while v_date<=p_end loop
    select * into v_rule from public.demo_availability_rules where weekday=extract(dow from v_date)::integer and enabled;
    if found then
      v_wall:=v_date+v_rule.start_time;
      while v_wall::date=v_date and v_wall::time<v_rule.end_time loop
        v_start:=v_wall at time zone 'America/Chicago';
        if (v_start-interval '1 hour') at time zone 'America/Chicago'=v_wall then v_start:=v_start-interval '1 hour'; end if;
        if v_start at time zone 'America/Chicago'=v_wall and public.ids_installation_slot_available(v_start,v_start+interval '4 hours',null,v_now) then
          start_at:=v_start; end_at:=v_start+interval '4 hours'; return next;
        end if;
        v_wall:=v_wall+interval '4 hours';
      end loop;
    end if;
    v_date:=v_date+1;
  end loop;
end; $$;

alter table public.installations add column request_payload jsonb,
  add column payment_arrangement_reason text,
  add column deposit_forfeited_cents integer not null default 0 check (deposit_forfeited_cents>=0);
alter table public.installation_adjustments add column reconciliation_kind text;
-- Preserve actual elapsed time; rounding each pause separately overstates
-- cumulative billable labor. Legacy/corrected minute entries remain supported.
alter table public.installation_work_sessions add column duration_seconds double precision
  check(duration_seconds>=0 and duration_seconds<'Infinity'::double precision);
alter table public.installation_work_sessions add constraint installation_work_sessions_installation_id_id_key unique(installation_id,id),
  add constraint installation_work_session_correction_same_job foreign key(installation_id,corrected_from_id) references public.installation_work_sessions(installation_id,id),
  add constraint installation_work_session_one_correction unique(corrected_from_id);
create trigger installation_work_sessions_ledger_lock before insert or update or delete on public.installation_work_sessions
  for each row execute function public.ids_lock_installation_ledger();
create function public.ids_protect_work_history() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='DELETE' or old.status<>'running' then raise exception 'work_history_is_immutable_use_linked_correction'; end if;
  if new.installation_id<>old.installation_id or new.started_at<>old.started_at or new.technician<>old.technician then raise exception 'work_history_is_immutable_use_linked_correction'; end if;
  return new;
end; $$;
create trigger installation_work_history_immutable before update or delete on public.installation_work_sessions
  for each row execute function public.ids_protect_work_history();

create table public.installation_admin_operations (
  operation_key uuid primary key, installation_id uuid not null references public.installations(id),
  payload jsonb not null, result jsonb not null, created_at timestamptz not null default clock_timestamp()
);
create table public.installation_pricing_history (
  operation_key uuid primary key, previous_pricing jsonb not null, pricing jsonb not null,
  reason text not null check (char_length(btrim(reason)) between 1 and 2000),
  actor text not null check (actor='IDS shared administrator'), created_at timestamptz not null default clock_timestamp()
);
alter table public.installation_admin_operations enable row level security;
alter table public.installation_pricing_history enable row level security;
revoke all on public.installation_admin_operations,public.installation_pricing_history from public,anon,authenticated,service_role;
grant select,insert on public.installation_admin_operations,public.installation_pricing_history to service_role;

create function public.ids_create_installation(p_payload jsonb) returns jsonb
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
  if p_payload->'groundingAcknowledged' is distinct from 'true'::jsonb
    or p_payload->'responsibilitiesAcknowledged' is distinct from 'true'::jsonb
    or p_payload->'termsAcknowledged' is distinct from 'true'::jsonb
    or jsonb_typeof(p_payload->'undergroundRequested') is distinct from 'boolean'
    or jsonb_typeof(p_payload->'cashRequested') is distinct from 'boolean'
    or (p_payload->'undergroundRequested'='true'::jsonb and p_payload->'undergroundAcknowledged' is distinct from 'true'::jsonb) then raise exception 'invalid_intake'; end if;
  insert into public.installations(customer_name,customer_email,customer_phone,property_address,equipment,preferred_location,internet_availability,
    underground_requested,estimated_underground_feet,requested_start_at,requested_end_at,cash_status,
    grounding_acknowledged_at,responsibilities_acknowledged_at,terms_acknowledged_at,underground_acknowledged_at,idempotency_key,request_payload)
  values(p_payload->>'name',p_payload->>'email',p_payload->>'phone',p_payload->>'address',p_payload->>'equipment',p_payload->>'preferredLocation',p_payload->>'internetAvailability',
    (p_payload->>'undergroundRequested')::boolean,(p_payload->>'estimatedUndergroundFeet')::numeric,v_start,v_start+interval '4 hours',
    case when (p_payload->>'cashRequested')::boolean then 'requested' else 'not_requested' end,
    v_now,v_now,v_now,case when (p_payload->>'undergroundRequested')::boolean then v_now else null end,v_key,p_payload) returning * into v;
  insert into public.installation_audit_events(installation_id,event_type,actor,details) values(v.id,'customer_request','customer',jsonb_build_object('operationKey',v_key));
  return jsonb_build_object('id',v.id,'public_token',v.public_token);
end; $$;

create function public.ids_installation_admin_state(p_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
select jsonb_build_object('installation',to_jsonb(i),'ledger',public.ids_installation_ledger(i.id),
  'adjustments',coalesce((select jsonb_agg(a order by id) from public.installation_adjustments a where installation_id=i.id),'[]'),
  'payments',coalesce((select jsonb_agg(p order by id) from public.installation_payments p where installation_id=i.id),'[]'),
  'corrections',coalesce((select jsonb_agg(c order by id) from public.installation_cash_corrections c where installation_id=i.id),'[]'),
  'cashRefunds',coalesce((select jsonb_agg(r order by id) from public.installation_cash_refunds r where installation_id=i.id),'[]'),
  'sessions',coalesce((select jsonb_agg(s order by id) from public.installation_work_sessions s where installation_id=i.id),'[]'))
from public.installations i where id=p_id;
$$;

-- Trusted server computes policy and cents. The DB compares every input under
-- the parent lock, validates the result/delta, and commits history/state together.
create function public.ids_apply_installation_admin(p_id uuid,p_key uuid,p_payload jsonb,p_expected jsonb,p_patch jsonb,
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
      'payment_arrangement_reason','deposit_forfeited_cents') then raise exception 'invalid_admin_patch'; end if;
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
      insert into public.installation_work_sessions(installation_id,technician,started_at,notes)
        values(p_id,'IDS shared administrator',v_now,v_session->>'notes');
    else
      if not exists(select 1 from public.installation_work_sessions where id=(v_session->>'corrected_from_id')::uuid and installation_id=p_id and status<>'running') then raise exception 'invalid_time_correction'; end if;
      insert into public.installation_work_sessions(installation_id,technician,started_at,ended_at,duration_minutes,status,notes,corrected_from_id)
        select p_id,technician,started_at,ended_at,(v_session->>'duration_minutes')::integer,'corrected',v_session->>'notes',id
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
    payment_status=case when v_new.deposit_forfeited_cents>0 or v.payment_status='forfeited' then 'forfeited'
      when (p_balance_after->>'balanceDueCents')::numeric=0 then 'paid' when (p_balance_after->>'netPaidCents')::numeric>0 then 'partially_paid' else 'unpaid' end,
    updated_at=v_now where id=p_id;
  v_result:=jsonb_build_object('ok',true,'operationKey',p_key,'recordedAt',v_now,'replayed',false,'balanceAtRecording',p_balance_after);
  insert into public.installation_audit_events(installation_id,event_type,actor,details,created_at)
    values(p_id,p_payload->>'action','IDS shared administrator',p_payload||jsonb_build_object('previous',to_jsonb(v),'patch',p_patch,'balanceBefore',p_balance_before,'balanceAfter',p_balance_after),v_now);
  insert into public.installation_admin_operations(operation_key,installation_id,payload,result) values(p_key,p_id,p_payload,v_result);
  return v_result;
end; $$;

create function public.ids_save_installation_pricing(p_key uuid,p_pricing jsonb,p_expected jsonb,p_reason text) returns jsonb
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
  update public.installation_pricing_settings set labor_cents=(p_pricing->>'laborCents')::integer,materials_allowance_cents=(p_pricing->>'materialsAllowanceCents')::integer,
    deposit_cents=(p_pricing->>'depositCents')::integer,additional_labor_hourly_cents=(p_pricing->>'additionalLaborHourlyCents')::integer,
    underground_per_segment_cents=(p_pricing->>'undergroundPerSegmentCents')::integer,travel_hourly_cents=(p_pricing->>'travelHourlyCents')::integer,updated_at=clock_timestamp() where id;
  insert into public.installation_pricing_history(operation_key,previous_pricing,pricing,reason,actor) values(p_key,to_jsonb(v),p_pricing,p_reason,'IDS shared administrator');
  return jsonb_build_object('ok',true,'replayed',false);
end; $$;

revoke all on function public.ids_lock_shared_schedule(),public.ids_installation_slot_available(timestamptz,timestamptz,uuid,timestamptz),public.ids_guard_installation_slot(),
 public.ids_list_installation_slots(date,date),public.ids_protect_work_history(),public.ids_create_installation(jsonb),public.ids_installation_admin_state(uuid),
 public.ids_apply_installation_admin(uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,uuid,jsonb,jsonb),public.ids_save_installation_pricing(uuid,jsonb,jsonb,text)
 from public,anon,authenticated;
grant execute on function public.ids_lock_shared_schedule(),public.ids_installation_slot_available(timestamptz,timestamptz,uuid,timestamptz),public.ids_guard_installation_slot(),
 public.ids_list_installation_slots(date,date),public.ids_protect_work_history(),public.ids_create_installation(jsonb),public.ids_installation_admin_state(uuid),
 public.ids_apply_installation_admin(uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,uuid,jsonb,jsonb),public.ids_save_installation_pricing(uuid,jsonb,jsonb,text)
 to service_role;
commit;
