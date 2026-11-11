-- Execute only against an isolated test database after the two-session migration.
-- All fixtures and changes are rolled back.
begin;
set local role service_role;

do $test$
declare
  sub uuid; customer uuid; cycle_one uuid; cycle_two uuid; result jsonb; repeated jsonb;
  first_case uuid; no_show_case uuid; third_case uuid; staff uuid; appointment uuid;
  operation uuid := gen_random_uuid(); failed boolean;
  second_sub uuid; second_first uuid; second_renewal uuid; second_customer uuid; second_case uuid;
  cancel_case uuid; late_case uuid; early_appointment uuid; late_appointment uuid;
  start_at timestamptz := now() - interval '1 day';
  end_at timestamptz := now() + interval '29 days';
begin
  result := public.ids_support_checkout_draft(gen_random_uuid(), 'synthetic-fingerprint',
    repeat('a', 64), '{"name":"Synthetic Support Customer","email":"support@example.invalid"}'::jsonb, false, null);
  sub := (result->>'id')::uuid;
  customer := (result->>'customer_id')::uuid;
  result := public.ids_support_paid_cycle(sub, 'synthetic-event-one', 'synthetic-invoice-one',
    'cus_synthetic_one', 'sub_synthetic_one', 'pm_synthetic_one', false, now(), start_at, end_at);
  cycle_one := (result->>'cycleId')::uuid;
  repeated := public.ids_support_paid_cycle(sub, 'synthetic-event-retry', 'synthetic-invoice-one',
    'cus_synthetic_one', 'sub_synthetic_one', 'pm_synthetic_one', false, now(), start_at, end_at);
  if repeated->>'duplicate' <> 'true'
    or (repeated->>'cycleId')::uuid <> cycle_one
    or (select count(*) from public.remote_support_sessions where cycle_id=cycle_one) <> 2
    or exists(select 1 from public.remote_support_sessions where cycle_id=cycle_one and number not in (1,2)) then
    raise exception 'First paid cycle or duplicate webhook allocated incorrect sessions';
  end if;

  insert into public.service_staff(name,email,phone)
    values ('Synthetic Staff','staff@example.invalid','5550000000') returning id into staff;
  insert into public.service_cases(customer_id,subscription_id,kind,customer_name,customer_phone,
    issue_notes,arrangement,manage_token_hash,request_key,request_fingerprint)
    values(customer,sub,'included_support','Synthetic Customer','5550000000',
      'First issue','remote',repeat('b',64),gen_random_uuid(),'first') returning id into first_case;
  result := public.ids_service_action(null, first_case, 'start_session', operation, 1, '{}'::jsonb);
  repeated := public.ids_service_action(null, first_case, 'start_session', operation, 1, '{}'::jsonb);
  if result is distinct from repeated then raise exception 'Start-session retry was not idempotent'; end if;
  perform public.ids_service_action(null, first_case, 'start_session', gen_random_uuid(), 2, '{}'::jsonb);
  if (select count(*) from public.remote_support_sessions where cycle_id=cycle_one and status='consumed' and case_id=first_case) <> 1 then
    raise exception 'Follow-up consumed another session';
  end if;

  insert into public.service_cases(customer_id,subscription_id,kind,customer_name,customer_phone,
    issue_notes,arrangement,manage_token_hash,request_key,request_fingerprint)
    values(customer,sub,'included_support','Synthetic Customer','5550000000',
      'No-show issue','remote',repeat('c',64),gen_random_uuid(),'no-show') returning id into no_show_case;
  insert into public.service_appointments(case_id,staff_id,starts_at,ends_at,cycle_id,session_number)
    values(no_show_case,staff,now()-interval '1 hour',now()-interval '30 minutes',cycle_one,2)
    returning id into appointment;
  update public.remote_support_sessions set status='reserved',case_id=no_show_case,appointment_id=appointment
    where cycle_id=cycle_one and number=2;
  perform public.ids_service_action(null,no_show_case,'no_show',gen_random_uuid(),1,
    jsonb_build_object('appointmentId',appointment));
  if (select count(*) from public.remote_support_sessions where cycle_id=cycle_one and status='consumed') <> 2
    or (select count(*) from public.remote_support_penalties where subscription_id=sub and applied_at is null) <> 1 then
    raise exception 'No-show did not consume the second slot and carry its penalty';
  end if;

  insert into public.service_cases(customer_id,subscription_id,kind,customer_name,customer_phone,
    issue_notes,arrangement,manage_token_hash,request_key,request_fingerprint)
    values(customer,sub,'included_support','Synthetic Customer','5550000000',
      'Third issue','remote',repeat('d',64),gen_random_uuid(),'third') returning id into third_case;
  failed := false;
  begin
    perform public.ids_service_action(null,third_case,'start_session',gen_random_uuid(),1,'{}'::jsonb);
  exception when others then
    if sqlerrm not like '%service_sessions_exhausted%' then raise; end if;
    failed := true;
  end;
  if not failed or exists(select 1 from public.remote_support_sessions where case_id=third_case) then
    raise exception 'Third issue was granted an included session';
  end if;

  result := public.ids_support_paid_cycle(sub,'synthetic-event-two','synthetic-invoice-two',
    'cus_synthetic_one','sub_synthetic_one','pm_synthetic_one',false,now(),end_at,end_at+interval '30 days');
  cycle_two := (result->>'cycleId')::uuid;
  repeated := public.ids_support_paid_cycle(sub,'synthetic-event-two-retry','synthetic-invoice-two',
    'cus_synthetic_one','sub_synthetic_one','pm_synthetic_one',false,now(),end_at,end_at+interval '30 days');
  if repeated->>'duplicate' <> 'true'
    or (select count(*) from public.remote_support_sessions where cycle_id=cycle_two) <> 2
    or (select count(*) from public.remote_support_sessions where cycle_id=cycle_two and reason='carried_no_show_penalty') <> 1
    or (select count(*) from public.remote_support_sessions where cycle_id=cycle_two and status='available') <> 1 then
    raise exception 'Renewal allocation, retry, or carried no-show penalty failed';
  end if;
  if not public.ids_support_eligible(customer,now()) then raise exception 'Paid customer lost the service discount'; end if;

  result := public.ids_support_checkout_draft(gen_random_uuid(),'second-fingerprint',repeat('e',64),
    '{"name":"Synthetic Second Customer","email":"second@example.invalid"}'::jsonb,false,null);
  second_sub := (result->>'id')::uuid;
  second_customer := (result->>'customer_id')::uuid;
  result := public.ids_support_paid_cycle(second_sub,'synthetic-event-three','synthetic-invoice-three',
    'cus_synthetic_two','sub_synthetic_two','pm_synthetic_two',false,now(),start_at,end_at);
  second_first := (result->>'cycleId')::uuid;
  insert into public.service_cases(customer_id,subscription_id,kind,customer_name,customer_phone,
    issue_notes,arrangement,manage_token_hash,request_key,request_fingerprint)
    values(second_customer,second_sub,'included_support','Synthetic Customer','5550000000',
      'One issue','remote',repeat('f',64),gen_random_uuid(),'one') returning id into second_case;
  perform public.ids_service_action(null,second_case,'start_session',gen_random_uuid(),1,'{}'::jsonb);
  result := public.ids_support_paid_cycle(second_sub,'synthetic-event-four','synthetic-invoice-four',
    'cus_synthetic_two','sub_synthetic_two','pm_synthetic_two',false,now(),end_at,end_at+interval '30 days');
  second_renewal := (result->>'cycleId')::uuid;
  if (select count(*) from public.remote_support_sessions where cycle_id=second_first and status='available') <> 1
    or (select count(*) from public.remote_support_sessions where cycle_id=second_renewal and status='available') <> 2 then
    raise exception 'Unused sessions rolled into the next cycle';
  end if;

  insert into public.service_cases(customer_id,subscription_id,kind,customer_name,customer_phone,
    issue_notes,arrangement,manage_token_hash,request_key,request_fingerprint)
    values(second_customer,second_sub,'included_support','Synthetic Customer','5550000000',
      'Early cancellation','remote',repeat('1',64),gen_random_uuid(),'early') returning id into cancel_case;
  insert into public.service_appointments(case_id,staff_id,starts_at,ends_at,cycle_id,session_number)
    values(cancel_case,staff,now()+interval '25 hours',now()+interval '26 hours',second_first,2)
    returning id into early_appointment;
  update public.remote_support_sessions set status='reserved',case_id=cancel_case,appointment_id=early_appointment
    where cycle_id=second_first and number=2;
  perform public.ids_service_action(null,cancel_case,'cancel_appointment',gen_random_uuid(),1,
    jsonb_build_object('appointmentId',early_appointment));
  if (select status from public.remote_support_sessions where cycle_id=second_first and number=2) <> 'available' then
    raise exception 'Early cancellation consumed a session';
  end if;

  insert into public.service_cases(customer_id,subscription_id,kind,customer_name,customer_phone,
    issue_notes,arrangement,manage_token_hash,request_key,request_fingerprint)
    values(second_customer,second_sub,'included_support','Synthetic Customer','5550000000',
      'Late cancellation','remote',repeat('2',64),gen_random_uuid(),'late') returning id into late_case;
  insert into public.service_appointments(case_id,staff_id,starts_at,ends_at,cycle_id,session_number)
    values(late_case,staff,now()+interval '23 hours',now()+interval '24 hours',second_first,2)
    returning id into late_appointment;
  update public.remote_support_sessions set status='reserved',case_id=late_case,appointment_id=late_appointment
    where cycle_id=second_first and number=2;
  perform public.ids_service_action(null,late_case,'cancel_appointment',gen_random_uuid(),1,
    jsonb_build_object('appointmentId',late_appointment));
  if (select status from public.remote_support_sessions where cycle_id=second_first and number=2) <> 'consumed' then
    raise exception 'Late cancellation failed to consume its session';
  end if;

  if has_table_privilege('anon','public.remote_support_sessions','select')
    or has_table_privilege('authenticated','public.remote_support_sessions','select')
    or has_function_privilege('anon','public.ids_support_paid_cycle(uuid,text,text,text,text,text,boolean,timestamptz,timestamptz,timestamptz)','execute') then
    raise exception 'Remote Support records or paid-cycle function exposed to browser roles';
  end if;
end;
$test$;
rollback;
