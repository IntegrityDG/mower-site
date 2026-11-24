begin;

-- Dealer portal only. Store stable references, never recipient addresses or content.
create table dealer_network_private.activity_alerts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('board_topic','board_comment','board_reply','troubleshooting_issue','troubleshooting_comment','troubleshooting_update')),
  source_id uuid not null,
  context_id uuid not null,
  member_id uuid not null references public.dealer_network_members(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  read_at timestamptz,
  next_attempt_at timestamptz not null default statement_timestamp(),
  first_attempt_at timestamptz,
  attempt_count smallint not null default 0 check (attempt_count between 0 and 5),
  lease_token uuid,
  leased_until timestamptz,
  sent_at timestamptz,
  discarded_at timestamptz,
  unique (kind,source_id,member_id),
  check ((lease_token is null) = (leased_until is null)),
  check (sent_at is null or discarded_at is null)
);
create index dealer_activity_unread_idx on dealer_network_private.activity_alerts(member_id,created_at desc,id desc) where read_at is null;
create index dealer_activity_member_fk_idx on dealer_network_private.activity_alerts(member_id);
create index dealer_activity_queue_idx on dealer_network_private.activity_alerts(next_attempt_at,id) where sent_at is null and discarded_at is null and attempt_count < 5;

-- A legacy or explicitly targeted audience cannot be reclassified by its recipient count.
create table dealer_network_private.activity_alert_all_member_topics (
  topic_id uuid primary key references public.dealer_network_board_topics(id) on delete cascade
);

create table dealer_network_private.troubleshooting_first_approvals (
  entry_id uuid primary key references public.dealer_network_troubleshooting_entries(id) on delete cascade
);
-- Identify currently approved legacy rows without backfilling any notifications.
-- Hold the lock until the new trigger is installed to prevent a gap in the approval ledger.
lock table public.dealer_network_troubleshooting_entries in share row exclusive mode;
insert into dealer_network_private.troubleshooting_first_approvals(entry_id)
select id from public.dealer_network_troubleshooting_entries where status='approved';

alter table dealer_network_private.activity_alert_all_member_topics enable row level security;
alter table dealer_network_private.activity_alert_all_member_topics force row level security;
alter table dealer_network_private.activity_alerts enable row level security;
alter table dealer_network_private.activity_alerts force row level security;
alter table dealer_network_private.troubleshooting_first_approvals enable row level security;
alter table dealer_network_private.troubleshooting_first_approvals force row level security;
revoke all on dealer_network_private.activity_alerts, dealer_network_private.troubleshooting_first_approvals,
  dealer_network_private.activity_alert_all_member_topics
  from public,anon,authenticated,service_role;
grant select,insert,update on dealer_network_private.activity_alerts to service_role;
grant select,insert on dealer_network_private.troubleshooting_first_approvals,
  dealer_network_private.activity_alert_all_member_topics to service_role;

create function dealer_network_private.activity_alert_is_visible(a dealer_network_private.activity_alerts)
returns boolean language sql stable security invoker set search_path=''
as $$
  select exists(select 1 from public.dealer_network_members m
      where m.id=a.member_id and m.status='active' and not m.account_locked and m.deleted_at is null)
  and case
    when a.kind='board_topic' then a.source_id=a.context_id and exists (
      select 1 from dealer_network_private.activity_alert_all_member_topics scope
      join public.dealer_network_board_topics t on t.id=scope.topic_id and t.status<>'draft'
      join public.dealer_network_board_topic_recipients r on r.topic_id=t.id and r.member_id=a.member_id
      where t.id=a.context_id
    )
    when a.kind in ('board_comment','board_reply') then exists (
      select 1 from public.dealer_network_discussion_comments as c
      join public.dealer_network_discussions as d on d.id=c.discussion_id
      join public.dealer_network_board_topics as t on t.id=d.topic_id and t.status<>'draft'
      join dealer_network_private.activity_alert_all_member_topics scope on scope.topic_id=t.id
      join public.dealer_network_board_topic_recipients as r on r.topic_id=t.id and r.member_id=a.member_id
      where c.id=a.source_id and t.id=a.context_id and c.deleted_at is null and c.removed_at is null
        and (c.parent_comment_id is null)=(a.kind='board_comment')
    )
    when a.kind='troubleshooting_issue' then a.source_id=a.context_id and exists (
      select 1 from public.dealer_network_troubleshooting_entries e where e.id=a.context_id and e.status='approved'
    )
    when a.kind='troubleshooting_comment' then exists (
      select 1 from public.dealer_network_troubleshooting_comments as c
      join public.dealer_network_troubleshooting_entries as e on e.id=c.entry_id and e.status='approved'
      where c.id=a.source_id and e.id=a.context_id
    )
    when a.kind='troubleshooting_update' then exists (
      select 1 from public.dealer_network_troubleshooting_updates as u
      join public.dealer_network_troubleshooting_entries as e on e.id=u.entry_id and e.status='approved'
      where u.id=a.source_id and e.id=a.context_id
    )
    else false
  end
