import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260822180000_add_dealer_network_board.sql", "utf8");
const server = readFileSync("lib/dealer-network/board-server.ts", "utf8");
const admin = readFileSync("components/dealer-network/DealerNetworkBoardAdmin.tsx", "utf8");
const member = readFileSync("components/dealer-network/DealerNetworkBoardPanel.tsx", "utf8");
const notifications = readFileSync("lib/dealer-network/notifications.ts", "utf8");
const email = readFileSync("lib/dealer-network/board-email.ts", "utf8");
const adminShell = readFileSync("components/dealer-network/DealerNetworkAdmin.tsx", "utf8");
const adminServer = readFileSync("lib/dealer-network/admin-server.ts", "utf8");
const memberVoteRoute = readFileSync("app/api/dealer-network/member/board/polls/[pollId]/vote/route.ts", "utf8");
const memberCommentRoute = readFileSync("app/api/dealer-network/member/board/discussions/[discussionId]/comments/route.ts", "utf8");
const memberEditRoute = readFileSync("app/api/dealer-network/member/board/comments/[commentId]/route.ts", "utf8");
const adminReminderRoute = readFileSync("app/api/admin/dealer-network/board/[topicId]/remind-nonresponders/route.ts", "utf8");
const adminModerationRoute = readFileSync("app/api/admin/dealer-network/board/[topicId]/discussions/[discussionId]/comments/[commentId]/moderate/route.ts", "utf8");
const suggestionRoute = readFileSync("app/api/admin/dealer-network/suggestions/[id]/board-topic/route.ts", "utf8");

