alter table public.dealer_network_members
  add column messaging_enabled boolean not null default true;

create table public.dealer_network_friends (
  id uuid primary key default gen_random_uuid(),
  owner_member_id uuid not null references public.dealer_network_members(id) on delete restrict,
  friend_member_id uuid not null references public.dealer_network_members(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (owner_member_id, friend_member_id),
  check (owner_member_id <> friend_member_id)
);
create index dealer_network_friends_owner_idx
  on public.dealer_network_friends (owner_member_id, created_at desc);

create table public.dealer_network_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_member_id uuid not null references public.dealer_network_members(id) on delete restrict,
  blocked_member_id uuid not null references public.dealer_network_members(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (blocker_member_id, blocked_member_id),
  check (blocker_member_id <> blocked_member_id)
);
create index dealer_network_blocks_blocker_idx
  on public.dealer_network_blocks (blocker_member_id, created_at desc);
create index dealer_network_blocks_blocked_idx
  on public.dealer_network_blocks (blocked_member_id, created_at desc);

create table public.dealer_network_conversations (
  id uuid primary key default gen_random_uuid(),
  member_low_id uuid not null references public.dealer_network_members(id) on delete restrict,
  member_high_id uuid not null references public.dealer_network_members(id) on delete restrict,
  last_message_id uuid,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_low_id, member_high_id),
  check (member_low_id < member_high_id)
);
create index dealer_network_conversations_low_activity_idx
  on public.dealer_network_conversations (member_low_id, last_message_at desc nulls last);
create index dealer_network_conversations_high_activity_idx
  on public.dealer_network_conversations (member_high_id, last_message_at desc nulls last);

create table public.dealer_network_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.dealer_network_conversations(id) on delete restrict,
  sender_member_id uuid not null references public.dealer_network_members(id) on delete restrict,
  client_message_id uuid not null,
  body text,
  attachment_count smallint not null default 0,
  starts_unread_streak boolean not null default false,
  created_at timestamptz not null default now(),
  unique (sender_member_id, client_message_id),
  check (body is null or char_length(body) between 1 and 5000),
  check (attachment_count between 0 and 3),
  check (body is not null or attachment_count > 0)
);
create index dealer_network_messages_conversation_idx
  on public.dealer_network_messages (conversation_id, created_at desc, id desc);
create index dealer_network_messages_sender_idx
  on public.dealer_network_messages (sender_member_id, created_at desc);

alter table public.dealer_network_conversations
  add constraint dealer_network_conversations_last_message_fk
  foreign key (last_message_id) references public.dealer_network_messages(id) on delete restrict;

create table public.dealer_network_conversation_members (
  conversation_id uuid not null references public.dealer_network_conversations(id) on delete restrict,
  member_id uuid not null references public.dealer_network_members(id) on delete restrict,
  unread_count integer not null default 0,
  last_read_message_id uuid references public.dealer_network_messages(id) on delete restrict,
  last_read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (conversation_id, member_id),
  check (unread_count >= 0)
);
create index dealer_network_conversation_members_unread_idx
  on public.dealer_network_conversation_members (member_id, unread_count, updated_at desc);

create table public.dealer_network_message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.dealer_network_messages(id) on delete restrict,
  storage_path text not null unique,
  content_type text not null default 'image/jpeg' check (content_type = 'image/jpeg'),
  byte_size integer not null check (byte_size between 1 and 15728640),
  original_content_type text not null check (original_content_type in ('image/jpeg','image/png','image/webp','image/heic','image/heif')),
  original_byte_size integer not null check (original_byte_size between 1 and 15728640),
  width integer not null check (width between 1 and 2560),
  height integer not null check (height between 1 and 2560),
  position smallint not null check (position between 0 and 2),
  created_at timestamptz not null default now(),
  unique (message_id, position),
  check (storage_path ~ '^conversations/[0-9a-f-]+/messages/[0-9a-f-]+/[0-9a-f-]+\.jpg$')
);
create index dealer_network_message_attachments_message_idx
  on public.dealer_network_message_attachments (message_id, position);

