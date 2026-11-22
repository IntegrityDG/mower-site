-- Dealer-only conversation and editorial review. Keep the published row intact
-- while its owner proposes a replacement, and keep replies off the public API.
create table public.dealer_network_troubleshooting_updates (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.dealer_network_troubleshooting_entries(id) on delete cascade,
  member_id uuid not null references public.dealer_network_members(id) on delete restrict,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index dealer_network_troubleshooting_updates_entry_idx
  on public.dealer_network_troubleshooting_updates (entry_id, created_at, id);
create index dealer_network_troubleshooting_updates_member_idx
  on public.dealer_network_troubleshooting_updates (member_id);

create table public.dealer_network_troubleshooting_comments (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.dealer_network_troubleshooting_entries(id) on delete cascade,
  member_id uuid not null references public.dealer_network_members(id) on delete restrict,
  member_name_snapshot text not null check (char_length(member_name_snapshot) between 1 and 160),
  company_name_snapshot text not null check (char_length(company_name_snapshot) between 1 and 180),
  body text not null check (char_length(body) between 1 and 250),
  created_at timestamptz not null default now(),
  slot smallint not null check (slot between 1 and 5),
  unique (entry_id, slot)
);

create index dealer_network_troubleshooting_comments_member_idx
  on public.dealer_network_troubleshooting_comments (member_id);

create table public.dealer_network_troubleshooting_revisions (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null unique references public.dealer_network_troubleshooting_entries(id) on delete cascade,
  member_id uuid not null references public.dealer_network_members(id) on delete restrict,
  patch jsonb not null check (jsonb_typeof(patch) = 'object'),
  created_at timestamptz not null default now()
);

create index dealer_network_troubleshooting_revisions_member_idx
  on public.dealer_network_troubleshooting_revisions (member_id);

alter table public.dealer_network_troubleshooting_updates enable row level security;
alter table public.dealer_network_troubleshooting_comments enable row level security;
alter table public.dealer_network_troubleshooting_revisions enable row level security;
alter table public.dealer_network_troubleshooting_updates force row level security;
alter table public.dealer_network_troubleshooting_comments force row level security;
alter table public.dealer_network_troubleshooting_revisions force row level security;

revoke all on public.dealer_network_troubleshooting_updates,
  public.dealer_network_troubleshooting_comments, public.dealer_network_troubleshooting_revisions
  from public, anon, authenticated, service_role;
grant select, insert on public.dealer_network_troubleshooting_updates,
  public.dealer_network_troubleshooting_comments to service_role;
grant select, insert, update, delete on public.dealer_network_troubleshooting_revisions to service_role;

-- The existing tombstone process redacts authors on legacy issue records.
-- Keep the new snapshots consistent without deleting historical discussion.
create function dealer_network_private.scrub_troubleshooting_member_activity()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  update public.dealer_network_troubleshooting_comments
    set member_name_snapshot = 'Deleted Member', company_name_snapshot = 'Deleted Member'
    where member_id = new.id;
  delete from public.dealer_network_troubleshooting_revisions where member_id = new.id;
  return new;
end;
$$;
revoke all on function dealer_network_private.scrub_troubleshooting_member_activity()
  from public, anon, authenticated, service_role;
grant execute on function dealer_network_private.scrub_troubleshooting_member_activity() to service_role;
grant update (member_name_snapshot, company_name_snapshot)
  on public.dealer_network_troubleshooting_comments to service_role;

create trigger dealer_network_scrub_troubleshooting_member_activity
after update of deleted_at on public.dealer_network_members
for each row when (old.deleted_at is null and new.deleted_at is not null)
execute function dealer_network_private.scrub_troubleshooting_member_activity();

create function dealer_network_private.dealer_network_normalize_troubleshooting_patch(p_patch jsonb)
returns jsonb language plpgsql stable security invoker set search_path = ''
as $$
declare
  v_result jsonb := '{}'::jsonb;
  v_spec record;
  v_text text;
  v_date date;
begin
  if jsonb_typeof(p_patch) is distinct from 'object' then
    raise exception 'troubleshooting_invalid_edit';
  end if;
  if (select count(*) from jsonb_object_keys(p_patch)) <> 9 then
    raise exception 'troubleshooting_invalid_edit';
  end if;
  for v_spec in select * from (values
    ('title',3,180), ('brand',1,120), ('model',1,160), ('issue_date',10,10),
    ('firmware_software_version',1,160), ('system_area',1,160), ('bad_part',0,200),
    ('issue_description',1,1000), ('fix_description',1,1000)
  ) as field(key,min_length,max_length) loop
    if v_spec.key = 'bad_part' and jsonb_typeof(p_patch->v_spec.key) = 'null' then
      v_result := v_result || jsonb_build_object(v_spec.key, null::text);
      continue;
    end if;
    if jsonb_typeof(p_patch->v_spec.key) is distinct from 'string' then
      raise exception 'troubleshooting_invalid_edit';
    end if;
    v_text := regexp_replace(p_patch->>v_spec.key, '^[[:space:]]+|[[:space:]]+$', '', 'g');
    if char_length(v_text) not between v_spec.min_length and v_spec.max_length then
      raise exception 'troubleshooting_invalid_edit';
    end if;
    if v_spec.key = 'issue_date' then
      if v_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        raise exception 'troubleshooting_invalid_edit';
      end if;
      begin
        v_date := v_text::date;
      exception when datetime_field_overflow or invalid_datetime_format then
        raise exception 'troubleshooting_invalid_edit';
      end;
      if v_date > current_date then raise exception 'troubleshooting_invalid_edit'; end if;
    end if;
    v_result := v_result || jsonb_build_object(v_spec.key, nullif(v_text, ''));
  end loop;
  return v_result;
end;
$$;

-- Explicit column list, even after validating the patch: never update author,
-- photos, existing moderation timestamps, or publication settings from member input.
create function dealer_network_private.dealer_network_apply_troubleshooting_text(p_entry_id uuid, p_patch jsonb)
returns void language sql security invoker set search_path = ''
as $$
  update public.dealer_network_troubleshooting_entries as e set
    title = n.title,
    brand = n.brand,
    model = n.model,
    issue_date = n.issue_date,
    firmware_software_version = n.firmware_software_version,
    system_area = n.system_area,
    bad_part = n.bad_part,
    issue_description = n.issue_description,
    fix_description = n.fix_description,
    updated_at = now()
  from jsonb_to_record(dealer_network_private.dealer_network_normalize_troubleshooting_patch(p_patch)) as n(
    title text, brand text, model text, issue_date date, firmware_software_version text,
    system_area text, bad_part text, issue_description text, fix_description text
  )
  where e.id = p_entry_id
$$;

create function public.dealer_network_update_troubleshooting_text(
  p_entry_id uuid, p_member_id uuid, p_patch jsonb
) returns text language plpgsql security invoker set search_path = ''
as $$
declare
  v_entry public.dealer_network_troubleshooting_entries%rowtype;
  v_patch jsonb;
begin
  perform 1 from public.dealer_network_members
    where id = p_member_id and status = 'active' and not account_locked and deleted_at is null for share;
  if not found then raise exception 'troubleshooting_member_unavailable'; end if;

  select * into v_entry from public.dealer_network_troubleshooting_entries
    where id = p_entry_id for update;
  if not found then raise exception 'troubleshooting_entry_unavailable'; end if;
  if v_entry.member_id <> p_member_id then raise exception 'troubleshooting_owner_required'; end if;
  v_patch := dealer_network_private.dealer_network_normalize_troubleshooting_patch(p_patch);

  -- Approval applies to the original solution even if it was not published publicly.
  if v_entry.status = 'approved' then
    insert into public.dealer_network_troubleshooting_revisions (entry_id, member_id, patch)
      values (p_entry_id, p_member_id, v_patch)
      on conflict (entry_id) do update set
        id = gen_random_uuid(), patch = excluded.patch, created_at = now();
    return 'pending_review';
  end if;

  perform dealer_network_private.dealer_network_apply_troubleshooting_text(p_entry_id, v_patch);
  delete from public.dealer_network_troubleshooting_revisions where entry_id = p_entry_id;
  return 'saved';
end;
$$;

create function public.dealer_network_append_troubleshooting_update(
  p_entry_id uuid, p_member_id uuid, p_body text
) returns uuid language plpgsql security invoker set search_path = ''
as $$
declare
  v_owner uuid;
  v_note_id uuid;
  v_body text := regexp_replace(coalesce(p_body, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
begin
  if char_length(v_body) not between 1 and 1000 then raise exception 'troubleshooting_invalid_note'; end if;
  perform 1 from public.dealer_network_members
    where id = p_member_id and status = 'active' and not account_locked and deleted_at is null for share;
  if not found then raise exception 'troubleshooting_member_unavailable'; end if;
  select member_id into v_owner from public.dealer_network_troubleshooting_entries
    where id = p_entry_id for share;
  if not found then raise exception 'troubleshooting_entry_unavailable'; end if;
  if v_owner <> p_member_id then raise exception 'troubleshooting_owner_required'; end if;
  insert into public.dealer_network_troubleshooting_updates (entry_id, member_id, body)
    values (p_entry_id, p_member_id, v_body) returning id into v_note_id;
  return v_note_id;
end;
$$;

create function public.dealer_network_add_troubleshooting_comment(
  p_entry_id uuid, p_member_id uuid, p_body text
) returns uuid language plpgsql security invoker set search_path = ''
as $$
declare
  v_member public.dealer_network_members%rowtype;
  v_entry public.dealer_network_troubleshooting_entries%rowtype;
  v_comment_id uuid;
  v_slot integer;
  v_body text := regexp_replace(coalesce(p_body, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
begin
  if char_length(v_body) not between 1 and 250 then raise exception 'troubleshooting_invalid_comment'; end if;
  select * into v_member from public.dealer_network_members
    where id = p_member_id and status = 'active' and not account_locked and deleted_at is null
      and role in ('dealer', 'repair_tech', 'both') for share;
  if not found then raise exception 'troubleshooting_member_unavailable'; end if;
  -- Serialize allocation with other comments and any status change. The
  -- unique constraint + range check still enforce the hard cap independently.
  select * into v_entry from public.dealer_network_troubleshooting_entries
    where id = p_entry_id for update;
  if not found or v_entry.status <> 'approved' then raise exception 'troubleshooting_entry_unavailable'; end if;
  if v_entry.member_id = p_member_id then raise exception 'troubleshooting_comment_requires_non_owner'; end if;
  select slots.slot into v_slot from generate_series(1, 5) as slots(slot)
    where not exists (
      select 1 from public.dealer_network_troubleshooting_comments as c
      where c.entry_id = p_entry_id and c.slot = slots.slot
    ) order by slots.slot limit 1;
  if not found then raise exception 'troubleshooting_comment_limit'; end if;
  insert into public.dealer_network_troubleshooting_comments
    (entry_id, member_id, member_name_snapshot, company_name_snapshot, body, slot)
    values (p_entry_id, p_member_id, v_member.member_name, v_member.company_name, v_body, v_slot)
    returning id into v_comment_id;
  return v_comment_id;
end;
$$;

create function public.dealer_network_review_troubleshooting_revision(
  p_entry_id uuid, p_revision_id uuid, p_approve boolean
) returns void language plpgsql security invoker set search_path = ''
as $$
declare
  v_entry public.dealer_network_troubleshooting_entries%rowtype;
  v_revision public.dealer_network_troubleshooting_revisions%rowtype;
begin
  if p_approve is null then raise exception 'troubleshooting_revision_unavailable'; end if;
  select * into v_entry from public.dealer_network_troubleshooting_entries
    where id = p_entry_id for update;
  if not found then raise exception 'troubleshooting_revision_unavailable'; end if;
  select * into v_revision from public.dealer_network_troubleshooting_revisions
    where entry_id = p_entry_id and id = p_revision_id for update;
  if not found or v_revision.member_id <> v_entry.member_id then
    raise exception 'troubleshooting_revision_unavailable';
  end if;
  if p_approve then
    if v_entry.status <> 'approved' then raise exception 'troubleshooting_revision_unavailable'; end if;
    perform dealer_network_private.dealer_network_apply_troubleshooting_text(p_entry_id, v_revision.patch);
  end if;
  delete from public.dealer_network_troubleshooting_revisions where id = p_revision_id;
end;
$$;

revoke all on function dealer_network_private.dealer_network_normalize_troubleshooting_patch(jsonb),
  dealer_network_private.dealer_network_apply_troubleshooting_text(uuid, jsonb),
  public.dealer_network_update_troubleshooting_text(uuid, uuid, jsonb),
  public.dealer_network_append_troubleshooting_update(uuid, uuid, text),
  public.dealer_network_add_troubleshooting_comment(uuid, uuid, text),
  public.dealer_network_review_troubleshooting_revision(uuid, uuid, boolean)
  from public, anon, authenticated, service_role;
grant execute on function dealer_network_private.dealer_network_normalize_troubleshooting_patch(jsonb),
  dealer_network_private.dealer_network_apply_troubleshooting_text(uuid, jsonb),
  public.dealer_network_update_troubleshooting_text(uuid, uuid, jsonb),
  public.dealer_network_append_troubleshooting_update(uuid, uuid, text),
  public.dealer_network_add_troubleshooting_comment(uuid, uuid, text),
  public.dealer_network_review_troubleshooting_revision(uuid, uuid, boolean)
  to service_role;
