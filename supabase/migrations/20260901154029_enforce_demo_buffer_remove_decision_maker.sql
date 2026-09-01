begin;

-- Demo appointments remain four customer-facing hours. This second exclusion
-- constraint reserves one additional operational hour only between active Demo
-- appointments; the existing raw-range constraint continues to govern every
-- appointment type without adding a buffer to other types or blackouts.
alter table public.demo_requests
  add constraint demo_requests_demo_buffer_no_overlap
  exclude using gist (
    tsrange(
      requested_start_at at time zone 'UTC',
      (requested_end_at at time zone 'UTC') + interval '1 hour',
      '[)'
    ) with &&
  )
  where (appointment_type='demo' and status in ('pending','approved'));

create or replace function public.scheduling_create_demo_request(
  p_name text,
  p_email text,
  p_phone text,
  p_address text,
  p_start_at timestamptz,
  p_source text,
  p_equipment_interest text,
  p_notes text,
  p_demo_format text,
  p_party_screening jsonb,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security invoker
set search_path=pg_catalog,public,scheduling_private
as $$
declare
  request_id uuid;
  request_end timestamptz;
  local_start timestamp;
  availability_rule public.demo_availability_rules;
  demo_settings_row public.demo_settings;
  type_settings public.appointment_type_settings;
  existing public.demo_requests;
  normalized_party_screening jsonb;
  fingerprint text;
begin
  if p_demo_format not in ('private','party') then raise exception 'invalid_demo_format'; end if;
  if p_demo_format='party' and (
    p_party_screening is null
    or p_party_screening->>'propertyRelationship' not in ('homeowner','property_owner','authorized_property_manager')
    or p_party_screening->>'propertyType' not in ('residential','commercial','rental_property','hoa','other')
    or (p_party_screening->>'purchaseTimeframe') not in ('within_30_days','1_to_3_months','3_to_6_months','researching_later')
    or (p_party_screening->>'equipmentBudget') not in ('under_3000','3000_to_5000','5000_to_8000','8000_to_12000','12000_plus')
    or (p_party_screening->>'certification')::boolean is distinct from true
  ) then raise exception 'invalid_party_screening'; end if;
  if p_demo_format='private' and p_party_screening is not null then raise exception 'private_demo_party_payload'; end if;

  normalized_party_screening:=case when p_demo_format='party' then jsonb_build_object(
    'propertyRelationship',p_party_screening->>'propertyRelationship',
    'propertyType',p_party_screening->>'propertyType',
    'mowableAcreage',(p_party_screening->>'mowableAcreage')::numeric,
    'activelyConsideringPurchase',(p_party_screening->>'activelyConsideringPurchase')::boolean,
    'purchaseTimeframe',p_party_screening->>'purchaseTimeframe',
    'equipmentBudget',p_party_screening->>'equipmentBudget',
    'certification',true
  ) else null end;

  fingerprint:=md5(jsonb_build_object(
    'name',p_name,'email',lower(p_email),'phone',p_phone,'address',p_address,
    'startAt',p_start_at,'source',p_source,'equipmentInterest',p_equipment_interest,
    'notes',p_notes,'demoFormat',p_demo_format,'partyScreening',normalized_party_screening
  )::text);

  -- Serialize retries sharing the same browser-generated key. If a request was
  -- created by the previous function, compare its authoritative fields without
  -- the retired screening answer before replacing the legacy fingerprint.
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text,0));
  select * into existing from public.demo_requests where idempotency_key=p_idempotency_key for update;
  if found then
    if existing.scheduling_fingerprint is distinct from fingerprint then
      if existing.customer_name is distinct from p_name
        or lower(existing.customer_email) is distinct from lower(p_email)
        or existing.customer_phone is distinct from p_phone
        or existing.property_address is distinct from p_address
        or existing.requested_start_at is distinct from p_start_at
        or existing.source is distinct from p_source
        or existing.equipment_interest is distinct from p_equipment_interest
        or existing.demo_format is distinct from p_demo_format
        or existing.notes is distinct from p_notes
      then raise exception 'idempotency_conflict'; end if;
      if p_demo_format='party' and not exists (
        select 1 from scheduling_private.demo_parties party
        where party.request_id=existing.id
          and party.property_relationship=normalized_party_screening->>'propertyRelationship'
          and party.property_type=normalized_party_screening->>'propertyType'
          and party.mowable_acreage=(normalized_party_screening->>'mowableAcreage')::numeric
          and party.actively_considering_purchase=(normalized_party_screening->>'activelyConsideringPurchase')::boolean
          and party.purchase_timeframe=normalized_party_screening->>'purchaseTimeframe'
          and party.equipment_budget=normalized_party_screening->>'equipmentBudget'
          and party.property_authorization_certified
      ) then raise exception 'idempotency_conflict'; end if;
      update public.demo_requests set scheduling_fingerprint=fingerprint where id=existing.id;
    end if;
    return existing.id;
  end if;

  select * into type_settings from public.appointment_type_settings where appointment_type='demo' and public_active;
  if not found then raise exception 'appointment_type_unavailable'; end if;
  select * into demo_settings_row from public.demo_settings where id=true;
  request_end:=p_start_at+make_interval(mins=>type_settings.duration_minutes);
  if p_start_at<=now() or p_start_at>now()+make_interval(days=>demo_settings_row.scheduling_horizon_days) then
    raise exception 'slot_unavailable';
  end if;
  local_start:=p_start_at at time zone demo_settings_row.timezone;
  select * into availability_rule
  from public.demo_availability_rules
  where weekday=extract(dow from local_start)::smallint and enabled;
  if not found
    or local_start<>date_trunc('minute',local_start)
    or local_start::time<availability_rule.start_time
    or mod(extract(epoch from (local_start::time-availability_rule.start_time))::bigint,(type_settings.duration_minutes+60)*60)<>0
    or (request_end at time zone demo_settings_row.timezone)::date<>local_start::date
    or (request_end at time zone demo_settings_row.timezone)::time>availability_rule.end_time
  then raise exception 'slot_unavailable'; end if;
  if exists (
    select 1 from public.demo_availability_exceptions
    where tstzrange(starts_at,ends_at,'[)')&&tstzrange(p_start_at,request_end,'[)')
  ) then raise exception 'slot_unavailable'; end if;
  if exists (
    select 1 from public.demo_requests
    where appointment_type='demo'
      and status in ('pending','approved')
      and tstzrange(
        requested_start_at,
        requested_end_at+interval '1 hour',
        '[)'
      )&&tstzrange(p_start_at,request_end+interval '1 hour','[)')
  ) then raise exception 'slot_conflict'; end if;
  if exists (
    select 1 from public.demo_requests
    where created_at>now()-interval '5 minutes'
      and idempotency_key<>p_idempotency_key
      and (lower(customer_email)=lower(p_email)
        or regexp_replace(customer_phone,'[^0-9]','','g')=regexp_replace(p_phone,'[^0-9]','','g'))
  ) then raise exception 'request_throttled'; end if;

  insert into public.demo_requests(
    customer_name,customer_email,customer_phone,property_address,
    requested_start_at,requested_end_at,status,source,equipment_interest,
    idempotency_key,appointment_type,duration_minutes,demo_format,notes,payment_status,scheduling_fingerprint
  ) values (
    p_name,lower(p_email),p_phone,p_address,p_start_at,request_end,'pending',p_source,p_equipment_interest,
    p_idempotency_key,'demo',type_settings.duration_minutes,p_demo_format,p_notes,'not_started',fingerprint
  ) returning id into request_id;

  if p_demo_format='party' then
    insert into scheduling_private.demo_parties(
      request_id,property_relationship,property_type,mowable_acreage,
      actively_considering_purchase,purchase_timeframe,equipment_budget,
      property_authorization_certified
    ) values (
      request_id,normalized_party_screening->>'propertyRelationship',normalized_party_screening->>'propertyType',
      (normalized_party_screening->>'mowableAcreage')::numeric,
      (normalized_party_screening->>'activelyConsideringPurchase')::boolean,
      normalized_party_screening->>'purchaseTimeframe',normalized_party_screening->>'equipmentBudget',true
    );
    perform scheduling_private.recalculate_demo_party_benefits(request_id);
  end if;
  insert into scheduling_private.appointment_audit_events(request_id,event_type,actor_type,metadata)
  values(request_id,'request_submitted','customer',jsonb_build_object('appointmentType','demo','demoFormat',p_demo_format));
  return request_id;
exception when exclusion_violation then raise exception 'slot_conflict';
end
$$;

-- No other live function, view, or constraint depends on this screening field.
-- Drop it without CASCADE so an unexpected future dependency fails safely.
alter table scheduling_private.demo_parties
  drop column decision_maker;

revoke all on function public.scheduling_create_demo_request(text,text,text,text,timestamptz,text,text,text,text,jsonb,uuid)
  from public,anon,authenticated;
grant execute on function public.scheduling_create_demo_request(text,text,text,text,timestamptz,text,text,text,text,jsonb,uuid)
  to service_role;

commit;
