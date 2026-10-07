-- After applying the reviewed migration, run this test in a disposable database
-- or a caller-owned transaction. All fixtures are synthetic; ROLLBACK retains
-- no rows. It never sends email or reads existing business/calendar records.
begin;
set local statement_timeout = '15s';

do $permissions$
declare function_oid oid;
begin
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'calendar_delivery_private' and c.relname = 'digest_deliveries'
      and c.relrowsecurity and c.relforcerowsecurity
  ) then raise exception 'digest_rls_missing'; end if;
  if has_schema_privilege('anon', 'calendar_delivery_private', 'USAGE') or
     has_schema_privilege('authenticated', 'calendar_delivery_private', 'USAGE') or
     has_table_privilege('anon', 'calendar_delivery_private.digest_deliveries', 'SELECT') or
     has_table_privilege('authenticated', 'calendar_delivery_private.digest_deliveries', 'SELECT') or
     has_table_privilege('service_role', 'calendar_delivery_private.digest_deliveries', 'DELETE') or
     has_column_privilege('service_role', 'calendar_delivery_private.digest_deliveries', 'sender', 'UPDATE') then
    raise exception 'digest_private_privileges_failed';
  end if;
  for function_oid in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where (n.nspname = 'public' and p.proname in ('claim_proton_calendar_digest', 'finish_proton_calendar_digest', 'read_proton_calendar_digest'))
         or (n.nspname = 'calendar_delivery_private' and p.proname = 'guard_digest_delivery')
  loop
    if (select prosecdef from pg_proc where oid = function_oid) or
       has_function_privilege('anon', function_oid, 'EXECUTE') or
       has_function_privilege('authenticated', function_oid, 'EXECUTE') or
       not has_function_privilege('service_role', function_oid, 'EXECUTE') then
      raise exception 'digest_function_privileges_failed';
    end if;
  end loop;
end;
$permissions$;

set local role anon;
do $anon_denied$
begin
  begin
    perform 1 from calendar_delivery_private.digest_deliveries limit 1;
    raise exception 'anonymous_digest_read_allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.claim_proton_calendar_digest('2099-10-01', 'Synthetic <sender@example.test>',
      'integritydistributionsystems@gmail.com', 'Synthetic subject', 'Synthetic body', 0);
    raise exception 'anonymous_digest_claim_allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.read_proton_calendar_digest('2099-10-01');
    raise exception 'anonymous_digest_lookup_allowed';
  exception when insufficient_privilege then null; end;
end;
$anon_denied$;
reset role;

set local role authenticated;
do $authenticated_denied$
begin
  begin
    perform 1 from calendar_delivery_private.digest_deliveries limit 1;
    raise exception 'authenticated_digest_read_allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.finish_proton_calendar_digest('2099-10-01', gen_random_uuid(), 'retryable', null);
    raise exception 'authenticated_digest_finish_allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.read_proton_calendar_digest('2099-10-01');
    raise exception 'authenticated_digest_lookup_allowed';
  exception when insufficient_privilege then null; end;
end;
$authenticated_denied$;
reset role;

set local role service_role;
do $delivery_states$
declare
  initial jsonb;
  repeated jsonb;
  second_lease jsonb;
  finished jsonb;
  saved jsonb;
  initial_lease uuid;