$$;

create function dealer_network_private.enqueue_portal_activity_alerts()
returns trigger language plpgsql security invoker set search_path=''
as $$
declare
  v_kind text;
  v_source_id uuid := new.id;
  v_context_id uuid;
begin
  if tg_table_name='dealer_network_discussion_comments' then
    if new.deleted_at is not null or new.removed_at is not null then return new; end if;
    select d.topic_id into v_context_id from public.dealer_network_discussions d
      join public.dealer_network_board_topics t on t.id=d.topic_id and t.status='active'
      join dealer_network_private.activity_alert_all_member_topics scope on scope.topic_id=t.id
      where d.id=new.discussion_id and d.status='open';
    if not found then return new; end if;
    v_kind := case when new.parent_comment_id is null then 'board_comment' else 'board_reply' end;
    insert into dealer_network_private.activity_alerts(kind,source_id,context_id,member_id)
      select v_kind,v_source_id,v_context_id,m.id
      from public.dealer_network_board_topic_recipients as r
      join public.dealer_network_members as m on m.id=r.member_id
      where r.topic_id=v_context_id and m.status='active' and not m.account_locked and m.deleted_at is null
      on conflict(kind,source_id,member_id) do nothing;
    return new;
  end if;

  if tg_table_name='dealer_network_troubleshooting_entries' then
    if new.status <> 'approved' then return new; end if;
    if tg_op='UPDATE' then
      if old.status='approved' then return new; end if;
    end if;
    insert into dealer_network_private.troubleshooting_first_approvals(entry_id)
      values(new.id) on conflict(entry_id) do nothing;
    if not found then return new; end if;
    v_kind := 'troubleshooting_issue';
    v_context_id := new.id;
  else
    v_context_id := new.entry_id;
    if not exists(select 1 from public.dealer_network_troubleshooting_entries e
      where e.id=v_context_id and e.status='approved') then return new; end if;
    v_kind := case when tg_table_name='dealer_network_troubleshooting_comments'
      then 'troubleshooting_comment' else 'troubleshooting_update' end;
  end if;

  insert into dealer_network_private.activity_alerts(kind,source_id,context_id,member_id)
    select v_kind,v_source_id,v_context_id,m.id from public.dealer_network_members m
    where m.status='active' and not m.account_locked and m.deleted_at is null
    on conflict(kind,source_id,member_id) do nothing;
  return new;
end
$$;

create trigger dealer_portal_board_activity_alert after insert on public.dealer_network_discussion_comments
  for each row execute function dealer_network_private.enqueue_portal_activity_alerts();
create trigger dealer_portal_issue_activity_alert after insert or update of status on public.dealer_network_troubleshooting_entries
  for each row execute function dealer_network_private.enqueue_portal_activity_alerts();
create trigger dealer_portal_troubleshooting_comment_alert after insert on public.dealer_network_troubleshooting_comments
  for each row execute function dealer_network_private.enqueue_portal_activity_alerts();
create trigger dealer_portal_troubleshooting_update_alert after insert on public.dealer_network_troubleshooting_updates
  for each row execute function dealer_network_private.enqueue_portal_activity_alerts();

