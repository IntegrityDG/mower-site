-- Unified Dealer Network Board: announcement + poll + discussion = one topic.
create table public.dealer_network_board_topics (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 180),
  status text not null default 'draft' check (status in ('draft','active','closed','archived')),
  source_suggestion_id uuid references public.dealer_network_suggestions(id) on delete set null,
  activated_at timestamptz, closed_at timestamptz, archived_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index dealer_network_board_topics_status_idx on public.dealer_network_board_topics(status, created_at desc);
create unique index dealer_network_board_topics_source_suggestion_idx
  on public.dealer_network_board_topics(source_suggestion_id)
  where source_suggestion_id is not null;

alter table public.dealer_network_broadcasts
  add column topic_id uuid
  references public.dealer_network_board_topics(id)
  on delete restrict;
create unique index dealer_network_broadcasts_topic_idx
  on public.dealer_network_broadcasts(topic_id)
  where topic_id is not null;

create table public.dealer_network_board_topic_recipients (
  topic_id uuid not null references public.dealer_network_board_topics(id) on delete cascade,
  member_id uuid not null references public.dealer_network_members(id) on delete restrict,
  first_read_at timestamptz, last_read_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key(topic_id, member_id)
);
create index dealer_network_board_recipients_member_idx on public.dealer_network_board_topic_recipients(member_id, created_at desc);

create table public.dealer_network_polls (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null unique
    references public.dealer_network_board_topics(id)
    on delete cascade,
  question text not null check (char_length(btrim(question)) between 1 and 500),
  explanation text not null default '' check (char_length(explanation) <= 5000),
  status text not null default 'open' check (status in ('open','closed')),
  allow_vote_change boolean not null default false, closes_at timestamptz, closed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.dealer_network_polls
  add constraint dealer_network_poll_closes_after_create
  check (closes_at is null or closes_at > created_at);
create table public.dealer_network_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null
    references public.dealer_network_polls(id)
    on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 200), position smallint not null check(position between 0 and 9),
  created_at timestamptz not null default now(), unique(poll_id,id), unique(poll_id,position)
);
create table public.dealer_network_poll_votes (
  poll_id uuid not null references public.dealer_network_polls(id) on delete restrict,
  option_id uuid not null, member_id uuid not null references public.dealer_network_members(id) on delete restrict,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key(poll_id,member_id), foreign key(poll_id,option_id) references public.dealer_network_poll_options(poll_id,id) on delete restrict
);

