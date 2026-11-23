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

insert into public.dealer_network_board_topics(id,title,status) values
('40000000-0000-4000-8000-000000000001','Current topic','active');
insert into public.dealer_network_discussions(id,topic_id,context) values
('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','Old context');
insert into public.dealer_network_board_topic_recipients(topic_id,member_id)
select '40000000-0000-4000-8000-000000000001',id from public.dealer_network_members
where id::text like '20000000-0000-4000-8000-00000000000%';
insert into public.dealer_network_broadcasts(id,topic_id,subject,body,recipient_count) values
('60000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','Sent subject','Old body',7);
insert into public.dealer_network_discussion_comments(id,discussion_id,author_member_id,body,created_at,updated_at) values
('70000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',
'20000000-0000-4000-8000-000000000001',repeat('x',700),'2025-01-01','2025-01-01');

do $$
begin
 if has_function_privilege('anon','public.dealer_network_add_board_comment(uuid,uuid,text,uuid,uuid[])','execute')
  or has_table_privilege('authenticated','public.dealer_network_board_comment_uploads','select')
  or has_table_privilege('anon','public.dealer_network_board_comment_attachments','select')
  or exists(select 1 from storage.buckets where id='dealer-network-board-private' and public)
  or to_regprocedure('public.dealer_network_add_board_comment(uuid,uuid,text,uuid)') is not null
 then raise exception 'private media or old overload exposed'; end if;
end $$;
set local role service_role;
do $$
declare
 m constant uuid := '20000000-0000-4000-8000-000000000001';
 other constant uuid := '20000000-0000-4000-8000-000000000002';
 locked constant uuid := '20000000-0000-4000-8000-000000000003';
 t constant uuid := '40000000-0000-4000-8000-000000000001';
 d constant uuid := '50000000-0000-4000-8000-000000000001';
 legacy constant uuid := '70000000-0000-4000-8000-000000000001';
 upload constant uuid := '80000000-0000-4000-8000-000000000001';
 top uuid;
 first_reply uuid;
 empty_top uuid;