create function public.dealer_network_read_activity_alerts(p_member_id uuid,p_limit integer default 30)
returns table(id uuid,kind text,source_id uuid,context_id uuid,created_at timestamptz,read_at timestamptz,unread_total bigint)
language sql stable security invoker set search_path=''
as $$
  select a.id,a.kind,a.source_id,a.context_id,a.created_at,a.read_at,count(*) over()
    from dealer_network_private.activity_alerts as a
    where a.member_id=p_member_id and a.read_at is null and a.kind<>'board_topic'
      and dealer_network_private.activity_alert_is_visible(a)
    order by a.created_at desc,a.id desc
    limit greatest(1,least(coalesce(p_limit,30),100))
$$;

create function public.dealer_network_mark_activity_alerts_read(
  p_member_id uuid,p_alert_ids uuid[],p_context_id uuid default null,p_source_id uuid default null
) returns integer language plpgsql security invoker set search_path=''
as $$
declare v_count integer;
begin
  if coalesce(cardinality(p_alert_ids),0) not between 1 and 100 then return 0; end if;
  update dealer_network_private.activity_alerts a set read_at=clock_timestamp()
    where a.member_id=p_member_id and a.id=any(p_alert_ids) and a.read_at is null and a.kind<>'board_topic'
      and (p_context_id is null or a.context_id=p_context_id)
      and (p_source_id is null or a.source_id=p_source_id)
      and dealer_network_private.activity_alert_is_visible(a);
  get diagnostics v_count = row_count;
  return v_count;
end
$$;

create function public.dealer_network_claim_activity_alert_deliveries(p_limit integer default 25)
returns table(id uuid,kind text,source_id uuid,context_id uuid,member_id uuid,lease_token uuid,attempt_count integer,created_at timestamptz,read_at timestamptz)
language sql volatile security invoker set search_path=''
as $$
  with selected as (
    select a.id from dealer_network_private.activity_alerts a
      where a.sent_at is null and a.discarded_at is null and a.attempt_count<5
        and a.next_attempt_at<=statement_timestamp()
        and (a.leased_until is null or a.leased_until<=statement_timestamp())
        and (a.first_attempt_at is null or a.first_attempt_at>statement_timestamp()-interval '12 hours')
        and dealer_network_private.activity_alert_is_visible(a)
      order by a.next_attempt_at,a.id
      limit greatest(1,least(coalesce(p_limit,25),100))
      for update of a skip locked
  )
  update dealer_network_private.activity_alerts a set
    lease_token=gen_random_uuid(),
    leased_until=statement_timestamp()+interval '3 minutes',
    first_attempt_at=coalesce(a.first_attempt_at,statement_timestamp()),
    attempt_count=a.attempt_count+1
  from selected where selected.id=a.id
  returning a.id,a.kind,a.source_id,a.context_id,a.member_id,a.lease_token,a.attempt_count::integer,a.created_at,a.read_at
$$;

create function public.dealer_network_get_activity_alert_recipient(p_alert_id uuid,p_lease_token uuid)
returns text language sql stable security invoker set search_path=''
as $$
  select nullif(btrim(m.email),'') from dealer_network_private.activity_alerts a
    join public.dealer_network_members m on m.id=a.member_id
    where a.id=p_alert_id and a.lease_token=p_lease_token and a.leased_until>statement_timestamp()
      and a.first_attempt_at>statement_timestamp()-interval '12 hours'
      and a.sent_at is null and a.discarded_at is null
      and dealer_network_private.activity_alert_is_visible(a)
$$;

create function public.dealer_network_finish_activity_alert_delivery(
  p_alert_id uuid,p_lease_token uuid,p_succeeded boolean,p_discarded boolean default false
) returns boolean language plpgsql security invoker set search_path=''
as $$
begin
  if p_succeeded is null or p_discarded is null or (p_discarded and p_succeeded) then return false; end if;
  update dealer_network_private.activity_alerts a set
    sent_at=case when p_succeeded then statement_timestamp() else null end,
    discarded_at=case when p_discarded or (not p_succeeded and (a.attempt_count>=5 or
      a.first_attempt_at<=statement_timestamp()-interval '12 hours')) then statement_timestamp() else null end,
    next_attempt_at=statement_timestamp()+make_interval(secs=>power(2,a.attempt_count)*30),
    lease_token=null,leased_until=null
  where a.id=p_alert_id and a.lease_token=p_lease_token and a.leased_until>statement_timestamp()
    and a.sent_at is null and a.discarded_at is null;
  return found;
