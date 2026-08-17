begin;

-- Deleted members remain only as scrubbed internal tombstones so historical
-- conversations/messages and troubleshooting records can retain valid FKs.
alter table public.dealer_network_members
  add column deleted_at timestamptz;

-- A deleted tombstone no longer belongs to an application and no longer
-- retains personal/contact/profile fields.
alter table public.dealer_network_members
  alter column application_id drop not null,
  alter column phone drop not null,
  alter column normalized_phone drop not null,
  alter column email drop not null,
  alter column normalized_email drop not null,
  alter column address_line_1 drop not null,
  alter column city drop not null,
  alter column state drop not null,
  alter column zip_code drop not null,
  alter column country drop not null,
  alter column role drop not null,
  alter column experience drop not null,
  alter column service_region drop not null,
  alter column introduction drop not null;

alter table public.dealer_network_members
  add constraint dealer_network_members_deleted_state_check
  check (
    deleted_at is null
    or (
      status = 'archived'
      and account_locked = true
      and messaging_enabled = false
      and application_id is null
    )
  );

create index dealer_network_members_deleted_idx
  on public.dealer_network_members (deleted_at)
  where deleted_at is not null;


create function public.dealer_network_delete_member(
  p_member_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, dealer_network_private
as $$
declare
  v_application_id uuid;
  v_deleted_at timestamptz := now();
begin
  select application_id
    into v_application_id
  from public.dealer_network_members
  where id = p_member_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'member_not_found';
  end if;


  -- Remove one-way friend relationships.
  delete from public.dealer_network_friends
  where owner_member_id = p_member_id
     or friend_member_id = p_member_id;


  -- Remove blocks in either direction.
  delete from public.dealer_network_blocks
  where blocker_member_id = p_member_id
     or blocked_member_id = p_member_id;


  -- Reports are administrative/member-account records and are not retained
  -- after deletion. Historical conversations/messages themselves remain.
  delete from public.dealer_network_reports
  where reporter_member_id = p_member_id
     or reported_member_id = p_member_id;


  -- Remove member suggestions.
  delete from public.dealer_network_suggestions
  where member_id = p_member_id;


  -- Remove brand relationships.
  delete from public.dealer_network_member_brands
  where member_id = p_member_id;


  -- Remove unfinished/staged message uploads.
  -- Completed message attachments remain with historical messages.
  delete from public.dealer_network_message_uploads
  where owner_member_id = p_member_id;


  -- Remove unfinished/staged troubleshooting uploads.
  -- Completed troubleshooting entries/photos remain.
  delete from public.dealer_network_troubleshooting_uploads
  where owner_member_id = p_member_id;


  -- Remove notification history tied directly to this member/application or
  -- to one of this member's conversations. Messages remain preserved.
  delete from public.dealer_network_notification_events
  where member_id = p_member_id
     or application_id = v_application_id
     or conversation_id in (
       select id
       from public.dealer_network_conversations
       where member_low_id = p_member_id
          or member_high_id = p_member_id
     );


  -- Remove internal status/audit events tied to the deleted identity.
  delete from public.dealer_network_status_events
  where member_id = p_member_id
     or application_id = v_application_id;


  -- Permanently remove all account authentication/session material.
  delete from dealer_network_private.sessions
  where member_id = p_member_id;

  delete from dealer_network_private.activation_tokens
  where member_id = p_member_id;

  delete from dealer_network_private.pin_reset_tokens
  where member_id = p_member_id;

  delete from dealer_network_private.credentials
  where member_id = p_member_id;


  -- Remove precise geocoding/location information.
  delete from dealer_network_private.member_locations
  where member_id = p_member_id;


  -- Troubleshooting knowledge is retained, but author/company identity is
  -- scrubbed from the snapshots.
  update public.dealer_network_troubleshooting_entries
  set
    member_name_snapshot = 'Deleted Member',
    company_name_snapshot = 'Deleted Member',
    updated_at = v_deleted_at
  where member_id = p_member_id;


  -- Remove application-owned relational data before deleting the application.
  if v_application_id is not null then
    delete from public.dealer_network_application_brands
    where application_id = v_application_id;

    delete from public.dealer_network_application_certifications
    where application_id = v_application_id;
  end if;


  -- Scrub the member row into a non-login, non-directory tombstone.
  -- Generic display values remain only so historical messaging joins can
  -- render "Deleted Member" instead of exposing or requiring old identity.
  update public.dealer_network_members
  set
    application_id = null,
    member_name = 'Deleted Member',
    company_name = 'Deleted Member',
    normalized_company_name = 'deleted member',
    phone = null,
    normalized_phone = null,
    email = null,
    normalized_email = null,
    address_line_1 = null,
    address_line_2 = null,
    city = null,
    state = null,
    zip_code = null,
    country = null,
    website_url = null,
    role = null,
    experience = null,
    service_region = null,
    introduction = null,
    logo_path = null,
    status = 'archived',
    account_locked = true,
    messaging_enabled = false,
    activated_at = null,
    suspended_at = null,
    archived_at = coalesce(archived_at, v_deleted_at),
    last_login_at = null,
    deleted_at = v_deleted_at,
    updated_at = v_deleted_at
  where id = p_member_id;


  -- The approved application itself is no longer needed once the tombstone
  -- has been detached from it.
  if v_application_id is not null then
    delete from public.dealer_network_applications
    where id = v_application_id;
  end if;


  return jsonb_build_object(
    'memberId', p_member_id,
    'applicationId', v_application_id,
    'deletedAt', v_deleted_at
  );
end;
$$;


revoke all on function public.dealer_network_delete_member(uuid)
  from public, anon, authenticated;

grant execute on function public.dealer_network_delete_member(uuid)
  to service_role;

commit;
