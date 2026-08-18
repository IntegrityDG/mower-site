-- ============================================================
-- IDS Dealer Network Broadcasts
-- One-way administrative announcements to active portal members.
-- ============================================================


-- ------------------------------------------------------------
-- Broadcast content
-- ------------------------------------------------------------

create table public.dealer_network_broadcasts (
  id uuid primary key default gen_random_uuid(),

  subject text not null
    check (
      char_length(btrim(subject)) between 1 and 180
    ),

  body text not null
    check (
      char_length(btrim(body)) between 1 and 5000
    ),

  recipient_count integer not null default 0
    check (recipient_count >= 0),

  created_at timestamptz not null default now(),
  sent_at timestamptz not null default now()
);

create index dealer_network_broadcasts_sent_idx
  on public.dealer_network_broadcasts
    (sent_at desc, id desc);


-- ------------------------------------------------------------
-- Individual recipient/read state
--
-- Recipients are snapshotted when the broadcast is created.
-- A member added later does not inherit older broadcasts.
-- ------------------------------------------------------------

create table public.dealer_network_broadcast_recipients (
  broadcast_id uuid not null
    references public.dealer_network_broadcasts(id)
    on delete cascade,

  member_id uuid not null
    references public.dealer_network_members(id)
    on delete cascade,

  read_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (broadcast_id, member_id)
);

create index dealer_network_broadcast_recipients_member_idx
  on public.dealer_network_broadcast_recipients
    (member_id, created_at desc);

create index dealer_network_broadcast_recipients_unread_idx
  on public.dealer_network_broadcast_recipients
    (member_id, created_at desc)
  where read_at is null;

create index dealer_network_broadcast_recipients_broadcast_idx
  on public.dealer_network_broadcast_recipients
    (broadcast_id, read_at);


-- ------------------------------------------------------------
-- Security boundary
--
-- Like the rest of Dealer Network messaging, browser roles do
-- not access these tables directly. Server-side IDS/member API
-- routes use the service role after their own authorization.
-- ------------------------------------------------------------

alter table public.dealer_network_broadcasts
  enable row level security;

alter table public.dealer_network_broadcasts
  force row level security;

alter table public.dealer_network_broadcast_recipients
  enable row level security;

alter table public.dealer_network_broadcast_recipients
  force row level security;

revoke all
  on table public.dealer_network_broadcasts
  from public, anon, authenticated, service_role;

revoke all
  on table public.dealer_network_broadcast_recipients
  from public, anon, authenticated, service_role;

grant select, insert, update, delete
  on table public.dealer_network_broadcasts
  to service_role;

grant select, insert, update, delete
  on table public.dealer_network_broadcast_recipients
  to service_role;


-- ------------------------------------------------------------
-- Notification-event integration
--
-- Existing notification events provide idempotent email
-- delivery, failure recording, and admin retry support.
-- ------------------------------------------------------------

alter table public.dealer_network_notification_events
  drop constraint
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
      'member_broadcast'
    )
  );

alter table public.dealer_network_notification_events
  add column broadcast_id uuid
    references public.dealer_network_broadcasts(id)
    on delete restrict;

create index dealer_network_notifications_broadcast_idx
  on public.dealer_network_notification_events
    (broadcast_id, created_at desc);


-- ------------------------------------------------------------
-- Create + snapshot broadcast
--
-- messaging_enabled is intentionally NOT checked.
-- That switch governs peer-to-peer messaging, not mandatory
-- IDS administrative announcements.
-- ------------------------------------------------------------

create function public.dealer_network_create_broadcast(
  p_subject text,
  p_body text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  broadcast_id uuid;
  recipient_total integer := 0;
  clean_subject text :=
    btrim(coalesce(p_subject, ''));
  clean_body text :=
    btrim(coalesce(p_body, ''));
begin
  if char_length(clean_subject)
      not between 1 and 180 then
    raise exception 'invalid_broadcast_subject';
  end if;

  if char_length(clean_body)
      not between 1 and 5000 then
    raise exception 'invalid_broadcast_body';
  end if;

  insert into public.dealer_network_broadcasts (
    subject,
    body
  )
  values (
    clean_subject,
    clean_body
  )
  returning id into broadcast_id;

  insert into
    public.dealer_network_broadcast_recipients (
      broadcast_id,
      member_id
    )
  select
    broadcast_id,
    member.id
  from public.dealer_network_members member
  where
    member.status = 'active'
    and member.account_locked = false
    and member.deleted_at is null;

  get diagnostics
    recipient_total = row_count;

  update public.dealer_network_broadcasts
  set recipient_count = recipient_total
  where id = broadcast_id;

  return jsonb_build_object(
    'broadcastId',
    broadcast_id,
    'recipientCount',
    recipient_total
  );
end
$$;


-- ------------------------------------------------------------
-- Mark one recipient's broadcast as read
-- ------------------------------------------------------------

create function public.dealer_network_mark_broadcast_read(
  p_broadcast_id uuid,
  p_member_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  update public.dealer_network_broadcast_recipients
  set
    read_at = coalesce(read_at, now()),
    updated_at = now()
  where
    broadcast_id = p_broadcast_id
    and member_id = p_member_id;

  return found;
end
$$;


-- ------------------------------------------------------------
-- RPC access
-- ------------------------------------------------------------

revoke all
  on function
    public.dealer_network_create_broadcast(text, text)
  from public, anon, authenticated;

revoke all
  on function
    public.dealer_network_mark_broadcast_read(uuid, uuid)
  from public, anon, authenticated;

grant execute
  on function
    public.dealer_network_create_broadcast(text, text)
  to service_role;

grant execute
  on function
    public.dealer_network_mark_broadcast_read(uuid, uuid)
  to service_role;
