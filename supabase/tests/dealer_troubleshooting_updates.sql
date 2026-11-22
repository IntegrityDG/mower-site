-- Run only against an isolated local database with the dealer migrations.
-- Uses synthetic rows, reverts itself, and never calls external services.
begin;
insert into public.dealer_network_applications (
  id, idempotency_key, request_fingerprint, applicant_name, company_name, normalized_company_name,
  phone, normalized_phone, email, normalized_email, address_line_1, city, state, zip_code,
  role, experience, service_region, introduction, business_type, consent_at
)
select
  ('10000000-0000-4000-8000-00000000000' || n)::uuid, gen_random_uuid(), repeat('x',64),
  'Fixture ' || n, 'Test Workshop', 'test workshop', '1555555010'||n, '1555555010'||n,
  'fixture'||n||'@example.invalid', 'fixture'||n||'@example.invalid', 'Test fixture', 'Fixture City',
  'MO', '63901', case n when 2 then 'repair_tech' else 'dealer' end, 'Synthetic', 'Synthetic', 'Synthetic',
  'robotic_mower_dealer', now()
from generate_series(1, 3) as fixture(n);

insert into public.dealer_network_members (
  id, application_id, member_name, company_name, normalized_company_name,
  phone, normalized_phone, email, normalized_email, address_line_1, city, state, zip_code,
  role, experience, service_region, introduction, status, activated_at, account_locked
)
select
  ('20000000-0000-4000-8000-00000000000' || n)::uuid, a.id, a.applicant_name, a.company_name,
  a.normalized_company_name, a.phone, a.normalized_phone, a.email, a.normalized_email, a.address_line_1,
  a.city, a.state, a.zip_code, a.role, a.experience, a.service_region, a.introduction, 'active', now(), n = 3
from generate_series(1, 3) as fixture(n)
join public.dealer_network_applications as a on a.id = ('10000000-0000-4000-8000-00000000000' || n)::uuid;

insert into public.dealer_network_troubleshooting_entries (
  id, member_id, member_name_snapshot, company_name_snapshot, title, brand, model,
  issue_date, firmware_software_version, system_area, issue_description, fix_description,
  status, approved_at, publicly_published
)
select
  ('30000000-0000-4000-8000-00000000000' || n)::uuid, '20000000-0000-4000-8000-000000000001',
  'Fixture 1', 'Test Workshop', 'Original fix', 'Synthetic brand', 'Synthetic model', '2020-01-01',
  'Version 1', 'Controls', 'Original issue', 'Original solution',
  case when n = 2 then 'pending' else 'approved' end,
  case when n <> 2 then now() end,
  n = 1
from generate_series(1, 3) as fixture(n);

do $$
declare
  table_name text;
  rpc text;
begin
  foreach table_name in array array['updates','comments','revisions'] loop
    if has_table_privilege('anon', 'public.dealer_network_troubleshooting_' || table_name, 'SELECT')
      or has_table_privilege('authenticated', 'public.dealer_network_troubleshooting_' || table_name, 'SELECT')
      or has_table_privilege('anon', 'public.dealer_network_troubleshooting_' || table_name, 'INSERT')
      or has_table_privilege('authenticated', 'public.dealer_network_troubleshooting_' || table_name, 'INSERT')
    then raise exception 'member activity accessible via public DB role'; end if;
  end loop;
  foreach rpc in array array[
    'update_troubleshooting_text(uuid,uuid,jsonb)',
    'append_troubleshooting_update(uuid,uuid,text)',
    'add_troubleshooting_comment(uuid,uuid,text)',
    'review_troubleshooting_revision(uuid,uuid,boolean)'
  ] loop
    if has_function_privilege('anon', 'public.dealer_network_' || rpc, 'EXECUTE')
      or has_function_privilege('authenticated', 'public.dealer_network_' || rpc, 'EXECUTE')
      or not has_function_privilege('service_role', 'public.dealer_network_' || rpc, 'EXECUTE')
    then raise exception 'wrong dealer RPC grants'; end if;
  end loop;
end;
$$;

set local role service_role;
do $$
declare
  owner_id constant uuid := '20000000-0000-4000-8000-000000000001';
  other_id constant uuid := '20000000-0000-4000-8000-000000000002';
  locked_id constant uuid := '20000000-0000-4000-8000-000000000003';
  published_id constant uuid := '30000000-0000-4000-8000-000000000001';
  pending_id constant uuid := '30000000-0000-4000-8000-000000000002';
  approved_private_id constant uuid := '30000000-0000-4000-8000-000000000003';
  p constant jsonb := '{"title":" Updated fix ","brand":"Synthetic brand","model":"Synthetic model","issue_date":"2020-01-01","firmware_software_version":"V2","system_area":"Controls","bad_part":null,"issue_description":"Updated issue","fix_description":"Updated solution"}';
  revision_id uuid;
  latest_id uuid;
  n integer;
