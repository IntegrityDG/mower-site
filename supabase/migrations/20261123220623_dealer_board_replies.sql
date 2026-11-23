-- Bound future Board conversations while leaving all historical rows untouched.
create table public.dealer_network_board_comment_uploads (
  id uuid primary key default gen_random_uuid(),
  owner_member_id uuid not null references public.dealer_network_members(id) on delete restrict,
  discussion_id uuid not null references public.dealer_network_discussions(id) on delete restrict,
  parent_comment_id uuid,
  storage_path text not null unique,
  declared_content_type text not null check (declared_content_type in ('image/jpeg','image/png','image/webp','image/heic','image/heif')),
  declared_byte_size integer not null check (declared_byte_size > 0 and declared_byte_size <= 15728640),
  check (storage_path = ('staging/' || owner_member_id || '/' || discussion_id || '/' || id)),
  status text not null default 'prepared' check (status in ('prepared','processing','ready','consumed','failed')),
  verified_path text unique,
  width integer check (width between 1 and 4096),
  height integer check (height between 1 and 4096),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  foreign key (discussion_id,parent_comment_id)
    references public.dealer_network_discussion_comments(discussion_id,id) on delete restrict,
  check (status not in ('ready','consumed') or (verified_path is not null and width is not null and height is not null))
);
create index dealer_network_board_upload_expiry_idx
  on public.dealer_network_board_comment_uploads (expires_at) where status <> 'consumed';
create index dealer_network_board_upload_owner_idx
  on public.dealer_network_board_comment_uploads (owner_member_id);
create index dealer_network_board_upload_context_idx
  on public.dealer_network_board_comment_uploads (discussion_id,parent_comment_id);

create table public.dealer_network_board_comment_attachments (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.dealer_network_discussion_comments(id) on delete restrict,
  storage_path text not null unique,
  width integer not null check (width between 1 and 4096),
  height integer not null check (height between 1 and 4096),
  position smallint not null check (position between 0 and 2),
  unique (comment_id,position)
);
alter table public.dealer_network_board_comment_uploads enable row level security;
alter table public.dealer_network_board_comment_uploads force row level security;
alter table public.dealer_network_board_comment_attachments enable row level security;
alter table public.dealer_network_board_comment_attachments force row level security;
revoke all on public.dealer_network_board_comment_uploads, public.dealer_network_board_comment_attachments
  from public,anon,authenticated,service_role;