create table public.dealer_network_message_uploads (
  id uuid primary key default gen_random_uuid(),
  owner_member_id uuid not null references public.dealer_network_members(id) on delete restrict,
  conversation_id uuid not null references public.dealer_network_conversations(id) on delete restrict,
  storage_path text not null unique,
  declared_content_type text not null check (declared_content_type in ('image/jpeg','image/png','image/webp','image/heic','image/heif')),
  declared_byte_size integer not null check (declared_byte_size between 1 and 15728640),
  status text not null default 'prepared' check (status in ('prepared','processing','consumed','failed','expired')),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (storage_path ~ '^staging/[0-9a-f-]+/[0-9a-f-]+/[0-9a-f-]+$'),
  check ((status = 'consumed') = (consumed_at is not null))
);
create index dealer_network_message_uploads_owner_idx
  on public.dealer_network_message_uploads (owner_member_id, status, expires_at);
create index dealer_network_message_uploads_expiry_idx
  on public.dealer_network_message_uploads (status, expires_at);

create table public.dealer_network_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_member_id uuid not null references public.dealer_network_members(id) on delete restrict,
  reported_member_id uuid not null references public.dealer_network_members(id) on delete restrict,
  conversation_id uuid not null references public.dealer_network_conversations(id) on delete restrict,
  reported_through_message_id uuid references public.dealer_network_messages(id) on delete restrict,
  client_report_id uuid not null,
  reason text not null check (char_length(reason) between 5 and 2000),
  status text not null default 'new' check (status in ('new','reviewed','resolved')),
  admin_note text check (admin_note is null or char_length(admin_note) <= 3000),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  resolved_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (reporter_member_id, client_report_id),
  check (reporter_member_id <> reported_member_id),
  check (status <> 'reviewed' or reviewed_at is not null),
  check (status <> 'resolved' or resolved_at is not null)
);
create index dealer_network_reports_status_idx
  on public.dealer_network_reports (status, created_at desc);
create index dealer_network_reports_conversation_idx
  on public.dealer_network_reports (conversation_id, created_at desc);

alter table public.dealer_network_notification_events
  drop constraint dealer_network_notification_events_event_type_check,
  add constraint dealer_network_notification_events_event_type_check
    check (event_type in ('ids_new_application','applicant_activation','applicant_denied','applicant_more_information','member_pin_reset','member_new_message')),
  add column conversation_id uuid references public.dealer_network_conversations(id) on delete restrict,
  add column message_id uuid references public.dealer_network_messages(id) on delete restrict;
