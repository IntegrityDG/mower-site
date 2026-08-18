create table public.dealer_network_member_invitations (
  id uuid primary key default gen_random_uuid(),
  inviter_member_id uuid not null
    references public.dealer_network_members(id)
    on delete restrict,

  invitee_name text not null
    check (
      char_length(btrim(invitee_name))
      between 1 and 160
    ),

  invitee_email text not null
    check (
      char_length(btrim(invitee_email))
      between 3 and 254
    ),

  personal_message text
    check (
      personal_message is null
      or char_length(personal_message) <= 500
    ),

  created_at timestamptz not null default now()
);


comment on table public.dealer_network_member_invitations is
  'Private audit record of Dealer & Tech Network membership invitations sent by existing members.';


create index dealer_network_member_invitations_inviter_idx
  on public.dealer_network_member_invitations (
    inviter_member_id,
    created_at desc
  );


create index dealer_network_member_invitations_email_idx
  on public.dealer_network_member_invitations (
    lower(invitee_email),
    created_at desc
  );


alter table public.dealer_network_member_invitations
  enable row level security;

alter table public.dealer_network_member_invitations
  force row level security;


revoke all
  on table public.dealer_network_member_invitations
  from public, anon, authenticated;

grant select, insert, update
  on table public.dealer_network_member_invitations
  to service_role;


-- ============================================================
-- Notification ledger support
-- ============================================================

alter table public.dealer_network_notification_events
  drop constraint if exists
  dealer_network_notification_events_event_type_check;


alter table public.dealer_network_notification_events
  add constraint
  dealer_network_notification_events_event_type_check
  check (
    event_type in (
      'ids_new_application',
      'applicant_activation',
      'applicant_denied',
      'applicant_more_information',
      'member_pin_reset',
      'member_new_message',
      'member_broadcast',
      'member_invitation'
    )
  );


alter table public.dealer_network_notification_events
  add column invitation_id uuid
  references public.dealer_network_member_invitations(id)
  on delete restrict;


create index dealer_network_notification_events_invitation_idx
  on public.dealer_network_notification_events (
    invitation_id,
    created_at desc
  )
  where invitation_id is not null;


-- ============================================================
-- Atomic invitation creation
-- ============================================================

create function public.dealer_network_create_member_invitation(
  p_inviter_member_id uuid,
  p_invitee_name text,
  p_invitee_email text,
  p_personal_message text
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  invitation_id uuid;
  normalized_name text;
  normalized_email text;
  normalized_message text;
begin
  normalized_name := btrim(coalesce(p_invitee_name, ''));
  normalized_email := lower(btrim(coalesce(p_invitee_email, '')));
  normalized_message := nullif(btrim(coalesce(p_personal_message, '')), '');

  if char_length(normalized_name) not between 1 and 160 then
    raise exception 'invalid_invitee_name';
  end if;

  if char_length(normalized_email) not between 3 and 254
     or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then
    raise exception 'invalid_invitee_email';
  end if;

  if normalized_message is not null
     and char_length(normalized_message) > 500
  then
    raise exception 'invalid_personal_message';
  end if;

  if not exists (
    select 1
    from public.dealer_network_members m
    where m.id = p_inviter_member_id
      and m.status = 'active'
      and m.account_locked = false
      and m.deleted_at is null
  ) then
    raise exception 'inviter_unavailable';
  end if;

  if exists (
    select 1
    from public.dealer_network_members m
    where lower(m.email) = normalized_email
      and m.deleted_at is null
  ) then
    raise exception 'already_member';
  end if;

  -- Prevent repeated invitations to the same recipient.
  -- The advisory lock closes the race between simultaneous requests.
  perform pg_advisory_xact_lock(
    hashtextextended(
      'dealer-member-invite-recipient:' || normalized_email,
      0
    )
  );

  if exists (
    select 1
    from public.dealer_network_member_invitations i
    where lower(i.invitee_email) = normalized_email
      and i.created_at > now() - interval '7 days'
  ) then
    raise exception 'invitation_recipient_cooldown';
  end if;

  -- Maximum 10 member invitations per 24-hour rate-limit window.
  -- The limiter key is derived only from the authenticated inviter member ID.
  if not public.dealer_network_consume_rate_limit(
    'member_invitation_24h',
    repeat(
      md5(
        'dealer-member-invitation:' ||
        p_inviter_member_id::text
      ),
      2
    ),
    10,
    86400
  ) then
    raise exception 'invitation_daily_limit';
  end if;

  insert into public.dealer_network_member_invitations (
    inviter_member_id,
    invitee_name,
    invitee_email,
    personal_message
  )
  values (
    p_inviter_member_id,
    normalized_name,
    normalized_email,
    normalized_message
  )
  returning id into invitation_id;

  return invitation_id;
end;
$$;


revoke all
  on function public.dealer_network_create_member_invitation(
    uuid,
    text,
    text,
    text
  )
  from public, anon, authenticated;


grant execute
  on function public.dealer_network_create_member_invitation(
    uuid,
    text,
    text,
    text
  )
  to service_role;