begin
  begin
    perform public.dealer_network_update_troubleshooting_text(published_id, other_id, p);
    raise exception 'nonowner edit succeeded';
  exception when raise_exception then
    if sqlerrm <> 'troubleshooting_owner_required' then raise; end if;
  end;
  begin
    perform public.dealer_network_update_troubleshooting_text(published_id, owner_id, p || '{"publicly_published":true}');
    raise exception 'unexpected edit key accepted';
  exception when raise_exception then
    if sqlerrm <> 'troubleshooting_invalid_edit' then raise; end if;
  end;
  begin
    perform public.dealer_network_update_troubleshooting_text(published_id, owner_id, p || '{"issue_date":"2020-02-30"}');
    raise exception 'impossible date accepted';
  exception when raise_exception then
    if sqlerrm <> 'troubleshooting_invalid_edit' then raise; end if;
  end;
  if public.dealer_network_update_troubleshooting_text(pending_id, owner_id, p) <> 'saved' then
    raise exception 'pending original did not save';
  end if;
  if not exists (select 1 from public.dealer_network_troubleshooting_entries
      where id = pending_id and member_id = owner_id and status='pending' and title='Updated fix' and not publicly_published)
  then raise exception 'pending save altered original authorization or lost content'; end if;

  if public.dealer_network_update_troubleshooting_text(published_id, owner_id, p) <> 'pending_review'
    or public.dealer_network_update_troubleshooting_text(approved_private_id, owner_id, p) <> 'pending_review'
  then raise exception 'approved edits must stage'; end if;
  if not exists (select 1 from public.dealer_network_troubleshooting_entries
      where id = published_id and title = 'Original fix' and publicly_published)
  then raise exception 'published content changed while awaiting review'; end if;
  select id into strict revision_id from public.dealer_network_troubleshooting_revisions where entry_id = published_id;
  perform public.dealer_network_update_troubleshooting_text(published_id, owner_id, p || '{"title":"Latest proposal"}');
  select id into strict latest_id from public.dealer_network_troubleshooting_revisions where entry_id = published_id;
  if latest_id = revision_id then raise exception 'replacement revision does not invalidate stale review'; end if;
  begin
    perform public.dealer_network_review_troubleshooting_revision(published_id, revision_id, true);
    raise exception 'stale revision accepted';
  exception when raise_exception then
    if sqlerrm <> 'troubleshooting_revision_unavailable' then raise; end if;
  end;
  perform public.dealer_network_review_troubleshooting_revision(published_id, latest_id, true);
  if not exists (select 1 from public.dealer_network_troubleshooting_entries
      where id = published_id and title = 'Latest proposal' and publicly_published and status='approved' and member_id=owner_id)
    or exists (select 1 from public.dealer_network_troubleshooting_revisions where entry_id = published_id)
  then raise exception 'approved revision failed to preserve publication'; end if;
  select id into strict revision_id from public.dealer_network_troubleshooting_revisions where entry_id = approved_private_id;
  perform public.dealer_network_review_troubleshooting_revision(approved_private_id, revision_id, false);
  if not exists (select 1 from public.dealer_network_troubleshooting_entries
      where id = approved_private_id and title = 'Original fix' and not publicly_published)
    or exists (select 1 from public.dealer_network_troubleshooting_revisions where entry_id = approved_private_id)
  then raise exception 'rejection changed content or left open proposal'; end if;

  begin
    perform public.dealer_network_append_troubleshooting_update(published_id, other_id, 'Notes');
    raise exception 'nonowner note accepted';
  exception when raise_exception then
    if sqlerrm <> 'troubleshooting_owner_required' then raise; end if;
  end;
  perform public.dealer_network_append_troubleshooting_update(published_id, owner_id, ' Notes ');
  if not exists (select 1 from public.dealer_network_troubleshooting_updates
      where entry_id=published_id and member_id=owner_id and body='Notes' and created_at is not null)
  then raise exception 'private note missing'; end if;

  begin
    perform public.dealer_network_add_troubleshooting_comment(published_id, owner_id, 'Diagnosis');
    raise exception 'owner comment accepted';
  exception when raise_exception then
    if sqlerrm <> 'troubleshooting_comment_requires_non_owner' then raise; end if;
  end;
  begin
    perform public.dealer_network_add_troubleshooting_comment(pending_id, other_id, 'Diagnosis');
    raise exception 'pending post comment accepted';
  exception when raise_exception then
    if sqlerrm <> 'troubleshooting_entry_unavailable' then raise; end if;
  end;
  begin
    perform public.dealer_network_add_troubleshooting_comment(published_id, locked_id, 'Diagnosis');
    raise exception 'locked member comment accepted';
  exception when raise_exception then
    if sqlerrm <> 'troubleshooting_member_unavailable' then raise; end if;
  end;
  begin
    perform public.dealer_network_add_troubleshooting_comment(published_id, other_id, repeat('😀',251));
    raise exception 'oversize Unicode comment accepted';
  exception when raise_exception then
    if sqlerrm <> 'troubleshooting_invalid_comment' then raise; end if;
  end;
  for n in 1..5 loop
    perform public.dealer_network_add_troubleshooting_comment(published_id, other_id, repeat('😀',250));
  end loop;
  begin
    perform public.dealer_network_add_troubleshooting_comment(published_id, other_id, 'Sixth comment');
    raise exception 'sixth comment accepted';
  exception when raise_exception then
    if sqlerrm <> 'troubleshooting_comment_limit' then raise; end if;
  end;
  if (select count(*) from public.dealer_network_troubleshooting_comments where entry_id=published_id and char_length(body)=250) <> 5
  then raise exception 'database comment cap or Unicode count wrong'; end if;
  begin
    insert into public.dealer_network_troubleshooting_comments (entry_id,member_id,body,member_name_snapshot,company_name_snapshot,slot)
    values (published_id,other_id,'Direct duplicate','Fixture 2','Test Workshop',5);
    raise exception 'slot constraint allowed duplicate';
  exception when unique_violation then null;
  end;
end;
$$;

reset role;
update public.dealer_network_members set deleted_at=now(), status='archived', account_locked=true,
  messaging_enabled=false, application_id=null
where id='20000000-0000-4000-8000-000000000002';
do $$
begin
  if (select count(*) from public.dealer_network_troubleshooting_comments
      where member_id='20000000-0000-4000-8000-000000000002'
        and member_name_snapshot='Deleted Member' and company_name_snapshot='Deleted Member') <> 5
  then raise exception 'comment identity was not scrubbed on member deletion'; end if;
end;
$$;
rollback;