create index dealer_network_notifications_conversation_idx
  on public.dealer_network_notification_events (conversation_id, created_at desc);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'dealer_network_friends','dealer_network_blocks','dealer_network_conversations',
    'dealer_network_messages','dealer_network_conversation_members',
    'dealer_network_message_attachments','dealer_network_message_uploads','dealer_network_reports'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', table_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
  end loop;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'dealer-network-messages-private',
  'dealer-network-messages-private',
  false,
  15728640,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.dealer_network_read_session(p_token_hash text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public,dealer_network_private as $$
declare result jsonb; session_id uuid;
begin
  select s.id,jsonb_build_object(
    'memberId',m.id,'memberName',m.member_name,'companyName',m.company_name,
    'status',m.status,'accountLocked',m.account_locked,
    'messagingEnabled',m.messaging_enabled,'expiresAt',s.expires_at
  )
  into session_id,result from dealer_network_private.sessions s
  join public.dealer_network_members m on m.id=s.member_id
  where s.token_hash=p_token_hash and s.revoked_at is null and s.expires_at>now();
  if session_id is not null then
    update dealer_network_private.sessions set last_seen_at=now() where id=session_id;
  end if;
  return result;
end $$;

create function public.dealer_network_get_or_create_conversation(
  p_member_id uuid,
  p_other_member_id uuid
) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
  conversation public.dealer_network_conversations;
  low_id uuid := least(p_member_id,p_other_member_id);
  high_id uuid := greatest(p_member_id,p_other_member_id);
begin
  if p_member_id=p_other_member_id then raise exception 'invalid_recipient'; end if;
  if not exists(
    select 1 from public.dealer_network_members
    where id=p_member_id and status='active' and account_locked=false and messaging_enabled=true
  ) then raise exception 'sender_unavailable'; end if;
  if not exists(
    select 1 from public.dealer_network_members
    where id=p_other_member_id and status='active' and account_locked=false
  ) then raise exception 'recipient_unavailable'; end if;
  if exists(
    select 1 from public.dealer_network_blocks
    where (blocker_member_id=p_member_id and blocked_member_id=p_other_member_id)
       or (blocker_member_id=p_other_member_id and blocked_member_id=p_member_id)
  ) then raise exception 'recipient_unavailable'; end if;

  insert into public.dealer_network_conversations(member_low_id,member_high_id)
  values(low_id,high_id)
  on conflict(member_low_id,member_high_id) do update set updated_at=public.dealer_network_conversations.updated_at
  returning * into conversation;
  insert into public.dealer_network_conversation_members(conversation_id,member_id)
  values(conversation.id,low_id),(conversation.id,high_id)
  on conflict(conversation_id,member_id) do nothing;
  return jsonb_build_object('conversationId',conversation.id);
end $$;

create function public.dealer_network_add_friend(p_owner_member_id uuid, p_friend_member_id uuid)
returns boolean language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
  if p_owner_member_id=p_friend_member_id then raise exception 'invalid_friend'; end if;
  if not exists(
    select 1 from public.dealer_network_members
    where id=p_friend_member_id and status='active' and account_locked=false
  ) then raise exception 'member_unavailable'; end if;
  insert into public.dealer_network_friends(owner_member_id,friend_member_id)
  values(p_owner_member_id,p_friend_member_id) on conflict do nothing;
  return true;
end $$;

create function public.dealer_network_remove_friend(p_owner_member_id uuid, p_friend_member_id uuid)
returns boolean language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
  delete from public.dealer_network_friends
  where owner_member_id=p_owner_member_id and friend_member_id=p_friend_member_id;
  return true;
end $$;

create function public.dealer_network_set_block(p_blocker_member_id uuid, p_blocked_member_id uuid, p_blocked boolean)
returns boolean language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
  if p_blocker_member_id=p_blocked_member_id then raise exception 'invalid_block'; end if;
  if p_blocked then
    if not exists(select 1 from public.dealer_network_members where id=p_blocked_member_id) then
      raise exception 'member_unavailable';
    end if;
    insert into public.dealer_network_blocks(blocker_member_id,blocked_member_id)
    values(p_blocker_member_id,p_blocked_member_id) on conflict do nothing;
  else
    delete from public.dealer_network_blocks
    where blocker_member_id=p_blocker_member_id and blocked_member_id=p_blocked_member_id;
  end if;
  return true;
end $$;

create function public.dealer_network_send_message(
  p_conversation_id uuid,
  p_sender_member_id uuid,
  p_client_message_id uuid,
  p_body text,
  p_attachments jsonb
) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
  conversation public.dealer_network_conversations;
  existing_message public.dealer_network_messages;
  new_message public.dealer_network_messages;
  recipient_id uuid;
  prior_unread integer;
  attachment jsonb;
  attachment_total integer := coalesce(jsonb_array_length(coalesce(p_attachments,'[]'::jsonb)),0);
  clean_body text := nullif(btrim(coalesce(p_body,'')),'');
begin
  select * into existing_message from public.dealer_network_messages
  where sender_member_id=p_sender_member_id and client_message_id=p_client_message_id;
  if found then
    if existing_message.conversation_id<>p_conversation_id then raise exception 'message_conflict'; end if;
    select * into conversation from public.dealer_network_conversations
    where id=existing_message.conversation_id;
    return jsonb_build_object(
      'messageId',existing_message.id,'recipientMemberId',
      case when conversation.member_low_id=p_sender_member_id then conversation.member_high_id else conversation.member_low_id end,
      'startsUnreadStreak',existing_message.starts_unread_streak,'duplicate',true
    );
  end if;

  select * into conversation from public.dealer_network_conversations
  where id=p_conversation_id for update;
  if not found or p_sender_member_id not in (conversation.member_low_id,conversation.member_high_id) then
    raise exception 'conversation_unavailable';
  end if;
  recipient_id := case when conversation.member_low_id=p_sender_member_id then conversation.member_high_id else conversation.member_low_id end;
  if not exists(
    select 1 from public.dealer_network_members
    where id=p_sender_member_id and status='active' and account_locked=false and messaging_enabled=true
  ) then raise exception 'sender_unavailable'; end if;
  if not exists(
    select 1 from public.dealer_network_members
    where id=recipient_id and status='active' and account_locked=false
  ) then raise exception 'recipient_unavailable'; end if;
  if exists(
    select 1 from public.dealer_network_blocks
    where (blocker_member_id=p_sender_member_id and blocked_member_id=recipient_id)
       or (blocker_member_id=recipient_id and blocked_member_id=p_sender_member_id)
  ) then raise exception 'recipient_unavailable'; end if;
  if attachment_total>3 or (clean_body is null and attachment_total=0) or char_length(clean_body)>5000 then
    raise exception 'invalid_message';
  end if;

  select unread_count into prior_unread from public.dealer_network_conversation_members
  where conversation_id=p_conversation_id and member_id=recipient_id for update;
  insert into public.dealer_network_messages(
    conversation_id,sender_member_id,client_message_id,body,attachment_count,starts_unread_streak
  ) values(
    p_conversation_id,p_sender_member_id,p_client_message_id,clean_body,attachment_total,coalesce(prior_unread,0)=0
  ) returning * into new_message;

  for attachment in select value from jsonb_array_elements(coalesce(p_attachments,'[]'::jsonb)) loop
    if attachment->>'storagePath' not like
      'conversations/'||p_conversation_id::text||'/messages/'||p_client_message_id::text||'/%' then
      raise exception 'invalid_attachment_path';
    end if;
    insert into public.dealer_network_message_attachments(
      message_id,storage_path,content_type,byte_size,original_content_type,
      original_byte_size,width,height,position
    ) values(
      new_message.id,attachment->>'storagePath',attachment->>'contentType',
      (attachment->>'byteSize')::integer,attachment->>'originalContentType',
      (attachment->>'originalByteSize')::integer,(attachment->>'width')::integer,
      (attachment->>'height')::integer,(attachment->>'position')::smallint
    );
  end loop;

  update public.dealer_network_conversation_members
  set unread_count=0,last_read_message_id=new_message.id,last_read_at=now(),updated_at=now()
  where conversation_id=p_conversation_id and member_id=p_sender_member_id;
  update public.dealer_network_conversation_members
  set unread_count=unread_count+1,updated_at=now()
  where conversation_id=p_conversation_id and member_id=recipient_id;
  update public.dealer_network_conversations
  set last_message_id=new_message.id,last_message_at=new_message.created_at,updated_at=now()
  where id=p_conversation_id;
  return jsonb_build_object(
    'messageId',new_message.id,'recipientMemberId',recipient_id,
    'startsUnreadStreak',new_message.starts_unread_streak,'duplicate',false
  );
end $$;

create function public.dealer_network_mark_conversation_read(
  p_conversation_id uuid,
  p_member_id uuid,
  p_last_visible_message_id uuid
)
returns integer language plpgsql security invoker set search_path=pg_catalog,public as $$
declare read_created_at timestamptz; remaining_unread integer;
begin
  perform 1 from public.dealer_network_conversations
    where id=p_conversation_id and p_member_id in (member_low_id,member_high_id)
    for update;
  if not found then raise exception 'conversation_unavailable'; end if;
  if p_last_visible_message_id is null then
    if exists(select 1 from public.dealer_network_messages where conversation_id=p_conversation_id) then
      raise exception 'invalid_read_marker';
    end if;
    remaining_unread := 0;
  else
    select created_at into read_created_at from public.dealer_network_messages
    where id=p_last_visible_message_id and conversation_id=p_conversation_id;
    if not found then raise exception 'invalid_read_marker'; end if;
    select count(*)::integer into remaining_unread
    from public.dealer_network_messages
    where conversation_id=p_conversation_id
      and sender_member_id<>p_member_id
      and (created_at>read_created_at or (created_at=read_created_at and id>p_last_visible_message_id));
  end if;
  update public.dealer_network_conversation_members
  set unread_count=remaining_unread,last_read_message_id=p_last_visible_message_id,last_read_at=now(),updated_at=now()
  where conversation_id=p_conversation_id and member_id=p_member_id;
  return remaining_unread;
end $$;

create function public.dealer_network_create_report(
  p_reporter_member_id uuid,
  p_conversation_id uuid,
  p_client_report_id uuid,
  p_reason text
) returns uuid language plpgsql security invoker set search_path=pg_catalog,public as $$
declare conversation public.dealer_network_conversations; report_id uuid; reported_id uuid;
begin
  select id into report_id from public.dealer_network_reports
  where reporter_member_id=p_reporter_member_id and client_report_id=p_client_report_id;
  if found then return report_id; end if;
  select * into conversation from public.dealer_network_conversations where id=p_conversation_id;
  if not found or p_reporter_member_id not in (conversation.member_low_id,conversation.member_high_id) then
    raise exception 'conversation_unavailable';
  end if;
  if char_length(btrim(coalesce(p_reason,''))) not between 5 and 2000 then raise exception 'invalid_report'; end if;
  reported_id := case when conversation.member_low_id=p_reporter_member_id then conversation.member_high_id else conversation.member_low_id end;
  insert into public.dealer_network_reports(
    reporter_member_id,reported_member_id,conversation_id,reported_through_message_id,client_report_id,reason
  ) values(
    p_reporter_member_id,reported_id,p_conversation_id,conversation.last_message_id,p_client_report_id,btrim(p_reason)
  ) returning id into report_id;
  return report_id;
end $$;

revoke all on function public.dealer_network_read_session(text) from public,anon,authenticated;
revoke all on function public.dealer_network_get_or_create_conversation(uuid,uuid) from public,anon,authenticated;
revoke all on function public.dealer_network_add_friend(uuid,uuid) from public,anon,authenticated;
revoke all on function public.dealer_network_remove_friend(uuid,uuid) from public,anon,authenticated;
revoke all on function public.dealer_network_set_block(uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function public.dealer_network_send_message(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.dealer_network_mark_conversation_read(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.dealer_network_create_report(uuid,uuid,uuid,text) from public,anon,authenticated;

grant execute on function public.dealer_network_read_session(text) to service_role;
grant execute on function public.dealer_network_get_or_create_conversation(uuid,uuid) to service_role;
grant execute on function public.dealer_network_add_friend(uuid,uuid) to service_role;
grant execute on function public.dealer_network_remove_friend(uuid,uuid) to service_role;
grant execute on function public.dealer_network_set_block(uuid,uuid,boolean) to service_role;
grant execute on function public.dealer_network_send_message(uuid,uuid,uuid,text,jsonb) to service_role;
grant execute on function public.dealer_network_mark_conversation_read(uuid,uuid,uuid) to service_role;
grant execute on function public.dealer_network_create_report(uuid,uuid,uuid,text) to service_role;