end
$$;

-- The old create/activate and targeted broadcast paths remain unchanged. Only
-- the new all-member workflow calls these wrappers, with atomic delivery.
create function dealer_network_private.register_board_topic_alerts(p_topic_id uuid)
returns void language plpgsql security invoker set search_path=''
as $$
begin
  insert into dealer_network_private.activity_alert_all_member_topics(topic_id)
    values(p_topic_id) on conflict(topic_id) do nothing;
  insert into dealer_network_private.activity_alerts(kind,source_id,context_id,member_id)
    select 'board_topic',p_topic_id,p_topic_id,m.id
    from public.dealer_network_board_topic_recipients r
    join public.dealer_network_members m on m.id=r.member_id
    where r.topic_id=p_topic_id and m.status='active' and not m.account_locked and m.deleted_at is null
    on conflict(kind,source_id,member_id) do nothing;
end
$$;

create function public.dealer_network_create_board_topic_with_alerts(
  p_title text,p_announcement_body text,p_poll_question text,p_poll_explanation text,
  p_poll_options jsonb,p_allow_vote_change boolean,p_closes_at timestamptz,
  p_discussion_context text,p_source_suggestion_id uuid,p_activate boolean
) returns jsonb language plpgsql security invoker set search_path=''
as $$
declare result jsonb;
begin
  result := public.dealer_network_create_board_topic(p_title,p_announcement_body,p_poll_question,
    p_poll_explanation,p_poll_options,p_allow_vote_change,p_closes_at,p_discussion_context,
    p_source_suggestion_id,p_activate);
  if p_activate then
    perform dealer_network_private.register_board_topic_alerts((result->>'topicId')::uuid);
  end if;
  return result;
end
$$;

create function public.dealer_network_activate_board_topic_with_alerts(p_topic_id uuid)
returns integer language plpgsql security invoker set search_path=''
as $$
declare recipient_count integer;
begin
  recipient_count := public.dealer_network_activate_board_topic(p_topic_id);
  perform dealer_network_private.register_board_topic_alerts(p_topic_id);
  return recipient_count;
end
$$;

revoke all on function dealer_network_private.activity_alert_is_visible(dealer_network_private.activity_alerts),
  dealer_network_private.enqueue_portal_activity_alerts(),
  public.dealer_network_read_activity_alerts(uuid,integer),
  public.dealer_network_mark_activity_alerts_read(uuid,uuid[],uuid,uuid),
  public.dealer_network_claim_activity_alert_deliveries(integer),
  public.dealer_network_get_activity_alert_recipient(uuid,uuid),
  public.dealer_network_finish_activity_alert_delivery(uuid,uuid,boolean,boolean),
  dealer_network_private.register_board_topic_alerts(uuid),
  public.dealer_network_create_board_topic_with_alerts(text,text,text,text,jsonb,boolean,timestamptz,text,uuid,boolean),
  public.dealer_network_activate_board_topic_with_alerts(uuid)
from public,anon,authenticated,service_role;
grant execute on function dealer_network_private.activity_alert_is_visible(dealer_network_private.activity_alerts),
  dealer_network_private.enqueue_portal_activity_alerts(),
  public.dealer_network_read_activity_alerts(uuid,integer),
  public.dealer_network_mark_activity_alerts_read(uuid,uuid[],uuid,uuid),
  public.dealer_network_claim_activity_alert_deliveries(integer),
  public.dealer_network_get_activity_alert_recipient(uuid,uuid),
  public.dealer_network_finish_activity_alert_delivery(uuid,uuid,boolean,boolean),
  dealer_network_private.register_board_topic_alerts(uuid),
  public.dealer_network_create_board_topic_with_alerts(text,text,text,text,jsonb,boolean,timestamptz,text,uuid,boolean),
  public.dealer_network_activate_board_topic_with_alerts(uuid)
to service_role;

commit;
