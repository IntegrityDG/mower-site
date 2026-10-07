begin;

-- A dedicated unexposed schema. Calendar delivery does not reuse or change any
-- IDS business table, notification outbox, public catalog, or existing route.
create schema calendar_delivery_private;
revoke all on schema calendar_delivery_private from public, anon, authenticated;
grant usage on schema calendar_delivery_private to service_role;

create table calendar_delivery_private.digest_deliveries (
  briefing_date date primary key,
  sender text not null check (octet_length(sender) between 1 and 320 and sender !~ E'[\r\n]'),
  recipient text not null check (recipient = 'integritydistributionsystems@gmail.com'),
  subject text not null check (octet_length(subject) between 1 and 998 and subject !~ E'[\r\n]'),
  body_text text not null check (octet_length(body_text) between 1 and 524288),
  event_count integer not null check (event_count between 0 and 2000),
  idempotency_key text not null unique,
  status text not null default 'retryable'
    check (status in ('retryable', 'sending', 'sent', 'needs_review')),
  first_attempt_at timestamptz not null default clock_timestamp(),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_attempt_at timestamptz,
  lease_id uuid,
  lease_expires_at timestamptz,
  provider_message_id text check (provider_message_id is null or
    (octet_length(provider_message_id) between 1 and 256 and provider_message_id !~ E'[\r\n]')),
  sent_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (idempotency_key = 'proton-calendar-digest/' || to_char(briefing_date, 'YYYY-MM-DD') || '/v1'),
  check ((status = 'sending') = (lease_id is not null and lease_expires_at is not null)),
  check ((lease_id is null) = (lease_expires_at is null)),
  check ((status = 'sent') = (sent_at is not null and provider_message_id is not null)),
  check ((sent_at is null) = (provider_message_id is null))
);

alter table calendar_delivery_private.digest_deliveries enable row level security;
alter table calendar_delivery_private.digest_deliveries force row level security;
revoke all on table calendar_delivery_private.digest_deliveries from public, anon, authenticated, service_role;
grant select, insert on table calendar_delivery_private.digest_deliveries to service_role;
grant update (status, attempt_count, last_attempt_at, lease_id, lease_expires_at,
  provider_message_id, sent_at, updated_at)
  on table calendar_delivery_private.digest_deliveries to service_role;

-- A provider idempotency key is useful only when every retry sends the identical
-- message. Also forbid resetting terminal states, even through privileged SQL.
create function calendar_delivery_private.guard_digest_delivery()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.briefing_date is distinct from old.briefing_date or
     new.sender is distinct from old.sender or
     new.recipient is distinct from old.recipient or
     new.subject is distinct from old.subject or
     new.body_text is distinct from old.body_text or
     new.event_count is distinct from old.event_count or
     new.idempotency_key is distinct from old.idempotency_key or
     new.first_attempt_at is distinct from old.first_attempt_at or
     new.created_at is distinct from old.created_at then
    raise exception 'calendar_digest_snapshot_is_immutable';
  end if;
  if old.status in ('sent', 'needs_review') and new is distinct from old then
    raise exception 'calendar_digest_terminal_state_is_permanent';
  end if;
  return new;
end;
$$;

revoke all on function calendar_delivery_private.guard_digest_delivery() from public, anon, authenticated;
grant execute on function calendar_delivery_private.guard_digest_delivery() to service_role;
create trigger guard_digest_delivery before update
  on calendar_delivery_private.digest_deliveries
  for each row execute function calendar_delivery_private.guard_digest_delivery();