create table public.dealer_network_discussions (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null unique
    references public.dealer_network_board_topics(id)
    on delete cascade,
  context text not null default '' check(char_length(context)<=5000), status text not null default 'open' check(status in ('open','closed')),
  closed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.dealer_network_discussion_comments (
  id uuid primary key default gen_random_uuid(), discussion_id uuid not null references public.dealer_network_discussions(id) on delete restrict,
  parent_comment_id uuid references public.dealer_network_discussion_comments(id) on delete restrict,
  author_member_id uuid not null references public.dealer_network_members(id) on delete restrict,
  body text not null check(char_length(btrim(body)) between 1 and 5000),
  edited_at timestamptz, deleted_at timestamptz, removed_at timestamptz, removed_reason text check(char_length(removed_reason)<=500),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(discussion_id,id)
);
alter table public.dealer_network_discussion_comments
  add constraint dealer_network_comment_parent_same_discussion
  foreign key (discussion_id, parent_comment_id)
  references public.dealer_network_discussion_comments(discussion_id, id)
  on delete restrict;
create index dealer_network_comments_thread_idx on public.dealer_network_discussion_comments(discussion_id,created_at,id);

-- Preserve every existing broadcast and its exact recipient/read snapshot.
do $$
declare
  b record;
  new_topic_id uuid;
begin
 for b in
  select id, subject, sent_at, created_at
  from public.dealer_network_broadcasts
  where topic_id is null
 loop
  insert into public.dealer_network_board_topics(title,status,activated_at,created_at,updated_at)
  values (b.subject, 'active', b.sent_at, b.created_at, b.created_at)
  returning id into new_topic_id;
  update public.dealer_network_broadcasts
  set topic_id = new_topic_id
  where id = b.id;
 end loop;
end $$;
insert into public.dealer_network_board_topic_recipients(topic_id,member_id,first_read_at,last_read_at,created_at,updated_at)
select b.topic_id, r.member_id, r.read_at, r.read_at, r.created_at, r.updated_at
from public.dealer_network_broadcast_recipients r
join public.dealer_network_broadcasts b on b.id = r.broadcast_id
on conflict do nothing;
alter table public.dealer_network_broadcasts alter column topic_id set not null;

create or replace function public.dealer_network_mark_broadcast_read(p_broadcast_id uuid, p_member_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare v_topic_id uuid;
begin
 update public.dealer_network_broadcast_recipients set read_at=coalesce(read_at,now()),updated_at=now() where broadcast_id=p_broadcast_id and member_id=p_member_id;
 if not found then return false; end if;
 select topic_id into v_topic_id from public.dealer_network_broadcasts where id=p_broadcast_id;
 update public.dealer_network_board_topic_recipients set first_read_at=coalesce(first_read_at,now()),last_read_at=now(),updated_at=now() where topic_id=v_topic_id and member_id=p_member_id;
 return true;
end $$;

-- Backward-compatible broadcast RPC now creates an announcement-only topic.
create or replace function public.dealer_network_create_broadcast(p_subject text, p_body text)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare v_topic_id uuid; v_broadcast_id uuid; recipient_total integer; clean_subject text:=btrim(coalesce(p_subject,'')); clean_body text:=btrim(coalesce(p_body,''));
begin
 if char_length(clean_subject) not between 1 and 180 or char_length(clean_body) not between 1 and 5000 then raise exception 'invalid_broadcast'; end if;
 insert into public.dealer_network_board_topics(title,status,activated_at) values(clean_subject,'active',now()) returning id into v_topic_id;
 insert into public.dealer_network_broadcasts(subject,body,topic_id) values(clean_subject,clean_body,v_topic_id) returning id into v_broadcast_id;
 insert into public.dealer_network_board_topic_recipients(topic_id,member_id) select v_topic_id,m.id from public.dealer_network_members m where m.status='active' and m.account_locked=false and m.deleted_at is null;
 insert into public.dealer_network_broadcast_recipients(broadcast_id,member_id) select v_broadcast_id,r.member_id from public.dealer_network_board_topic_recipients r where r.topic_id=v_topic_id;
 get diagnostics recipient_total=row_count; update public.dealer_network_broadcasts set recipient_count=recipient_total where id=v_broadcast_id;
 return jsonb_build_object('broadcastId',v_broadcast_id,'topicId',v_topic_id,'recipientCount',recipient_total);
end $$;

create function public.dealer_network_activate_board_topic(p_topic_id uuid)
returns integer
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare n integer; v_broadcast_id uuid;
begin
 update public.dealer_network_board_topics set status='active',activated_at=coalesce(activated_at,now()),updated_at=now() where id=p_topic_id and status='draft';
 if not found then raise exception 'topic_not_draft'; end if;
 insert into public.dealer_network_board_topic_recipients(topic_id,member_id)
 select p_topic_id,m.id from public.dealer_network_members m where m.status='active' and m.account_locked=false and m.deleted_at is null;
 get diagnostics n=row_count;
 select id into v_broadcast_id from public.dealer_network_broadcasts where topic_id=p_topic_id;
 if v_broadcast_id is not null then
  insert into public.dealer_network_broadcast_recipients(broadcast_id,member_id) select v_broadcast_id,r.member_id from public.dealer_network_board_topic_recipients r where r.topic_id=p_topic_id on conflict do nothing;
  update public.dealer_network_broadcasts set recipient_count=n,sent_at=now() where id=v_broadcast_id;
 end if;
 return n;
end $$;

create function public.dealer_network_cast_poll_vote(p_poll_id uuid, p_option_id uuid, p_member_id uuid)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare p public.dealer_network_polls; existing uuid;
begin
 select * into p from public.dealer_network_polls where id=p_poll_id for update;
 if p.id is null or p.status<>'open' or (p.closes_at is not null and p.closes_at<=now()) then raise exception 'poll_closed'; end if;
 if not exists(select 1 from public.dealer_network_board_topics t where t.id=p.topic_id and t.status='active') then raise exception 'topic_not_active'; end if;
 if not exists(select 1 from public.dealer_network_board_topic_recipients r where r.topic_id=p.topic_id and r.member_id=p_member_id) then raise exception 'not_recipient'; end if;
 if not exists(select 1 from public.dealer_network_poll_options o where o.poll_id=p_poll_id and o.id=p_option_id) then raise exception 'invalid_option'; end if;
 select option_id into existing from public.dealer_network_poll_votes where poll_id=p_poll_id and member_id=p_member_id for update;
 if existing is not null and not p.allow_vote_change then raise exception 'vote_change_disabled'; end if;
 insert into public.dealer_network_poll_votes(poll_id,option_id,member_id) values(p_poll_id,p_option_id,p_member_id)
 on conflict(poll_id,member_id) do update set option_id=excluded.option_id,updated_at=now();
end $$;

create function public.dealer_network_add_board_comment(p_discussion_id uuid, p_member_id uuid, p_body text, p_parent_id uuid default null)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare d public.dealer_network_discussions; new_id uuid;
begin
 select * into d from public.dealer_network_discussions where id=p_discussion_id for update;
 if d.id is null or d.status<>'open' or not exists(select 1 from public.dealer_network_board_topics t where t.id=d.topic_id and t.status='active') then raise exception 'discussion_closed'; end if;
 if not exists(select 1 from public.dealer_network_board_topic_recipients r where r.topic_id=d.topic_id and r.member_id=p_member_id) then raise exception 'not_recipient'; end if;
 if char_length(btrim(coalesce(p_body,''))) not between 1 and 5000 then raise exception 'invalid_comment'; end if;
 if p_parent_id is not null and not exists(select 1 from public.dealer_network_discussion_comments c where c.id=p_parent_id and c.discussion_id=p_discussion_id and c.parent_comment_id is null) then raise exception 'invalid_parent'; end if;
 insert into public.dealer_network_discussion_comments(discussion_id,parent_comment_id,author_member_id,body) values(p_discussion_id,p_parent_id,p_member_id,btrim(p_body)) returning id into new_id; return new_id;
end $$;

create function public.dealer_network_update_board_comment(p_comment_id uuid, p_member_id uuid, p_body text, p_delete boolean default false)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare c public.dealer_network_discussion_comments; d public.dealer_network_discussions;
begin
 select * into c from public.dealer_network_discussion_comments where id=p_comment_id and author_member_id=p_member_id for update;
 if c.id is null or c.deleted_at is not null or c.removed_at is not null then raise exception 'comment_unavailable'; end if;
 select * into d from public.dealer_network_discussions where id=c.discussion_id;
 if d.status<>'open' or not exists(select 1 from public.dealer_network_board_topics t where t.id=d.topic_id and t.status='active') then raise exception 'discussion_closed'; end if;
 if p_delete then
  update public.dealer_network_discussion_comments
  set deleted_at = now(), updated_at = now()
  where id = p_comment_id;
 else
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 5000 then
   raise exception 'invalid_comment';
  end if;
  update public.dealer_network_discussion_comments
  set body = btrim(p_body), edited_at = now(), updated_at = now()
  where id = p_comment_id;
 end if;
end $$;

create function public.dealer_network_archive_board_topic(p_topic_id uuid)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
 perform 1 from public.dealer_network_board_topics where id=p_topic_id and status in ('active','closed') for update;
 if not found then raise exception 'topic_not_archivable'; end if;
 update public.dealer_network_polls
 set status = 'closed', closed_at = coalesce(closed_at, now()), updated_at = now()
 where topic_id = p_topic_id and status = 'open';
 update public.dealer_network_discussions
 set status = 'closed', closed_at = coalesce(closed_at, now()), updated_at = now()
 where topic_id = p_topic_id and status = 'open';
 update public.dealer_network_board_topics
 set status = 'archived', closed_at = coalesce(closed_at, now()), archived_at = now(), updated_at = now()
 where id = p_topic_id;
end $$;

alter table public.dealer_network_notification_events drop constraint dealer_network_notification_events_event_type_check;
alter table public.dealer_network_notification_events add constraint dealer_network_notification_events_event_type_check check(event_type in ('ids_new_application','applicant_activation','applicant_denied','applicant_more_information','member_pin_reset','member_new_message','member_broadcast','member_invitation','member_board_topic','member_board_poll_reminder','member_board_discussion'));
alter table public.dealer_network_notification_events add column topic_id uuid references public.dealer_network_board_topics(id) on delete restrict;
alter table public.dealer_network_notification_events add column poll_id uuid references public.dealer_network_polls(id) on delete restrict;

-- Atomic topic composition and optional activation. Options are JSON strings in saved order.
create function public.dealer_network_create_board_topic(
  p_title text, p_announcement_body text, p_poll_question text,
  p_poll_explanation text, p_poll_options jsonb, p_allow_vote_change boolean,
  p_closes_at timestamptz, p_discussion_context text, p_source_suggestion_id uuid,
  p_activate boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare v_topic_id uuid; v_broadcast_id uuid; v_poll_id uuid; v_discussion_id uuid; recipient_total integer:=0; option_count integer:=0;
begin
 if char_length(btrim(coalesce(p_title,''))) not between 1 and 180 then raise exception 'invalid_topic'; end if;
 if p_source_suggestion_id is not null and not exists(select 1 from public.dealer_network_suggestions where id=p_source_suggestion_id) then raise exception 'invalid_suggestion'; end if;
 if nullif(btrim(coalesce(p_announcement_body,'')),'') is null and nullif(btrim(coalesce(p_poll_question,'')),'') is null and nullif(btrim(coalesce(p_discussion_context,'')),'') is null then raise exception 'empty_topic'; end if;
 insert into public.dealer_network_board_topics(title,source_suggestion_id) values(btrim(p_title),p_source_suggestion_id) returning id into v_topic_id;
 if nullif(btrim(coalesce(p_announcement_body,'')),'') is not null then
  if char_length(btrim(p_announcement_body))>5000 then raise exception 'invalid_announcement'; end if;
  insert into public.dealer_network_broadcasts(topic_id,subject,body) values(v_topic_id,btrim(p_title),btrim(p_announcement_body)) returning id into v_broadcast_id;
 end if;
 if nullif(btrim(coalesce(p_poll_question,'')),'') is not null then
  if char_length(btrim(p_poll_question))>500 or char_length(coalesce(p_poll_explanation,''))>5000 or coalesce(jsonb_typeof(p_poll_options),'')<>'array' then raise exception 'invalid_poll'; end if;
  option_count:=jsonb_array_length(p_poll_options); if option_count not between 2 and 10 then raise exception 'invalid_poll_options'; end if;
  insert into public.dealer_network_polls(topic_id,question,explanation,allow_vote_change,closes_at) values(v_topic_id,btrim(p_poll_question),btrim(coalesce(p_poll_explanation,'')),coalesce(p_allow_vote_change,false),p_closes_at) returning id into v_poll_id;
  insert into public.dealer_network_poll_options(poll_id,label,position)
  select v_poll_id,btrim(value),(ordinality-1)::smallint from jsonb_array_elements_text(p_poll_options) with ordinality
  where char_length(btrim(value)) between 1 and 200;
  if (select count(*) from public.dealer_network_poll_options where dealer_network_poll_options.poll_id=v_poll_id)<>option_count then raise exception 'invalid_poll_options'; end if;
 end if;
 if nullif(btrim(coalesce(p_discussion_context,'')),'') is not null then
  if char_length(p_discussion_context)>5000 then raise exception 'invalid_discussion'; end if;
  insert into public.dealer_network_discussions(topic_id,context) values(v_topic_id,btrim(p_discussion_context)) returning id into v_discussion_id;
 end if;
 if p_activate then
  update public.dealer_network_board_topics set status='active',activated_at=now(),updated_at=now() where id=v_topic_id;
  insert into public.dealer_network_board_topic_recipients(topic_id,member_id) select v_topic_id,m.id from public.dealer_network_members m where m.status='active' and m.account_locked=false and m.deleted_at is null;
  get diagnostics recipient_total=row_count;
  if v_broadcast_id is not null then
   insert into public.dealer_network_broadcast_recipients(broadcast_id,member_id) select v_broadcast_id,r.member_id from public.dealer_network_board_topic_recipients r where r.topic_id=v_topic_id;
   update public.dealer_network_broadcasts set recipient_count=recipient_total,sent_at=now() where id=v_broadcast_id;
  end if;
 end if;
 return jsonb_build_object('topicId',v_topic_id,'broadcastId',v_broadcast_id,'pollId',v_poll_id,'discussionId',v_discussion_id,'recipientCount',recipient_total);
end $$;

create function public.dealer_network_add_board_poll(p_topic_id uuid,p_question text,p_explanation text,p_options jsonb,p_allow_vote_change boolean,p_closes_at timestamptz)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare v_poll_id uuid; option_count integer;
begin
 perform 1 from public.dealer_network_board_topics where id=p_topic_id and status in ('draft','active') for update;
 if not found then raise exception 'topic_not_editable'; end if;
 if exists(select 1 from public.dealer_network_polls where topic_id=p_topic_id) then raise exception 'poll_exists'; end if;
 if char_length(btrim(coalesce(p_question,''))) not between 1 and 500 or char_length(coalesce(p_explanation,''))>5000 or coalesce(jsonb_typeof(p_options),'')<>'array' then raise exception 'invalid_poll'; end if;
 option_count:=jsonb_array_length(p_options); if option_count not between 2 and 10 then raise exception 'invalid_poll_options'; end if;
 insert into public.dealer_network_polls(topic_id,question,explanation,allow_vote_change,closes_at) values(p_topic_id,btrim(p_question),btrim(coalesce(p_explanation,'')),coalesce(p_allow_vote_change,false),p_closes_at) returning id into v_poll_id;
 insert into public.dealer_network_poll_options(poll_id,label,position) select v_poll_id,btrim(value),(ordinality-1)::smallint from jsonb_array_elements_text(p_options) with ordinality where char_length(btrim(value)) between 1 and 200;
 if (select count(*) from public.dealer_network_poll_options where dealer_network_poll_options.poll_id=v_poll_id)<>option_count then raise exception 'invalid_poll_options'; end if;
 return v_poll_id;
end $$;

create function public.dealer_network_open_board_discussion(p_topic_id uuid, p_context text)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare v_discussion_id uuid;
begin
 perform 1 from public.dealer_network_board_topics where id=p_topic_id and status in ('draft','active') for update;
 if not found then raise exception 'topic_not_editable'; end if;
 if exists(select 1 from public.dealer_network_discussions where topic_id=p_topic_id) then raise exception 'discussion_exists'; end if;
 if char_length(coalesce(p_context,''))>5000 then raise exception 'invalid_discussion'; end if;
 insert into public.dealer_network_discussions(topic_id, context)
 values (p_topic_id, btrim(coalesce(p_context, '')))
 returning id into v_discussion_id;
 return v_discussion_id;
end $$;

create function public.dealer_network_moderate_board_comment(p_topic_id uuid, p_discussion_id uuid, p_comment_id uuid, p_reason text)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
 perform 1 from public.dealer_network_board_topics where id=p_topic_id and status<>'archived' for update;
 if not found then raise exception 'topic_not_moderatable'; end if;
 if not exists(select 1 from public.dealer_network_discussions where id=p_discussion_id and topic_id=p_topic_id) then raise exception 'invalid_discussion'; end if;
 update public.dealer_network_discussion_comments set removed_at=coalesce(removed_at,now()),removed_reason=nullif(btrim(coalesce(p_reason,'')),''),updated_at=now()
 where id=p_comment_id and discussion_id=p_discussion_id and deleted_at is null;
 if not found then raise exception 'comment_unavailable'; end if;
end $$;

create function public.dealer_network_mark_board_topic_read(p_topic_id uuid, p_member_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
 update public.dealer_network_board_topic_recipients set first_read_at=coalesce(first_read_at,now()),last_read_at=now(),updated_at=now() where topic_id=p_topic_id and member_id=p_member_id;
 return found;
end $$;

do $$
declare
  t text;
begin
 foreach t in array array[
  'dealer_network_board_topics',
  'dealer_network_board_topic_recipients',
  'dealer_network_polls',
  'dealer_network_poll_options',
  'dealer_network_poll_votes',
  'dealer_network_discussions',
  'dealer_network_discussion_comments'
 ] loop
  execute format('alter table public.%I enable row level security', t);
  execute format('alter table public.%I force row level security', t);
  execute format('revoke all on table public.%I from public,anon,authenticated,service_role', t);
  execute format('grant select,insert,update,delete on table public.%I to service_role', t);
 end loop;
end $$;

revoke all on function
  public.dealer_network_activate_board_topic(uuid),
  public.dealer_network_cast_poll_vote(uuid, uuid, uuid),
  public.dealer_network_add_board_comment(uuid, uuid, text, uuid),
  public.dealer_network_update_board_comment(uuid, uuid, text, boolean),
  public.dealer_network_archive_board_topic(uuid),
  public.dealer_network_create_board_topic(text, text, text, text, jsonb, boolean, timestamptz, text, uuid, boolean),
  public.dealer_network_add_board_poll(uuid, text, text, jsonb, boolean, timestamptz),
  public.dealer_network_open_board_discussion(uuid, text),
  public.dealer_network_moderate_board_comment(uuid, uuid, uuid, text),
  public.dealer_network_mark_board_topic_read(uuid, uuid)
from public, anon, authenticated;

grant execute on function
  public.dealer_network_activate_board_topic(uuid),
  public.dealer_network_cast_poll_vote(uuid, uuid, uuid),
  public.dealer_network_add_board_comment(uuid, uuid, text, uuid),
  public.dealer_network_update_board_comment(uuid, uuid, text, boolean),
  public.dealer_network_archive_board_topic(uuid),
  public.dealer_network_create_board_topic(text, text, text, text, jsonb, boolean, timestamptz, text, uuid, boolean),
  public.dealer_network_add_board_poll(uuid, text, text, jsonb, boolean, timestamptz),
  public.dealer_network_open_board_discussion(uuid, text),
  public.dealer_network_moderate_board_comment(uuid, uuid, uuid, text),
  public.dealer_network_mark_board_topic_read(uuid, uuid)
to service_role;