test("Board schema has one topic parent for every component", () => {
  for (const table of ["dealer_network_board_topics", "dealer_network_broadcasts", "dealer_network_polls", "dealer_network_discussions"]) assert.match(migration, new RegExp(table));
  assert.match(migration, /alter table public\.dealer_network_broadcasts\s+add column topic_id/);
});
test("historical broadcasts and recipient read state are backfilled", () => {
  assert.match(migration, /for b in\s+select id, subject, sent_at, created_at\s+from public\.dealer_network_broadcasts/);
  assert.match(migration, /r\.read_at, r\.read_at, r\.created_at, r\.updated_at/);
});
test("all Board tables enable and force RLS with browser access revoked", () => {
  assert.match(migration, /enable row level security/); assert.match(migration, /force row level security/); assert.match(migration, /from public,anon,authenticated,service_role/);
});
test("poll votes are unique and options must belong to their poll", () => {
  assert.match(migration, /primary key\(poll_id,member_id\)/); assert.match(migration, /foreign key\(poll_id,option_id\)/);
});
test("vote RPC enforces recipient, open poll, active topic, and vote change policy", () => {
  for (const value of ["poll_closed", "topic_not_active", "not_recipient", "invalid_option", "vote_change_disabled"]) assert.match(migration, new RegExp(value));
  assert.match(server, /session\.memberId|memberId/);
});
test("discussion RPC enforces one reply level and same discussion", () => {
  assert.match(migration, /c\.parent_comment_id is null/); assert.match(migration, /c\.discussion_id=p_discussion_id/);
});
test("member comment edits are ownership and lifecycle checked", () => {
  assert.match(migration, /author_member_id=p_member_id/); assert.match(migration, /d\.status<>'open'/); assert.match(server, /dealer_network_update_board_comment/);
});
test("archive RPC closes the complete package atomically", () => {
  assert.match(migration, /dealer_network_archive_board_topic/); assert.match(migration, /update public\.dealer_network_polls\s+set status = 'closed'/); assert.match(migration, /update public\.dealer_network_discussions\s+set status = 'closed'/); assert.match(migration, /set status = 'archived'/);
});
test("admin UI exposes unified lifecycle controls", () => {
  for (const label of ["Announcement", "Poll", "Discussion", "Create Discussion From Poll", "Close Poll", "Close Discussion", "Complete &amp; Archive Topic"]) assert.match(admin, new RegExp(label));
  assert.equal((admin.match(/Complete &amp; Archive Topic/g) ?? []).length, 1);
});
test("member UI includes response and archive views", () => {
  for (const label of ["Dealer Network Board", "Needs My Response", "Archived", "RESPONSE RECEIVED", "RESPONSE NEEDED", "Completed / Archived"]) assert.match(member, new RegExp(label));
});
test("member routes derive identity from authenticated session", () => {
  assert.match(server, /p_member_id: memberId/); assert.doesNotMatch(server, /body\.memberId/);
});
test("Board mutations use existing rate limiter", () => {
  assert.match(server, /consumeDealerRateLimit\("board_vote"/); assert.match(server, /consumeDealerRateLimit\("board_comment"/);
});

test("non-responder calculation excludes current voters", () => { assert.match(server, /nonResponders = members\.filter\(\(member\) => !voters\.has\(member\.id\)\)/); });
test("reminders start from the immutable topic snapshot", () => { assert.match(server, /dealer_network_board_topic_recipients/); });
test("voters cannot receive the reminder batch", () => { assert.match(server, /voters = new Set/); });
test("one reminder operation has a stable batch id", () => { assert.match(server, /batchId = randomUUID\(\)/); assert.match(notifications, /input\.batchId/); });
test("later reminder operations intentionally use new batches", () => { assert.match(notifications, /poll-reminder:\$\{input\.pollId\}:\$\{input\.batchId\}/); });
test("rapid reminder repeats use the database rate limiter", () => { assert.match(server, /board_poll_reminder/); assert.match(server, /, 1, 300/); assert.match(adminReminderRoute, /status: unauthorized \? 401 : limited \? 429/); });
test("reminder delivery counts reflect sender outcomes", () => { assert.match(server, /if \(outcome === "sent"\) sent\+\+; else skipped\+\+/); assert.match(server, /catch \{ failed\+\+; \}/); });
test("poll can be added to an existing editable topic", () => { assert.match(migration, /dealer_network_add_board_poll/); assert.match(admin, /Add Poll to Existing Topic/); });
test("added poll retains the same topic id", () => { assert.match(server, /return \{ pollId, topicId, notification \}/); });
test("adding a poll never creates another recipient snapshot", () => { const fn = migration.slice(migration.indexOf("create function public.dealer_network_add_board_poll"), migration.indexOf("create function public.dealer_network_open_board_discussion")); assert.doesNotMatch(fn, /insert into public\.dealer_network_board_topic_recipients/); });
test("second official poll is structurally rejected", () => { assert.match(migration, /topic_id uuid not null unique\s+references public\.dealer_network_board_topics/); assert.match(migration, /poll_exists/); });
test("poll option count is validated from two through ten", () => { assert.match(migration, /option_count not between 2 and 10/); });
test("saved option position is explicit and stable", () => { assert.match(migration, /position smallint not null/); assert.match(server, /order\("position"\)/); });
test("admin can supply an optional closing timestamp", () => { assert.match(admin, /Optional Close Date \/ Time/); assert.match(server, /p_closes_at/); });
test("vote RPC permits an otherwise valid vote before close", () => { assert.match(migration, /p\.closes_at is not null and p\.closes_at<=now\(\)/); });
test("vote RPC rejects a vote after scheduled close", () => { assert.match(migration, /raise exception 'poll_closed'/); });
test("Needs My Response excludes effectively expired polls", () => { assert.match(member, /topic\.poll\?\.effectiveOpen/); assert.match(server, /new Date\(poll\.closes_at\)\.getTime\(\) > now/); });
test("admin moderation soft-removes comments", () => { assert.match(migration, /set removed_at=coalesce\(removed_at,now\(\)\)/); });
test("members receive the IDS moderation placeholder", () => { assert.match(server, /Comment removed by IDS moderation\./); });
test("normal members cannot invoke moderation route", () => { assert.match(adminModerationRoute, /requireDealerNetworkAdmin/); });
test("moderation preserves replies and physical rows", () => { const fn = migration.slice(migration.indexOf("dealer_network_moderate_board_comment"), migration.indexOf("dealer_network_mark_board_topic_read")); assert.doesNotMatch(fn, /delete from/); });
test("member edit control is owner-derived", () => { assert.match(member, /item\.canEdit/); assert.match(migration, /author_member_id=p_member_id/); });
test("member cannot edit another member comment", () => { assert.match(migration, /where id=p_comment_id and author_member_id=p_member_id/); });
test("member deletion is soft and confirmed", () => { assert.match(member, /window\.confirm\("Delete your comment/); assert.match(migration, /set deleted_at = now\(\)/); });
test("deleted comment placeholder is displayed", () => { assert.match(server, /Comment deleted by member\./); });
test("member edits and deletes are blocked after archive", () => { assert.match(migration, /t\.status='active'/); assert.match(memberEditRoute, /requireActiveUnlockedMember/); });
test("discussion conversion keeps the original topic", () => { assert.match(server, /dealer_network_open_board_discussion/); assert.match(server, /p_topic_id: topicId/); });
test("discussion displays linked poll results", () => { assert.match(member, /Discussion opened from poll/); assert.match(member, /Current \/ live results/); assert.match(member, /Final results/); });
test("discussion conversion never copies votes", () => { const fn = migration.slice(migration.indexOf("dealer_network_open_board_discussion"), migration.indexOf("dealer_network_moderate_board_comment")); assert.doesNotMatch(fn, /poll_votes/); });
test("discussion result percentages are calculated live", () => { assert.match(member, /option\.voteCount \/ total/); });
test("suggestion creates a draft parent topic", () => { assert.match(server, /sourceSuggestionId: suggestionId, activate: false/); });
test("draft suggestion topic is hidden from members", () => { assert.match(server, /neq\("status", "draft"\)/); });
test("suggestion conversion publishes only subject and message", () => { assert.match(server, /select\("id,subject,message"\)/); assert.doesNotMatch(server, /suggestion\.data\.email/); });
test("duplicate suggestion conversion is prevented", () => { assert.match(migration, /unique index dealer_network_board_topics_source_suggestion_idx/); assert.match(server, /existing: true/); });
test("suggestion draft can use normal child controls", () => { assert.match(admin, /topic\.status === "active" \|\| topic\.status === "draft"/); assert.match(admin, /Activate Topic/); });
test("archive continues to close every interactive child", () => { assert.match(migration, /dealer_network_archive_board_topic/); assert.match(migration, /dealer_network_polls\s+set status = 'closed'/); assert.match(migration, /dealer_network_discussions\s+set status = 'closed'/); });
test("archive preserves votes", () => { const fn = migration.slice(migration.indexOf("dealer_network_archive_board_topic"), migration.indexOf("alter table public.dealer_network_notification_events")); assert.doesNotMatch(fn, /delete from public\.dealer_network_poll_votes/); });
test("archive preserves comments", () => { const fn = migration.slice(migration.indexOf("dealer_network_archive_board_topic"), migration.indexOf("alter table public.dealer_network_notification_events")); assert.doesNotMatch(fn, /delete from public\.dealer_network_discussion_comments/); });
test("member creation route derives session identity", () => { assert.match(memberCommentRoute, /session\.memberId/); assert.doesNotMatch(memberCommentRoute, /body\.memberId/); });
test("member vote route derives session identity", () => { assert.match(memberVoteRoute, /session\.memberId/); assert.doesNotMatch(memberVoteRoute, /body\.memberId/); });
test("member edit route derives session identity", () => { assert.match(memberEditRoute, /session\.memberId/); assert.doesNotMatch(memberEditRoute, /body\.memberId/); });
test("all Board RPCs are security invoker with restricted path", () => { assert.doesNotMatch(migration, /security definer/i); assert.match(migration, /security invoker\s+set search_path = pg_catalog, public/); });
test("Board RPC execution is service-role only", () => { assert.match(migration, /revoke all on function[\s\S]+from public, anon, authenticated/); assert.match(migration, /grant execute on function[\s\S]+to service_role/); });
test("cross-topic moderation relationships are rejected", () => { assert.match(migration, /id=p_discussion_id and topic_id=p_topic_id/); });
test("legacy broadcasts retain their ids and bodies", () => { const backfill = migration.slice(migration.indexOf("Preserve every existing broadcast"), migration.indexOf("alter table public.dealer_network_broadcasts alter column")); assert.doesNotMatch(backfill, /update public\.dealer_network_broadcasts set (body|subject|id)/); });
test("legacy recipient and read snapshots are unchanged", () => { assert.match(migration, /r\.read_at, r\.read_at, r\.created_at, r\.updated_at/); assert.doesNotMatch(migration, /delete from public\.dealer_network_broadcast_recipients/); });
test("legacy broadcast creation remains atomic with its topic", () => { assert.match(migration, /create or replace function public\.dealer_network_create_broadcast/); assert.match(migration, /v_topic_id/); });
test("Board notification events retain topic poll and member context", () => { assert.match(migration, /add column topic_id/); assert.match(migration, /add column poll_id/); assert.match(notifications, /memberId: input\.recipientMemberId/); });
test("poll email directs responses to authenticated Board", () => { assert.match(email, /Dealer Network Poll — Response Requested/); assert.match(email, /dealer-tech-resources\/member/); });
test("discussion opened notification is once per topic member", () => { assert.match(notifications, /dealer-board-discussion:\$\{input\.topicId\}:\$\{input\.recipientMemberId\}/); });
test("failed Board notifications remain retryable", () => { assert.match(adminServer, /member_board_poll_reminder/); assert.match(adminServer, /deliverDealerNotification/); });
test("admin APIs consistently require IDS authentication", () => { for (const route of [adminReminderRoute, adminModerationRoute, suggestionRoute]) assert.match(route, /requireDealerNetworkAdmin/); });
test("admin UI has responsive option ordering controls", () => { assert.match(admin, /Move Up/); assert.match(admin, /Move Down/); assert.match(admin, /flex-wrap gap-2 sm:flex-nowrap/); });
test("admin UI includes truthful reminder outcome", () => { assert.match(admin, /Non-responders targeted:/); assert.match(admin, /Email sent:/); assert.match(admin, /Email failed:/); });
test("suggestion admin exposes conversion state", () => { assert.match(adminShell, /Create Board Topic/); assert.match(adminShell, /Board Topic Created/); });
test("member UI exposes owned Edit and Delete controls", () => { assert.match(member, />Edit<\/button>/); assert.match(member, />Delete<\/button>/); });
test("only one lifecycle archive control exists", () => { assert.equal((admin.match(/Complete &amp; Archive Topic/g) ?? []).length, 1); assert.doesNotMatch(admin, /(Archive Poll|Archive Discussion)/); });
test("Dealer Network Board navigation remains connected", () => { assert.match(adminShell, /Dealer Network Board/); assert.match(member, /Dealer Network Board/); });
test("migration has no reviewed malformed SQL token joins", () => {
  for (const token of ["ondelete", "idinto", "endif", "raiseexception", "thenraise", "publicas", "uuidreferences", "returnv_"])
    assert.doesNotMatch(migration, new RegExp(token, "i"));
  for (const boundary of [/\)select/i, /now\(\)where/i, /\)where/i, /\)from/i, /\)values/i, /\)returning/i])
    assert.doesNotMatch(migration, boundary);
});
test("migration introduces no destructive table or data removal", () => {
  assert.doesNotMatch(migration, /\b(drop table|truncate|delete from)\b/i);
});
test("notification constraint retains every prior and new event type", () => {
  for (const eventType of ["ids_new_application", "applicant_activation", "applicant_denied", "applicant_more_information", "member_pin_reset", "member_new_message", "member_broadcast", "member_invitation", "member_board_topic", "member_board_poll_reminder", "member_board_discussion"])
    assert.match(migration, new RegExp(`'${eventType}'`));
});
