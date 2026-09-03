begin;

create function public.dealer_network_consume_activation_email_cooldown(
  p_member_id uuid
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select public.dealer_network_consume_rate_limit(
    'dealer_activation_email',
    pg_catalog.md5('dealer_activation_email:' || p_member_id::text)
      || pg_catalog.md5(p_member_id::text || ':dealer_activation_email'),
    1,
    300
  )
$$;

-- Replacement credentials are staged with revoked_at = created_at. This uses
-- the existing private table without retaining a raw token or adding a public
-- state column. Only finalization after provider acceptance clears revoked_at.
create function public.dealer_network_stage_activation_token(
  p_application_id uuid,
  p_member_id uuid,
  p_expected_email text,
  p_token_hash text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_application_status text;
  v_member public.dealer_network_members;
  v_now timestamptz := pg_catalog.now();
  v_token_id uuid;
  v_recipient_email text;
begin
  select m.*
  into v_member
  from public.dealer_network_members as m
  where m.id = p_member_id
  for update;

  if not found
     or v_member.deleted_at is not null
     or v_member.application_id is distinct from p_application_id then
    raise exception 'member_not_found';
  end if;
  if v_member.status <> 'pending_activation'
     or v_member.activated_at is not null then
    raise exception 'member_not_pending_activation';
  end if;

  select a.status
  into v_application_status
  from public.dealer_network_applications as a
  where a.id = p_application_id
  for update;

  if not found then
    raise exception 'application_not_found';
  end if;
  if v_application_status <> 'approved' then
    raise exception 'application_not_approved';
  end if;

  v_recipient_email := pg_catalog.lower(pg_catalog.btrim(v_member.email));
  if v_recipient_email is null
     or pg_catalog.char_length(v_recipient_email) > 254
     or v_recipient_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'invalid_member_email';
  end if;
  if v_recipient_email is distinct from p_expected_email then
    raise exception 'member_email_changed';
  end if;

  if not public.dealer_network_consume_activation_email_cooldown(p_member_id) then
    raise exception 'activation_email_cooldown';
  end if;

  insert into dealer_network_private.activation_tokens(
    member_id,
    token_hash,
    expires_at,
    revoked_at,
    created_at
  )
  values(
    p_member_id,
    p_token_hash,
    v_now + interval '24 hours',
    v_now,
    v_now
  )
  returning id into v_token_id;

  return pg_catalog.jsonb_build_object(
    'tokenId', v_token_id,
    'memberId', p_member_id,
    'recipientEmail', v_recipient_email
  );
end;
$$;

create function public.dealer_network_finalize_activation_token(
  p_member_id uuid,
  p_token_id uuid,
  p_expected_email text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_member public.dealer_network_members;
  v_token dealer_network_private.activation_tokens;
  v_recipient_email text;
begin
  select m.*
  into v_member
  from public.dealer_network_members as m
  where m.id = p_member_id
  for update;

  if not found
     or v_member.deleted_at is not null
     or v_member.status <> 'pending_activation'
     or v_member.activated_at is not null then
    return pg_catalog.jsonb_build_object(
      'finalized', false,
      'reason', 'member_state_changed'
    );
  end if;

  v_recipient_email := pg_catalog.lower(pg_catalog.btrim(v_member.email));
  if v_recipient_email is distinct from p_expected_email then
    return pg_catalog.jsonb_build_object(
      'finalized', false,
      'reason', 'member_email_changed'
    );
  end if;

  select t.*
  into v_token
  from dealer_network_private.activation_tokens as t
  where t.id = p_token_id
    and t.member_id = p_member_id
  for update;

  if not found
     or v_token.used_at is not null
     or v_token.revoked_at is null
     or v_token.revoked_at is distinct from v_token.created_at
     or v_token.created_at <= pg_catalog.now() - interval '10 minutes' then
    return pg_catalog.jsonb_build_object(
      'finalized', false,
      'reason', 'token_not_staged'
    );
  end if;

  update dealer_network_private.activation_tokens
  set revoked_at = pg_catalog.now()
  where member_id = p_member_id
    and id <> p_token_id
    and used_at is null
    and revoked_at is null;

  update dealer_network_private.activation_tokens
  set
    expires_at = pg_catalog.now() + interval '24 hours',
    revoked_at = null
  where id = p_token_id;

  return pg_catalog.jsonb_build_object('finalized', true);
end;
$$;

-- The old one-step replacement API revoked usable links before delivery. Keep
-- its signature so an older application deployment fails closed during rollout.
create or replace function public.dealer_network_replace_activation_token(
  p_member_id uuid,
  p_token_hash text,
  p_expires_at timestamptz
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'deprecated_activation_token_flow';
end;
$$;

-- Resolve the token to its member first, then lock the member before locking
-- and consuming the token. Finalization uses the same member-then-token order.
create or replace function public.dealer_network_activate_member(
  p_token_hash text,
  p_pin_hash text,
  p_pin_salt text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_member public.dealer_network_members;
  v_member_id uuid;
  v_token dealer_network_private.activation_tokens;
begin
  select t.member_id
  into v_member_id
  from dealer_network_private.activation_tokens as t
  where t.token_hash = p_token_hash;

  if not found then
    raise exception 'invalid_token';
  end if;

  select m.*
  into v_member
  from public.dealer_network_members as m
  where m.id = v_member_id
  for update;

  if not found
     or v_member.deleted_at is not null
     or v_member.status <> 'pending_activation'
     or v_member.activated_at is not null then
    raise exception 'invalid_member_state';
  end if;

  select t.*
  into v_token
  from dealer_network_private.activation_tokens as t
  where t.token_hash = p_token_hash
    and t.member_id = v_member_id
  for update;

  if not found
     or v_token.used_at is not null
     or v_token.revoked_at is not null
     or v_token.expires_at <= pg_catalog.now() then
    raise exception 'invalid_token';
  end if;

  update dealer_network_private.credentials
  set
    pin_hash = p_pin_hash,
    pin_salt = p_pin_salt,
    email_verified_at = pg_catalog.now(),
    failed_attempts = 0,
    last_failed_at = null,
    auth_locked_until = null,
    pin_changed_at = pg_catalog.now(),
    updated_at = pg_catalog.now()
  where member_id = v_member_id;

  update dealer_network_private.activation_tokens
  set revoked_at = pg_catalog.now()
  where member_id = v_member_id
    and id <> v_token.id
    and used_at is null
    and revoked_at is null;

  update dealer_network_private.activation_tokens
  set used_at = pg_catalog.now()
  where id = v_token.id;

  update public.dealer_network_members
  set
    status = 'active',
    activated_at = pg_catalog.now(),
    updated_at = pg_catalog.now()
  where id = v_member_id;

  insert into public.dealer_network_status_events(
    member_id,
    event_type,
    from_value,
    to_value,
    actor_type
  )
  values(
    v_member_id,
    'member_status',
    'pending_activation',
    'active',
    'member'
  );

  return v_member_id;
end;
$$;

revoke all on function public.dealer_network_consume_activation_email_cooldown(uuid)
  from public, anon, authenticated;
revoke all on function public.dealer_network_stage_activation_token(uuid,uuid,text,text)
  from public, anon, authenticated;
revoke all on function public.dealer_network_finalize_activation_token(uuid,uuid,text)
  from public, anon, authenticated;
revoke all on function public.dealer_network_replace_activation_token(uuid,text,timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.dealer_network_activate_member(text,text,text)
  from public, anon, authenticated;

grant execute on function public.dealer_network_consume_activation_email_cooldown(uuid)
  to service_role;
grant execute on function public.dealer_network_stage_activation_token(uuid,uuid,text,text)
  to service_role;
grant execute on function public.dealer_network_finalize_activation_token(uuid,uuid,text)
  to service_role;
grant execute on function public.dealer_network_activate_member(text,text,text)
  to service_role;

commit;