begin
  if public.read_proton_calendar_digest('2099-11-01') is not null then
    raise exception 'unknown_digest_lookup_not_null';
  end if;
  begin
    perform public.claim_proton_calendar_digest('2099-10-05', 'Synthetic <sender@example.test>',
      'unapproved@example.test', 'Synthetic subject', 'Synthetic body', 0);
    raise exception 'digest_unapproved_recipient_allowed';
  exception when raise_exception then
    if sqlerrm <> 'invalid_calendar_digest_snapshot' then raise; end if;
  end;
  begin
    perform public.claim_proton_calendar_digest('2099-10-05', 'Synthetic <sender@example.test>',
      'integritydistributionsystems@gmail.com', E'Invalid\nsubject', 'Synthetic body', 0);
    raise exception 'digest_header_injection_allowed';
  exception when raise_exception then
    if sqlerrm <> 'invalid_calendar_digest_snapshot' then raise; end if;
  end;
  begin
    perform public.claim_proton_calendar_digest('2099-10-05', 'Synthetic <sender@example.test>',
      'integritydistributionsystems@gmail.com', 'Synthetic subject', repeat('x', 524289), 0);
    raise exception 'digest_oversized_body_allowed';
  exception when raise_exception then
    if sqlerrm <> 'invalid_calendar_digest_snapshot' then raise; end if;
  end;
  initial := public.claim_proton_calendar_digest('2099-10-01', 'Synthetic <sender@example.test>',
    'integritydistributionsystems@gmail.com', 'Original subject', 'Original body', 2);
  if initial ->> 'state' <> 'claimed' or (initial ->> 'attemptCount')::integer <> 1 or
     initial ->> 'idempotencyKey' <> 'proton-calendar-digest/2099-10-01/v1' or
     (initial ->> 'leaseExpiresAt')::timestamptz - (initial ->> 'firstAttemptAt')::timestamptz
       not between interval '5 minutes' and interval '5 minutes 5 seconds' then
    raise exception 'initial_digest_claim_failed';
  end if;
  initial_lease := (initial ->> 'leaseId')::uuid;
  saved := public.read_proton_calendar_digest('2099-10-01');
  if saved is distinct from jsonb_build_object(
    'date', '2099-10-01', 'from', 'Synthetic <sender@example.test>',
    'to', 'integritydistributionsystems@gmail.com', 'subject', 'Original subject',
    'text', 'Original body', 'eventCount', 2
  ) then raise exception 'digest_snapshot_lookup_failed'; end if;

  repeated := public.claim_proton_calendar_digest('2099-10-01', 'Changed <other@example.test>',
    'integritydistributionsystems@gmail.com', 'Changed subject', 'Changed body', 9);
  if repeated ->> 'state' <> 'busy' or repeated ->> 'leaseId' is not null or
     repeated ->> 'from' <> initial ->> 'from' or repeated ->> 'subject' <> 'Original subject' or
     repeated ->> 'text' <> 'Original body' or (repeated ->> 'eventCount')::integer <> 2 then
    raise exception 'digest_busy_or_snapshot_changed';
  end if;
  if public.read_proton_calendar_digest('2099-10-01') is distinct from saved then
    raise exception 'digest_lookup_changed_after_candidate';
  end if;
  finished := public.finish_proton_calendar_digest('2099-10-01', gen_random_uuid(), 'retryable', null);
  if finished ->> 'state' <> 'stale' then raise exception 'wrong_digest_lease_accepted'; end if;

  begin
    update calendar_delivery_private.digest_deliveries set sender = 'Changed'
      where briefing_date = '2099-10-01';
    raise exception 'digest_snapshot_update_allowed';
  exception when insufficient_privilege then null; end;
  begin
    delete from calendar_delivery_private.digest_deliveries where briefing_date = '2099-10-01';
    raise exception 'digest_delete_allowed';
  exception when insufficient_privilege then null; end;

  -- Simulate a crashed worker. The next owner receives the same provider key
  -- and message; a stale original worker cannot mark the new attempt finished.
  update calendar_delivery_private.digest_deliveries
    set lease_expires_at = clock_timestamp() - interval '1 second'
    where briefing_date = '2099-10-01';
  second_lease := public.claim_proton_calendar_digest('2099-10-01', 'Changed <other@example.test>',
    'integritydistributionsystems@gmail.com', 'Changed subject', 'Changed body', 9);
  if second_lease ->> 'state' <> 'claimed' or second_lease ->> 'leaseId' = initial ->> 'leaseId' or
     (second_lease ->> 'attemptCount')::integer <> 2 or
     second_lease ->> 'idempotencyKey' <> initial ->> 'idempotencyKey' or
     second_lease ->> 'firstAttemptAt' <> initial ->> 'firstAttemptAt' or
     second_lease ->> 'text' <> 'Original body' then
    raise exception 'digest_lease_reclaim_failed';
  end if;
  finished := public.finish_proton_calendar_digest('2099-10-01', initial_lease, 'sent', 'synthetic-old-provider-id');
  if finished ->> 'state' <> 'stale' then raise exception 'stale_digest_worker_finished'; end if;
  finished := public.finish_proton_calendar_digest('2099-10-01', (second_lease ->> 'leaseId')::uuid,
    'sent', 'synthetic-provider-id');
  if finished ->> 'state' <> 'sent' then raise exception 'digest_sent_finish_failed'; end if;
  repeated := public.claim_proton_calendar_digest('2099-10-01', 'Changed <other@example.test>',
    'integritydistributionsystems@gmail.com', 'Changed subject', 'Changed body', 9);
  if repeated ->> 'state' <> 'sent' or repeated ->> 'leaseId' is not null or
     repeated ->> 'providerMessageId' <> 'synthetic-provider-id' or
     (repeated ->> 'attemptCount')::integer <> 2 then
    raise exception 'sent_digest_was_reclaimed';
  end if;
  if public.read_proton_calendar_digest('2099-10-01') is distinct from saved then
    raise exception 'digest_lookup_changed_after_sent';
  end if;

  initial := public.claim_proton_calendar_digest('2099-10-02', 'Synthetic <sender@example.test>',
    'integritydistributionsystems@gmail.com', 'Retry subject', 'Retry body', 0);
  finished := public.finish_proton_calendar_digest('2099-10-02', (initial ->> 'leaseId')::uuid, 'retryable', null);
  if finished ->> 'state' <> 'retryable' then raise exception 'digest_retry_finish_failed'; end if;
  second_lease := public.claim_proton_calendar_digest('2099-10-02', 'Synthetic <sender@example.test>',
    'integritydistributionsystems@gmail.com', 'Changed subject', 'Changed body', 0);
  if second_lease ->> 'state' <> 'claimed' or second_lease ->> 'text' <> 'Retry body' or
     second_lease ->> 'firstAttemptAt' <> initial ->> 'firstAttemptAt' then
    raise exception 'digest_retry_snapshot_changed';
  end if;
  finished := public.finish_proton_calendar_digest('2099-10-02', (second_lease ->> 'leaseId')::uuid, 'needs_review', null);
  repeated := public.claim_proton_calendar_digest('2099-10-02', 'Synthetic <sender@example.test>',
    'integritydistributionsystems@gmail.com', 'Changed subject', 'Changed body', 0);
  if finished ->> 'state' <> 'needs_review' or repeated ->> 'state' <> 'needs_review' then
    raise exception 'digest_review_was_reclaimed';
  end if;