grant select,insert,update,delete on public.dealer_network_board_comment_uploads to service_role;
grant select,insert on public.dealer_network_board_comment_attachments to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('dealer-network-board-private','dealer-network-board-private',false,15728640,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

create index dealer_network_board_visible_comments_idx
  on public.dealer_network_discussion_comments(discussion_id,parent_comment_id,id)
  where deleted_at is null and removed_at is null;

-- All member writes require membership and today's account state, not just
-- the topic's recipient snapshot. Keep the account row stable through commit.
create function dealer_network_private.require_board_comment_member(p_topic_id uuid,p_member_id uuid)
returns void language plpgsql security invoker set search_path=''
as $$
begin
  perform 1 from public.dealer_network_members
    where id=p_member_id and status='active' and not account_locked and deleted_at is null
    for share;
  if not found or not exists(select 1 from public.dealer_network_board_topic_recipients
    where topic_id=p_topic_id and member_id=p_member_id) then
    raise exception 'not_recipient';
  end if;
end
$$;

-- Remove the old overload rather than leaving a way around attachments/limits.
drop function public.dealer_network_add_board_comment(uuid,uuid,text,uuid);
create function public.dealer_network_add_board_comment(
  p_discussion_id uuid, p_member_id uuid, p_body text, p_parent_id uuid default null,
  p_upload_ids uuid[] default '{}'::uuid[]
) returns uuid language plpgsql security invoker set search_path=''
as $$
declare
  v_topic_id uuid;
  v_new_id uuid;
  v_parent public.dealer_network_discussion_comments%rowtype;
  v_upload public.dealer_network_board_comment_uploads%rowtype;
  v_ids uuid[] := coalesce(p_upload_ids,'{}'::uuid[]);
  v_upload_id uuid;
  v_body text := regexp_replace(coalesce(p_body,''),'^[[:space:]]+|[[:space:]]+$','','g');
begin
  if char_length(v_body) not between 1 and (case when p_parent_id is null then 200 else 150 end)
  then raise exception 'invalid_comment'; end if;
  if coalesce(array_ndims(v_ids),1) <> 1
    or cardinality(v_ids) > (case when p_parent_id is null then 3 else 1 end)
    or (select count(distinct id) from unnest(v_ids) as x(id)) <> cardinality(v_ids)
  then raise exception 'invalid_uploads'; end if;

  select topic_id into v_topic_id from public.dealer_network_discussions where id=p_discussion_id;
  if not found then raise exception 'discussion_closed'; end if;
  -- Lock member before topic (same order as member deletion), then topic,
  -- discussion, and any parent. The topic lock coordinates status edits.
  perform dealer_network_private.require_board_comment_member(v_topic_id,p_member_id);
  perform 1 from public.dealer_network_board_topics where id=v_topic_id and status='active' for update;
  if not found then raise exception 'discussion_closed'; end if;
  perform 1 from public.dealer_network_discussions where id=p_discussion_id and topic_id=v_topic_id and status='open' for update;
  if not found then raise exception 'discussion_closed'; end if;

  if p_parent_id is null then
    -- A tombstone gives surviving replies a home without allowing new replies.
    if (select count(*) from public.dealer_network_discussion_comments as top
      where top.discussion_id=p_discussion_id and top.parent_comment_id is null and
        ((top.deleted_at is null and top.removed_at is null) or
        exists(select 1 from public.dealer_network_discussion_comments as reply
          where reply.discussion_id=p_discussion_id and reply.parent_comment_id=top.id
            and reply.deleted_at is null and reply.removed_at is null))) >= 5
    then raise exception 'comment_limit'; end if;
  else
    select * into v_parent from public.dealer_network_discussion_comments
      where discussion_id=p_discussion_id and id=p_parent_id for update;
    if not found or v_parent.parent_comment_id is not null or v_parent.deleted_at is not null or v_parent.removed_at is not null
    then raise exception 'invalid_parent'; end if;
    if (select count(*) from public.dealer_network_discussion_comments
      where discussion_id=p_discussion_id and parent_comment_id=p_parent_id
        and deleted_at is null and removed_at is null) >= 5
    then raise exception 'reply_limit'; end if;
  end if;

  -- Lock only actor-owned ready tickets scoped to this exact thread and parent.
  -- Recheck expiry at lock acquisition, not transaction start.
  foreach v_upload_id in array v_ids loop
    select * into v_upload from public.dealer_network_board_comment_uploads
      where id=v_upload_id and owner_member_id=p_member_id and discussion_id=p_discussion_id
        and parent_comment_id is not distinct from p_parent_id and status='ready' for update;
    if not found or v_upload.expires_at <= clock_timestamp()
      or v_upload.verified_path is distinct from ('verified/' || p_member_id || '/' || p_discussion_id || '/' || v_upload_id || '.jpg')
      or v_upload.width is null or v_upload.height is null
    then raise exception 'invalid_uploads'; end if;
  end loop;

  insert into public.dealer_network_discussion_comments(discussion_id,parent_comment_id,author_member_id,body)
    values(p_discussion_id,p_parent_id,p_member_id,v_body) returning id into v_new_id;
  insert into public.dealer_network_board_comment_attachments(comment_id,storage_path,width,height,position)
    select v_new_id,u.verified_path,u.width,u.height,(ordered.ordinality-1)::smallint
    from unnest(v_ids) with ordinality as ordered(id,ordinality)
    join public.dealer_network_board_comment_uploads as u on u.id=ordered.id;
  update public.dealer_network_board_comment_uploads set status='consumed',updated_at=now()
    where id=any(v_ids);
  return v_new_id;
end
$$;

create or replace function public.dealer_network_update_board_comment(
  p_comment_id uuid,p_member_id uuid,p_body text,p_delete boolean default false
) returns void language plpgsql security invoker set search_path=''
as $$
declare
  v_discussion_id uuid;
  v_topic_id uuid;
  v_comment public.dealer_network_discussion_comments%rowtype;
  v_body text := regexp_replace(coalesce(p_body,''),'^[[:space:]]+|[[:space:]]+$','','g');
begin
  select c.discussion_id,d.topic_id into v_discussion_id,v_topic_id
    from public.dealer_network_discussion_comments c
    join public.dealer_network_discussions d on d.id=c.discussion_id
    where c.id=p_comment_id and c.author_member_id=p_member_id;
  if not found then raise exception 'comment_unavailable'; end if;
  perform dealer_network_private.require_board_comment_member(v_topic_id,p_member_id);
  perform 1 from public.dealer_network_board_topics where id=v_topic_id and status='active' for update;
  if not found then raise exception 'discussion_closed'; end if;
  perform 1 from public.dealer_network_discussions where id=v_discussion_id and topic_id=v_topic_id and status='open' for update;
  if not found then raise exception 'discussion_closed'; end if;
  select * into v_comment from public.dealer_network_discussion_comments
    where id=p_comment_id and discussion_id=v_discussion_id and author_member_id=p_member_id for update;
  if not found or v_comment.deleted_at is not null or v_comment.removed_at is not null
    then raise exception 'comment_unavailable'; end if;
  if p_delete then
    update public.dealer_network_discussion_comments set deleted_at=now(),updated_at=now() where id=p_comment_id;
  else
    if char_length(v_body) not between 1 and (case when v_comment.parent_comment_id is null then 200 else 150 end)
      then raise exception 'invalid_comment'; end if;
    update public.dealer_network_discussion_comments set body=v_body,edited_at=now(),updated_at=now() where id=p_comment_id;
  end if;
end
$$;

create or replace function public.dealer_network_moderate_board_comment(
  p_topic_id uuid,p_discussion_id uuid,p_comment_id uuid,p_reason text
) returns void language plpgsql security invoker set search_path=''
as $$
declare v_reason text := nullif(btrim(coalesce(p_reason,'')),'');
begin
  if char_length(v_reason) > 500 then raise exception 'invalid_comment'; end if;
  -- IDS moderation is allowed even on closed or archived topics.
  perform 1 from public.dealer_network_board_topics where id=p_topic_id for update;
  if not found then raise exception 'topic_not_moderatable'; end if;
  perform 1 from public.dealer_network_discussions where id=p_discussion_id and topic_id=p_topic_id for update;
  if not found then raise exception 'invalid_discussion'; end if;
  update public.dealer_network_discussion_comments set removed_at=now(),removed_reason=v_reason,updated_at=now()
    where id=p_comment_id and discussion_id=p_discussion_id and deleted_at is null and removed_at is null;
  if not found then raise exception 'comment_unavailable'; end if;
end
$$;

create function public.dealer_network_update_board_topic(
  p_topic_id uuid,p_title text,p_announcement_body text,p_discussion_context text
) returns void language plpgsql security invoker set search_path=''
as $$
declare
  v_title text := regexp_replace(coalesce(p_title,''),'^[[:space:]]+|[[:space:]]+$','','g');
  v_announcement text := regexp_replace(p_announcement_body,'^[[:space:]]+|[[:space:]]+$','','g');
  v_context text := regexp_replace(p_discussion_context,'^[[:space:]]+|[[:space:]]+$','','g');
begin
  if char_length(v_title) not between 1 and 180
    or (v_announcement is not null and char_length(v_announcement) not between 1 and 5000)
    or char_length(v_context)>5000 then raise exception 'invalid_topic'; end if;
  perform 1 from public.dealer_network_board_topics where id=p_topic_id and status in ('draft','active') for update;
  if not found then raise exception 'topic_not_editable'; end if;
  if p_discussion_context is not null then
    update public.dealer_network_discussions set context=v_context,updated_at=now()
      where topic_id=p_topic_id;
    if not found then raise exception 'discussion_unavailable'; end if;
  end if;
  if p_announcement_body is not null then
    update public.dealer_network_broadcasts set body=v_announcement where topic_id=p_topic_id;
    if not found then raise exception 'announcement_unavailable'; end if;
  end if;
  update public.dealer_network_board_topics set title=v_title,updated_at=now() where id=p_topic_id;
end
$$;

revoke all on function dealer_network_private.require_board_comment_member(uuid,uuid),
  public.dealer_network_add_board_comment(uuid,uuid,text,uuid,uuid[]),
  public.dealer_network_update_board_comment(uuid,uuid,text,boolean),
  public.dealer_network_moderate_board_comment(uuid,uuid,uuid,text),
  public.dealer_network_update_board_topic(uuid,text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function dealer_network_private.require_board_comment_member(uuid,uuid),
  public.dealer_network_add_board_comment(uuid,uuid,text,uuid,uuid[]),
  public.dealer_network_update_board_comment(uuid,uuid,text,boolean),
  public.dealer_network_moderate_board_comment(uuid,uuid,uuid,text),
  public.dealer_network_update_board_topic(uuid,text,text,text)
  to service_role;