begin
 if not exists(select 1 from public.dealer_network_discussion_comments where id=legacy and char_length(body)=700
   and edited_at is null and created_at='2025-01-01' and updated_at='2025-01-01')
 then raise exception 'legacy row changed'; end if;
 perform public.dealer_network_update_board_topic(t,' New title ',' Updated body ',' Updated context ');
 if not exists(select 1 from public.dealer_network_board_topics where id=t and title='New title')
  or not exists(select 1 from public.dealer_network_broadcasts where topic_id=t and subject='Sent subject' and body='Updated body' and recipient_count=7)
  or not exists(select 1 from public.dealer_network_discussions where id=d and context='Updated context')
  or (select count(*) from public.dealer_network_board_topic_recipients where topic_id=t) <> 3
 then raise exception 'topic edit changed snapshot or missed live content'; end if;
 begin perform public.dealer_network_add_board_comment(d,locked,'Not allowed',null); raise exception 'locked member inserted';
 exception when raise_exception then if sqlerrm<>'not_recipient' then raise; end if; end;
 begin perform public.dealer_network_add_board_comment(d,m,repeat('😀',201),null); raise exception 'top exceeds limit';
 exception when raise_exception then if sqlerrm<>'invalid_comment' then raise; end if; end;

 insert into public.dealer_network_board_comment_uploads(id,owner_member_id,discussion_id,storage_path,declared_content_type,
  declared_byte_size,status,verified_path,width,height,expires_at)
 values(upload,m,d,'staging/'||m||'/'||d||'/'||upload,'image/jpeg',500,'ready','verified/'||m||'/'||d||'/'||upload||'.jpg',96,96,now()+interval '1h');
 begin perform public.dealer_network_add_board_comment(d,other,'Wrong owner',null,array[upload]); raise exception 'wrong owner ticket attached';
 exception when raise_exception then if sqlerrm<>'invalid_uploads' then raise; end if; end;
 begin perform public.dealer_network_add_board_comment(d,m,'Duplicate',null,array[upload,upload]); raise exception 'duplicate ticket accepted';
 exception when raise_exception then if sqlerrm<>'invalid_uploads' then raise; end if; end;
 top := public.dealer_network_add_board_comment(d,m,repeat('😀',200),null,array[upload]);
 begin perform public.dealer_network_add_board_comment(d,m,'Consumed',null,array[upload]); raise exception 'consumed ticket accepted';
 exception when raise_exception then if sqlerrm<>'invalid_uploads' then raise; end if; end;
 perform public.dealer_network_update_board_comment(top,m,'Updated comment',false);
 if not exists(select 1 from public.dealer_network_board_comment_uploads where id=upload and status='consumed')
  or not exists(select 1 from public.dealer_network_board_comment_attachments where comment_id=top and width=96 and position=0)
 then raise exception 'attachment binding lost'; end if;
 begin perform public.dealer_network_update_board_comment(top,other,'Intruder',false); raise exception 'nonowner edited';
 exception when raise_exception then if sqlerrm<>'comment_unavailable' then raise; end if; end;

 begin perform public.dealer_network_add_board_comment(d,m,repeat('😀',151),top); raise exception 'reply too long';
 exception when raise_exception then if sqlerrm<>'invalid_comment' then raise; end if; end;
 first_reply := public.dealer_network_add_board_comment(d,other,repeat('😀',150),top);
 for i in 2..5 loop perform public.dealer_network_add_board_comment(d,m,'Reply '||i,top); end loop;
 begin perform public.dealer_network_add_board_comment(d,m,'Nested',first_reply); raise exception 'deeper nesting accepted';
 exception when raise_exception then if sqlerrm<>'invalid_parent' then raise; end if; end;
 begin perform public.dealer_network_add_board_comment(d,m,'Sixth',top); raise exception 'sixth reply accepted';
 exception when raise_exception then if sqlerrm<>'reply_limit' then raise; end if; end;
 perform public.dealer_network_update_board_comment(first_reply,other,null,true);
 perform public.dealer_network_add_board_comment(d,m,'Restored slot',top);
 empty_top := public.dealer_network_add_board_comment(d,m,'Empty',null);
 for i in 1..2 loop perform public.dealer_network_add_board_comment(d,m,'Branch '||i,null); end loop;
 perform public.dealer_network_moderate_board_comment(t,d,top,'Remove original, keep replies');
 begin perform public.dealer_network_add_board_comment(d,m,'On removed parent',top); raise exception 'removed parent accepted reply';
 exception when raise_exception then if sqlerrm<>'invalid_parent' then raise; end if; end;
 begin perform public.dealer_network_add_board_comment(d,m,'Tombstone should count',null); raise exception 'removed branch with children did not count';
 exception when raise_exception then if sqlerrm<>'comment_limit' then raise; end if; end;
 perform public.dealer_network_update_board_comment(empty_top,m,null,true);
 perform public.dealer_network_add_board_comment(d,m,'Empty slot freed',null);
 for first_reply in select id from public.dealer_network_discussion_comments where parent_comment_id=top and deleted_at is null and removed_at is null
 loop perform public.dealer_network_moderate_board_comment(t,d,first_reply,'Targeted'); end loop;
 perform public.dealer_network_add_board_comment(d,m,'Last reply removed frees branch',null);
 perform public.dealer_network_archive_board_topic(t);
 perform public.dealer_network_moderate_board_comment(t,d,legacy,'Archived moderation');
 begin perform public.dealer_network_update_board_topic(t,'No change',null,null); raise exception 'archived topic editable';
 exception when raise_exception then if sqlerrm<>'topic_not_editable' then raise; end if; end;
 begin perform public.dealer_network_add_board_comment(d,m,'Closed',null); raise exception 'archived topic accepted comment';
 exception when raise_exception then if sqlerrm<>'discussion_closed' then raise; end if; end;
end $$;
rollback;