end;
$delivery_states$;
reset role;

-- Fixture timestamps are explicit INSERT values; immutable anchors are never
-- changed by production functions or by these tests after a row is created.
insert into calendar_delivery_private.digest_deliveries (
  briefing_date, sender, recipient, subject, body_text, event_count,
  idempotency_key, first_attempt_at, status, lease_id, lease_expires_at, attempt_count
) values
  ('2099-10-03', 'Synthetic <sender@example.test>', 'integritydistributionsystems@gmail.com',
    'Old uncertain', 'Synthetic body', 0, 'proton-calendar-digest/2099-10-03/v1',
    clock_timestamp() - interval '23 hours', 'retryable', null, null, 1),
  ('2099-10-04', 'Synthetic <sender@example.test>', 'integritydistributionsystems@gmail.com',
    'Old sending', 'Synthetic body', 0, 'proton-calendar-digest/2099-10-04/v1',
    clock_timestamp() - interval '24 hours', 'sending', '00000000-0000-4000-8000-000000000004',
    clock_timestamp() + interval '5 minutes', 1);

set local role service_role;
do $old_uncertain$
declare result jsonb;
begin
  result := public.claim_proton_calendar_digest('2099-10-03', 'Synthetic <sender@example.test>',
    'integritydistributionsystems@gmail.com', 'New subject', 'New body', 0);
  if result ->> 'state' <> 'needs_review' or result ->> 'leaseId' is not null then
    raise exception 'old_uncertain_digest_was_reclaimed';
  end if;
  result := public.finish_proton_calendar_digest('2099-10-04', '00000000-0000-4000-8000-000000000004',
    'retryable', null);
  if result ->> 'state' <> 'needs_review' then raise exception 'old_digest_retry_not_blocked'; end if;
end;
$old_uncertain$;
reset role;

do $immutable_terminal$
begin
  begin
    update calendar_delivery_private.digest_deliveries set body_text = 'Changed'
      where briefing_date = '2099-10-01';
    raise exception 'digest_snapshot_trigger_missing';
  exception when raise_exception then
    if sqlerrm <> 'calendar_digest_snapshot_is_immutable' then raise; end if;
  end;
  begin
    update calendar_delivery_private.digest_deliveries set status = 'retryable',
      provider_message_id = null, sent_at = null where briefing_date = '2099-10-01';
    raise exception 'digest_sent_reset_allowed';
  exception when raise_exception then
    if sqlerrm <> 'calendar_digest_terminal_state_is_permanent' then raise; end if;
  end;
  begin
    update calendar_delivery_private.digest_deliveries set status = 'retryable'
      where briefing_date = '2099-10-03';
    raise exception 'digest_review_reset_allowed';
  exception when raise_exception then
    if sqlerrm <> 'calendar_digest_terminal_state_is_permanent' then raise; end if;
  end;
end;
$immutable_terminal$;

rollback;