create function public.claim_proton_calendar_digest(
  p_date date, p_from text, p_to text, p_subject text, p_text text, p_event_count integer
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  delivery calendar_delivery_private.digest_deliveries%rowtype;
  claim_state text;
  claim_time timestamptz := clock_timestamp();
begin
  -- Validate before INSERT so constraint errors cannot echo message content.
  if p_date is null or p_from is null or octet_length(p_from) not between 1 and 320 or
     btrim(p_from) = '' or p_from ~ E'[\r\n]' or
     p_to is distinct from 'integritydistributionsystems@gmail.com' or
     p_subject is null or octet_length(p_subject) not between 1 and 998 or
     btrim(p_subject) = '' or p_subject ~ E'[\r\n]' or
     p_text is null or octet_length(p_text) not between 1 and 524288 or
     p_event_count is null or p_event_count not between 0 and 2000 then
    raise exception 'invalid_calendar_digest_snapshot';
  end if;

  insert into calendar_delivery_private.digest_deliveries (
    briefing_date, sender, recipient, subject, body_text, event_count,
    idempotency_key, first_attempt_at, created_at, updated_at
  ) values (
    p_date, p_from, p_to, p_subject, p_text, p_event_count,
    'proton-calendar-digest/' || to_char(p_date, 'YYYY-MM-DD') || '/v1',
    claim_time, claim_time, claim_time
  ) on conflict (briefing_date) do nothing;

  -- The unique date serializes creation; this lock serializes lease changes.
  select * into strict delivery
    from calendar_delivery_private.digest_deliveries
    where briefing_date = p_date for update;
  claim_time := clock_timestamp();

  if delivery.status = 'sent' then
    claim_state := 'sent';
  elsif delivery.status = 'needs_review' then
    claim_state := 'needs_review';
  elsif delivery.first_attempt_at <= claim_time - interval '23 hours' then
    -- Resend retains keys for 24h. Leave a conservative 1h buffer and never
    -- automatically resend an unresolved date after the dedupe window ends.
    update calendar_delivery_private.digest_deliveries
      set status = 'needs_review', lease_id = null, lease_expires_at = null,
          updated_at = claim_time
      where briefing_date = p_date returning * into delivery;
    claim_state := 'needs_review';
  elsif delivery.status = 'sending' and delivery.lease_expires_at > claim_time then
    claim_state := 'busy';
  else
    update calendar_delivery_private.digest_deliveries
      set status = 'sending', lease_id = gen_random_uuid(),
          lease_expires_at = claim_time + interval '5 minutes',
          attempt_count = attempt_count + 1, last_attempt_at = claim_time,
          updated_at = claim_time
      where briefing_date = p_date returning * into delivery;
    claim_state := 'claimed';
  end if;

  -- Only the service-role caller can execute this RPC. Always return the saved
  -- payload, not today's newly generated candidate; it may have changed.
  return jsonb_build_object(
    'state', claim_state, 'date', delivery.briefing_date,
    'leaseId', case when claim_state = 'claimed' then delivery.lease_id else null end,
    'leaseExpiresAt', delivery.lease_expires_at,
    'firstAttemptAt', delivery.first_attempt_at, 'attemptCount', delivery.attempt_count,
    'idempotencyKey', delivery.idempotency_key, 'eventCount', delivery.event_count,
    'from', delivery.sender, 'to', delivery.recipient,
    'subject', delivery.subject, 'text', delivery.body_text,
    'providerMessageId', delivery.provider_message_id
  );
end;
$$;

create function public.finish_proton_calendar_digest(
  p_date date, p_lease_id uuid, p_outcome text, p_provider_message_id text default null
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  delivery calendar_delivery_private.digest_deliveries%rowtype;
  finish_time timestamptz := clock_timestamp();
  finish_state text;
begin
  if p_date is null or p_lease_id is null or
     p_outcome is null or p_outcome not in ('sent', 'retryable', 'needs_review') or
     (p_outcome = 'sent' and
       (p_provider_message_id is null or octet_length(p_provider_message_id) not between 1 and 256 or
        btrim(p_provider_message_id) = '' or p_provider_message_id ~ E'[\r\n]')) or
     (p_outcome <> 'sent' and p_provider_message_id is not null) then
    raise exception 'invalid_calendar_digest_outcome';
  end if;

  select * into delivery from calendar_delivery_private.digest_deliveries
    where briefing_date = p_date for update;
  if not found then
    return jsonb_build_object('state', 'stale', 'date', p_date);
  end if;

  if delivery.status in ('sent', 'needs_review') then
    return jsonb_build_object('state', delivery.status, 'date', p_date);
  end if;
  if delivery.status <> 'sending' or delivery.lease_id is distinct from p_lease_id then
    return jsonb_build_object('state', 'stale', 'date', p_date);
  end if;

  if p_outcome = 'sent' then
    finish_state := 'sent';
    update calendar_delivery_private.digest_deliveries
      set status = 'sent', provider_message_id = p_provider_message_id,
          sent_at = finish_time, lease_id = null, lease_expires_at = null,
          updated_at = finish_time
      where briefing_date = p_date;
  else
    finish_state := case
      when p_outcome = 'needs_review' or delivery.first_attempt_at <= finish_time - interval '23 hours'
      then 'needs_review' else 'retryable' end;
    update calendar_delivery_private.digest_deliveries
      set status = finish_state, lease_id = null, lease_expires_at = null,
          updated_at = finish_time
      where briefing_date = p_date;
  end if;
  return jsonb_build_object('state', finish_state, 'date', p_date);
end;
$$;

revoke all on function public.claim_proton_calendar_digest(date, text, text, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.finish_proton_calendar_digest(date, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_proton_calendar_digest(date, text, text, text, text, integer)
  to service_role;
grant execute on function public.finish_proton_calendar_digest(date, uuid, text, text)
  to service_role;

comment on table calendar_delivery_private.digest_deliveries is
  'Private immutable daily calendar email snapshot and leased delivery ledger. No credentials or raw provider errors.';

commit;
