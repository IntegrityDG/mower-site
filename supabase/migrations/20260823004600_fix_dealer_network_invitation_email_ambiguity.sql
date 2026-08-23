-- Fix PL/pgSQL variable/column ambiguity without changing invitation behavior.
create or replace function public.dealer_network_create_member_invitation(
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
  v_invitation_id uuid;
  v_normalized_name text;
  v_normalized_email text;
  v_normalized_message text;
begin
  v_normalized_name := btrim(coalesce(p_invitee_name, ''));
  v_normalized_email := lower(btrim(coalesce(p_invitee_email, '')));
  v_normalized_message := nullif(btrim(coalesce(p_personal_message, '')), '');

  if char_length(v_normalized_name) not between 1 and 160 then
    raise exception 'invalid_invitee_name';
  end if;

  if char_length(v_normalized_email) not between 3 and 254
     or v_normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then
    raise exception 'invalid_invitee_email';
  end if;

  if v_normalized_message is not null
     and char_length(v_normalized_message) > 500
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
    where lower(m.email) = v_normalized_email
      and m.deleted_at is null
  ) then
    raise exception 'already_member';
  end if;

  -- Prevent repeated invitations to the same recipient.
  -- The advisory lock closes the race between simultaneous requests.
  perform pg_advisory_xact_lock(
    hashtextextended(
      'dealer-member-invite-recipient:' || v_normalized_email,
      0
    )
  );

  if exists (
    select 1
    from public.dealer_network_member_invitations i
    where lower(i.invitee_email) = v_normalized_email
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
    v_normalized_name,
    v_normalized_email,
    v_normalized_message
  )
  returning id into v_invitation_id;

  return v_invitation_id;
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
