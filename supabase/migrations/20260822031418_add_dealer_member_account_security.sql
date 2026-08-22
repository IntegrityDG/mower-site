begin;

create function public.dealer_network_member_account_summary(p_token_hash text)
returns jsonb
language sql
security invoker
set search_path = pg_catalog, public, dealer_network_private
as $$
  select jsonb_build_object(
    'accountStatus', case when m.status = 'active' and not m.account_locked then 'Active' else 'Needs Attention' end,
    'emailVerified', c.email_verified_at is not null,
    'lastLoginAt', m.last_login_at,
    'activeSessionCount', (
      select count(*)
      from dealer_network_private.sessions active_session
      where active_session.member_id = m.id
        and active_session.revoked_at is null
        and active_session.expires_at > now()
    ),
    'currentSessionExpiresAt', current_session.expires_at,
    'businessLocationReady', location.geocode_status = 'succeeded'
      and location.latitude is not null
      and location.longitude is not null
  )
  from dealer_network_private.sessions current_session
  join public.dealer_network_members m on m.id = current_session.member_id
  join dealer_network_private.credentials c on c.member_id = m.id
  left join dealer_network_private.member_locations location on location.member_id = m.id
  where current_session.token_hash = p_token_hash
    and current_session.revoked_at is null
    and current_session.expires_at > now()
$$;

create function public.dealer_network_revoke_other_sessions(p_token_hash text)
returns integer
language plpgsql
security invoker
set search_path = pg_catalog, dealer_network_private
as $$
declare
  current_session dealer_network_private.sessions;
  revoked_count integer;
begin
  select * into current_session
  from dealer_network_private.sessions
  where token_hash = p_token_hash
    and revoked_at is null
    and expires_at > now()
  for update;

  if not found then
    raise exception 'invalid_session';
  end if;

  update dealer_network_private.sessions
  set revoked_at = now()
  where member_id = current_session.member_id
    and id <> current_session.id
    and revoked_at is null
    and expires_at > now();

  get diagnostics revoked_count = row_count;
  return revoked_count;
end
$$;

create function public.dealer_network_change_pin(
  p_token_hash text,
  p_expected_pin_hash text,
  p_pin_hash text,
  p_pin_salt text
)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, dealer_network_private
as $$
declare
  current_member_id uuid;
begin
  select member_id into current_member_id
  from dealer_network_private.sessions
  where token_hash = p_token_hash
    and revoked_at is null
    and expires_at > now()
  for update;

  if current_member_id is null then
    return false;
  end if;

  update dealer_network_private.credentials
  set pin_hash = p_pin_hash,
      pin_salt = p_pin_salt,
      failed_attempts = 0,
      last_failed_at = null,
      auth_locked_until = null,
      pin_changed_at = now(),
      updated_at = now()
  where member_id = current_member_id
    and pin_hash = p_expected_pin_hash;

  if not found then
    return false;
  end if;

  update dealer_network_private.sessions
  set revoked_at = coalesce(revoked_at, now())
  where member_id = current_member_id
    and revoked_at is null;

  return true;
end
$$;

revoke all on function public.dealer_network_member_account_summary(text)
  from public, anon, authenticated;
revoke all on function public.dealer_network_revoke_other_sessions(text)
  from public, anon, authenticated;
revoke all on function public.dealer_network_change_pin(text, text, text, text)
  from public, anon, authenticated;

grant execute on function public.dealer_network_member_account_summary(text)
  to service_role;
grant execute on function public.dealer_network_revoke_other_sessions(text)
  to service_role;
grant execute on function public.dealer_network_change_pin(text, text, text, text)
  to service_role;

commit;
