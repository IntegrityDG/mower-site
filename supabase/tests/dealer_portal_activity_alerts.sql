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

do $$
begin
  if has_function_privilege('anon','public.dealer_network_read_activity_alerts(uuid,integer)','execute')
     or has_function_privilege('authenticated','public.dealer_network_claim_activity_alert_deliveries(integer)','execute')
     or has_function_privilege('authenticated','public.dealer_network_create_board_topic_with_alerts(text,text,text,text,jsonb,boolean,timestamptz,text,uuid,boolean)','execute')
     or has_table_privilege('anon','dealer_network_private.activity_alerts','select') then
    raise exception 'activity exposed to an unauthorized role';
  end if;
end $$;

set local role service_role;
do $$
declare
  member1 constant uuid := '20000000-0000-4000-8000-000000000001';
  member2 constant uuid := '20000000-0000-4000-8000-000000000002';
  locked constant uuid := '20000000-0000-4000-8000-000000000003';
  issue constant uuid := '30000000-0000-4000-8000-000000000001';
  legacy jsonb;
  draft jsonb;
  active jsonb;
  top_id uuid;
  reply_id uuid;
  note_id uuid;
  lease record;
  a uuid;
begin
  legacy:=public.dealer_network_create_board_topic('Legacy full audience',null,null,null,null,false,null,'Discussion text',null,true);
  if (legacy->>'recipientCount')::int <> 2 then raise exception 'legacy audience fixture wrong'; end if;
  perform public.dealer_network_add_board_comment((legacy->>'discussionId')::uuid,member1,'Legacy comment',null);
  if exists(select 1 from dealer_network_private.activity_alerts) then raise exception 'legacy topic inferred from snapshot size'; end if;

  draft:=public.dealer_network_create_board_topic_with_alerts('Draft with discussion',null,null,null,null,false,null,'Discussion text',null,false);
  if exists(select 1 from dealer_network_private.activity_alerts) or exists(select 1 from dealer_network_private.activity_alert_all_member_topics)
    then raise exception 'draft published or marked early'; end if;
  if public.dealer_network_activate_board_topic_with_alerts((draft->>'topicId')::uuid) <> 2
    then raise exception 'wrapper changed recipient return value'; end if;
  if (select count(*) from dealer_network_private.activity_alerts where kind='board_topic') <> 2
    or exists(select 1 from public.dealer_network_read_activity_alerts(member1))
    then raise exception 'activation delivery missing or duplicate bell alert'; end if;

  active:=public.dealer_network_create_board_topic_with_alerts('Official Board topic',null,null,null,null,false,null,'Official discussion',null,true);
  top_id:=public.dealer_network_add_board_comment((active->>'discussionId')::uuid,member1,'New Board comment',null);
  reply_id:=public.dealer_network_add_board_comment((active->>'discussionId')::uuid,member2,'New Board reply',top_id);
  if (select count(*) from public.dealer_network_read_activity_alerts(member1)) <> 2
     or (select count(*) from public.dealer_network_read_activity_alerts(member2)) <> 2
     or exists(select 1 from public.dealer_network_read_activity_alerts(locked))
    then raise exception 'board actor/recipient intersection wrong'; end if;
  select id into a from public.dealer_network_read_activity_alerts(member1) where source_id=reply_id;
  if public.dealer_network_mark_activity_alerts_read(member2,array[a]) <> 0
     or public.dealer_network_mark_activity_alerts_read(member1,array[a],issue,reply_id) <> 0
     or public.dealer_network_mark_activity_alerts_read(member1,array[a],(active->>'topicId')::uuid,top_id) <> 0
     or public.dealer_network_mark_activity_alerts_read(member1,array[a],(active->>'topicId')::uuid,reply_id) <> 1
     or public.dealer_network_mark_activity_alerts_read(member1,array[a]) <> 0
    then raise exception 'unsafe or non-idempotent acknowledgement'; end if;
  perform public.dealer_network_update_board_comment(top_id,member1,'Edited, not new',false);
  if (select count(*) from dealer_network_private.activity_alerts where kind='board_comment') <> 2
    then raise exception 'board edit queued extra alert'; end if;

  insert into public.dealer_network_troubleshooting_entries(id,member_id,member_name_snapshot,company_name_snapshot,
    title,brand,model,issue_date,firmware_software_version,system_area,issue_description,fix_description)
      values(issue,member1,'Synthetic author','Synthetic company','Issue title','Brand','Model','2020-01-01','FW','Area','Original issue','Original fix');
  perform public.dealer_network_append_troubleshooting_update(issue,member1,'Pending owner note');
  if exists(select 1 from dealer_network_private.activity_alerts where context_id=issue)
    then raise exception 'pending troubleshooting activity broadcast'; end if;
  update public.dealer_network_troubleshooting_entries set status='approved',approved_at=now() where id=issue;
  perform public.dealer_network_add_troubleshooting_comment(issue,member2,'Approved-entry member comment');
  note_id:=public.dealer_network_append_troubleshooting_update(issue,member1,'Approved-entry owner note');
  if (select count(*) from dealer_network_private.activity_alerts where context_id=issue) <> 6
    or (select count(*) from dealer_network_private.activity_alerts where kind='troubleshooting_issue' and context_id=issue)<>2
    or (select count(*) from dealer_network_private.activity_alerts where kind='troubleshooting_comment' and context_id=issue)<>2
    or (select count(*) from dealer_network_private.activity_alerts where kind='troubleshooting_update' and source_id=note_id)<>2
    or not exists(select 1 from public.dealer_network_read_activity_alerts(member1,1) where unread_total = 4)
    then raise exception 'troubleshooting recipient or unread count wrong'; end if;

  select * into strict lease from public.dealer_network_claim_activity_alert_deliveries(100)
    where source_id=top_id and member_id=member1;
  if public.dealer_network_get_activity_alert_recipient(lease.id,lease.lease_token) <> 'fixture1@example.invalid'
    or public.dealer_network_finish_activity_alert_delivery(lease.id,gen_random_uuid(),true)
    or exists(select 1 from public.dealer_network_claim_activity_alert_deliveries(100))
    then raise exception 'lease did not prevent duplicate delivery or token misuse'; end if;
  perform public.dealer_network_moderate_board_comment((active->>'topicId')::uuid,(active->>'discussionId')::uuid,top_id,'Remove source');
  if public.dealer_network_get_activity_alert_recipient(lease.id,lease.lease_token) is not null
    or not public.dealer_network_finish_activity_alert_delivery(lease.id,lease.lease_token,false,true)
    or exists(select 1 from public.dealer_network_read_activity_alerts(member1) where source_id=top_id)
    or not exists(select 1 from public.dealer_network_read_activity_alerts(member2) where source_id=reply_id)
    then raise exception 'source moderation leaked or hid surviving reply'; end if;

  update public.dealer_network_troubleshooting_entries set status='denied',approved_at=null,denied_at=now() where id=issue;
  if exists(select 1 from public.dealer_network_read_activity_alerts(member1) where context_id=issue)
    then raise exception 'read leaked restricted issue'; end if;
  update public.dealer_network_troubleshooting_entries set status='approved',approved_at=now(),denied_at=null where id=issue;
  if (select count(*) from dealer_network_private.activity_alerts where context_id=issue)<>6
    then raise exception 'reapproval queued duplicate activity'; end if;
end $$;
rollback;
