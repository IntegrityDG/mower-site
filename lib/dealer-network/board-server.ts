import "server-only";
import { randomUUID } from "node:crypto";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { consumeDealerRateLimit } from "./member-auth";
import { notifyBoardDiscussion, notifyBoardPollReminder, notifyBoardTopic } from "./notifications";
import { privateIdentifierHash } from "./security";
import { validateBoardPoll, validateBoardTopic, validateBoardTopicUpdate, validateCommentBody, validateNewBoardComment } from "./board-validation";
import { validateUuid } from "./validation";
import { verifyBoardUploads } from "./board-media-server";
import type { BoardMemberComment, BoardMemberTopic, BoardPhoto } from "./board-member";

const db = () => getSupabaseServiceClient();
type TopicResult = { topicId: string; pollId: string | null; recipientCount: number };
type NotifyMember = { id: string; member_name: string; email: string; status: string; account_locked: boolean; deleted_at: string | null };

async function notificationRecipients(topicId: string) {
  const client = db(), recipients = await client.from("dealer_network_board_topic_recipients").select("member_id").eq("topic_id", topicId);
  if (recipients.error) throw recipients.error; const ids = (recipients.data ?? []).map((row) => row.member_id); if (!ids.length) return [] as NotifyMember[];
  const members = await client.from("dealer_network_members").select("id,member_name,email,status,account_locked,deleted_at").in("id", ids).eq("status", "active").eq("account_locked", false).is("deleted_at", null);
  if (members.error) throw members.error; return (members.data ?? []) as NotifyMember[];
}
async function deliverToMembers<T extends NotifyMember>(members: T[], deliver: (member: T) => Promise<"sent" | "skipped">) {
  let sent = 0, failed = 0, skipped = 0, cursor = 0;
  async function worker() { while (cursor < members.length) { const member = members[cursor++]; try { const outcome = await deliver(member); if (outcome === "sent") sent++; else skipped++; } catch { failed++; } } }
  await Promise.all(Array.from({ length: Math.min(5, members.length) }, () => worker())); return { attempted: members.length, targeted: members.length, sent, failed, skipped };
}

export async function createBoardTopic(raw: unknown, origin: string) {
  const input = validateBoardTopic(raw); if (!input) throw new Error("INVALID_TOPIC");
  const result = await db().rpc("dealer_network_create_board_topic", { p_title: input.title, p_announcement_body: input.announcementBody, p_poll_question: input.poll?.question ?? null, p_poll_explanation: input.poll?.explanation ?? null, p_poll_options: input.poll?.options ?? [], p_allow_vote_change: input.poll?.allowVoteChange ?? false, p_closes_at: input.poll?.closesAt ?? null, p_discussion_context: input.discussionContext, p_source_suggestion_id: input.sourceSuggestionId, p_activate: input.activate });
  if (result.error || !result.data) throw result.error ?? new Error("TOPIC_CREATE_FAILED"); const created = result.data as TopicResult;
  let notification = { attempted: 0, targeted: 0, sent: 0, failed: 0, skipped: 0 };
  if (input.activate && (input.announcementBody || input.poll)) { const members = await notificationRecipients(created.topicId); notification = await deliverToMembers(members, (member) => notifyBoardTopic({ topicId: created.topicId, pollId: created.pollId, recipientMemberId: member.id, recipientName: member.member_name, recipientEmail: member.email, topicTitle: input.title, responseRequested: Boolean(input.poll), origin })); }
  return { ...created, notification };
}
export async function addPollToTopic(topicId: string, raw: unknown, origin: string) {
  const input = validateBoardPoll(raw); if (!validateUuid(topicId) || !input) throw new Error("INVALID_POLL");
  const result = await db().rpc("dealer_network_add_board_poll", { p_topic_id: topicId, p_question: input.question, p_explanation: input.explanation, p_options: input.options, p_allow_vote_change: input.allowVoteChange, p_closes_at: input.closesAt });
  if (result.error || !result.data) throw result.error ?? new Error("POLL_CREATE_FAILED"); const pollId = String(result.data);
  const topic = await db().from("dealer_network_board_topics").select("title").eq("id", topicId).single(); if (topic.error) throw topic.error;
  const members = await notificationRecipients(topicId), notification = await deliverToMembers(members, (member) => notifyBoardTopic({ topicId, pollId, recipientMemberId: member.id, recipientName: member.member_name, recipientEmail: member.email, topicTitle: topic.data.title, responseRequested: true, origin, eventKeyPrefix: `dealer-board-poll:${pollId}` }));
  return { pollId, topicId, notification };
}

async function loadParts(topicIds: string[]) {
  const client = db(); const [broadcasts, polls, discussions] = await Promise.all([client.from("dealer_network_broadcasts").select("id,topic_id,subject,body,recipient_count,sent_at").in("topic_id", topicIds), client.from("dealer_network_polls").select("id,topic_id,question,explanation,status,allow_vote_change,closes_at,closed_at").in("topic_id", topicIds), client.from("dealer_network_discussions").select("id,topic_id,context,status,closed_at").in("topic_id", topicIds)]);
  for (const result of [broadcasts, polls, discussions]) if (result.error) throw result.error; const pollIds = (polls.data ?? []).map((poll) => poll.id), discussionIds = (discussions.data ?? []).map((discussion) => discussion.id);
  const [options, votes, comments] = await Promise.all([pollIds.length ? client.from("dealer_network_poll_options").select("id,poll_id,label,position").in("poll_id", pollIds).order("position") : Promise.resolve({ data: [], error: null }), pollIds.length ? client.from("dealer_network_poll_votes").select("poll_id,option_id,member_id,created_at,updated_at").in("poll_id", pollIds) : Promise.resolve({ data: [], error: null }), discussionIds.length ? client.from("dealer_network_discussion_comments").select("id,discussion_id,parent_comment_id,author_member_id,body,edited_at,deleted_at,removed_at,removed_reason,created_at,updated_at").in("discussion_id", discussionIds).order("created_at") : Promise.resolve({ data: [], error: null })]);
  for (const result of [options, votes, comments]) if (result.error) throw result.error; return { broadcasts: broadcasts.data ?? [], polls: polls.data ?? [], discussions: discussions.data ?? [], options: options.data ?? [], votes: votes.data ?? [], comments: comments.data ?? [] };
}
type CommentRow = {
  id: string; parent_comment_id: string | null; author_member_id: string;
  body: string; created_at: string; edited_at: string | null; deleted_at: string | null; removed_at: string | null;
};
type BoardAuthorRow = { id: string; member_name: string; company_name: string; status: string; account_locked: boolean; deleted_at: string | null };

async function readBoardAttachments(commentIds: string[], admin: boolean) {
  const all = new Map<string, BoardPhoto[]>();
  const prefix = admin ? "/api/admin/dealer-network/board/photos/" : "/api/dealer-network/member/board/photos/";
  for (let i = 0; i < commentIds.length; i += 100) {
    const { data, error } = await db().from("dealer_network_board_comment_attachments")
      .select("id,comment_id,width,height").in("comment_id", commentIds.slice(i, i + 100)).order("position");
    if (error) throw error;
    for (const photo of data ?? []) {
      const item = { id: String(photo.id), url: `${prefix}${photo.id}`, width: Number(photo.width), height: Number(photo.height) };
      const group = all.get(photo.comment_id);
      if (group) group.push(item);
      else all.set(photo.comment_id, [item]);
    }
  }
  return all;
}

export function projectBoardMemberComment(comment: CommentRow, author: BoardAuthorRow | undefined, memberId: string, open: boolean, photos: BoardPhoto[]): BoardMemberComment {
  const hidden = Boolean(comment.deleted_at || comment.removed_at);
  return {
    id: comment.id,
    parentCommentId: comment.parent_comment_id,
    body: comment.deleted_at ? "Comment deleted by member." : comment.removed_at ? "Comment removed by IDS moderation." : comment.body,
    createdAt: comment.created_at,
    edited: !hidden && Boolean(comment.edited_at),
    hidden,
    canEdit: !hidden && open && comment.author_member_id === memberId,
    author: hidden || !author ? null : {
      firstName: author.deleted_at ? "Deleted member" : author.member_name.trim().split(/\s+/)[0],
      companyName: author.deleted_at ? "" : author.company_name,
      messageMemberId: !author.deleted_at && author.status === "active" && !author.account_locked && author.id !== memberId ? author.id : null,
    },
    attachments: hidden ? [] : photos,
  };
}

export async function readAdminBoard() {
  const client = db(), topics = await client.from("dealer_network_board_topics").select("id,title,status,source_suggestion_id,activated_at,closed_at,archived_at,created_at").order("created_at", { ascending: false }).limit(200); if (topics.error) throw topics.error;
  const ids = (topics.data ?? []).map((topic) => topic.id); if (!ids.length) return []; const [parts, recipients, members] = await Promise.all([loadParts(ids), client.from("dealer_network_board_topic_recipients").select("topic_id,member_id,first_read_at").in("topic_id", ids), client.from("dealer_network_members").select("id,member_name,company_name,email")]); if (recipients.error || members.error) throw recipients.error ?? members.error;
  const attachments = await readBoardAttachments(parts.comments.filter(c => !c.removed_at && !c.deleted_at).map(c => c.id), true);
  const memberMap = new Map((members.data ?? []).map((member) => [member.id, member])); return (topics.data ?? []).map((topic) => { const poll = parts.polls.find((item) => item.topic_id === topic.id) ?? null, discussion = parts.discussions.find((item) => item.topic_id === topic.id) ?? null, topicRecipients = (recipients.data ?? []).filter((item) => item.topic_id === topic.id), votes = parts.votes.filter((vote) => vote.poll_id === poll?.id);
    return { ...topic, announcement: parts.broadcasts.find((item) => item.topic_id === topic.id) ?? null, poll, discussion, recipients: topicRecipients.map((recipient) => ({ ...recipient, member: memberMap.get(recipient.member_id) })), options: parts.options.filter((option) => option.poll_id === poll?.id), votes, responsePercentage: topicRecipients.length ? Math.round(votes.length / topicRecipients.length * 1000) / 10 : 0, comments: parts.comments.filter((comment) => comment.discussion_id === discussion?.id).map((comment) => ({ ...comment, author: memberMap.get(comment.author_member_id), attachments: attachments.get(comment.id) ?? [] })) };
  });
}
export async function readMemberBoard(memberId: string): Promise<BoardMemberTopic[]> {
  const client = db();
  const recipientRows = await client.from("dealer_network_board_topic_recipients").select("topic_id,first_read_at,last_read_at").eq("member_id", memberId);
  if (recipientRows.error) throw recipientRows.error;
  const recipientMap = new Map((recipientRows.data ?? []).map(row => [row.topic_id, row]));
  const ids = [...recipientMap.keys()];
  if (!ids.length) return [];
  const topics = await client.from("dealer_network_board_topics").select("id,title,status")
    .in("id", ids).neq("status", "draft").order("created_at", { ascending: false });
  if (topics.error) throw topics.error;
  const actualIds = (topics.data ?? []).map(topic => topic.id);
  if (!actualIds.length) return [];
  const [parts, allRecipients] = await Promise.all([
    loadParts(actualIds),
    client.from("dealer_network_board_topic_recipients").select("topic_id").in("topic_id", actualIds),
  ]);
  if (allRecipients.error) throw allRecipients.error;
  const visibleComments = parts.comments.filter(comment => !comment.deleted_at && !comment.removed_at);
  const authorIds = [...new Set(visibleComments.map(comment => comment.author_member_id))];
  const [members, attachments] = await Promise.all([
    authorIds.length ? client.from("dealer_network_members").select("id,member_name,company_name,status,account_locked,deleted_at").in("id", authorIds) : Promise.resolve({ data: [], error: null }),
    readBoardAttachments(visibleComments.map(comment => comment.id), false),
  ]);
  if (members.error) throw members.error;
  const memberMap = new Map<string, BoardAuthorRow>((members.data ?? []).map(member => [member.id, member]));
  const now = Date.now();
  return (topics.data ?? []).flatMap(topic => {
    const { id, title, status } = topic;
    if (status !== "active" && status !== "closed" && status !== "archived") return [];
    const poll = parts.polls.find(item => item.topic_id === id);
    const discussion = parts.discussions.find(item => item.topic_id === id);
    const announcement = parts.broadcasts.find(item => item.topic_id === id);
    const pollOpen = poll?.status === "open" && (!poll.closes_at || new Date(poll.closes_at).getTime() > now) && status === "active";
    const votes = parts.votes.filter(vote => vote.poll_id === poll?.id);
    const open = discussion?.status === "open" && status === "active";
    return [{
      id, title, status, isRead: Boolean(recipientMap.get(id)?.first_read_at),
      announcement: announcement ? { body: announcement.body } : null,
      poll: poll ? { id: poll.id, question: poll.question, explanation: poll.explanation, closes_at: poll.closes_at, effectiveOpen: pollOpen, allow_vote_change: poll.allow_vote_change } : null,
      discussion: discussion ? { id: discussion.id, context: discussion.context, status: discussion.status === "open" ? "open" : "closed" } : null,
      options: parts.options.filter(option => option.poll_id === poll?.id).map(option => ({ id: option.id, label: option.label, voteCount: votes.filter(vote => vote.option_id === option.id).length })),
      myVoteOptionId: votes.find(vote => vote.member_id === memberId)?.option_id ?? null,
      responseCount: votes.length,
      recipientCount: (allRecipients.data ?? []).filter(row => row.topic_id === id).length,
      comments: parts.comments.filter(comment => comment.discussion_id === discussion?.id).map(comment =>
        projectBoardMemberComment(comment, memberMap.get(comment.author_member_id), memberId, open, attachments.get(comment.id) ?? [])),
    }];
  });
}

export async function markMemberBoardTopicRead(memberId: string, topicId: string) {
  if (!validateUuid(topicId)) throw new Error("TOPIC_UNAVAILABLE");
  const result = await db().rpc("dealer_network_mark_board_topic_read", {
    p_topic_id: topicId,
    p_member_id: memberId,
  });
  if (result.error) throw result.error;
  if (result.data !== true) throw new Error("TOPIC_UNAVAILABLE");
}

export async function voteOnPoll(memberId: string, pollId: string, optionId: string) { if (!validateUuid(pollId) || !validateUuid(optionId)) throw new Error("INVALID_VOTE"); if (!(await consumeDealerRateLimit("board_vote", privateIdentifierHash(memberId), 30, 300))) throw new Error("RATE_LIMIT"); const result = await db().rpc("dealer_network_cast_poll_vote", { p_poll_id: pollId, p_option_id: optionId, p_member_id: memberId }); if (result.error) throw result.error; }
export async function addBoardComment(memberId: string, discussionId: string, raw: unknown) {
  const input = validateNewBoardComment(raw);
  if (!input || !validateUuid(discussionId)) throw new Error("INVALID_COMMENT");
  if (!(await consumeDealerRateLimit("board_comment", privateIdentifierHash(memberId), 20, 300))) throw new Error("RATE_LIMIT");
  if (input.uploadIds.length) await verifyBoardUploads(memberId, discussionId, input.parent, input.uploadIds);
  const result = await db().rpc("dealer_network_add_board_comment", {
    p_discussion_id: discussionId, p_member_id: memberId, p_body: input.body,
    p_parent_id: input.parent, p_upload_ids: input.uploadIds,
  });
  if (result.error) throw result.error;
  return String(result.data);
}
export async function updateOwnComment(memberId: string, commentId: string, raw: unknown, remove = false) { if (!validateUuid(commentId)) throw new Error("INVALID_COMMENT"); const body = remove ? "" : validateCommentBody(raw); if (!remove && !body) throw new Error("INVALID_COMMENT"); const result = await db().rpc("dealer_network_update_board_comment", { p_comment_id: commentId, p_member_id: memberId, p_body: body, p_delete: remove }); if (result.error) throw result.error; }

export async function updateBoardTopicText(topicId: string, raw: unknown) {
  const input = validateBoardTopicUpdate(raw);
  if (!validateUuid(topicId) || !input) throw new Error("INVALID_TOPIC");
  const result = await db().rpc("dealer_network_update_board_topic", {
    p_topic_id: topicId, p_title: input.title, p_announcement_body: input.announcementBody,
    p_discussion_context: input.discussionContext,
  });
  if (result.error) throw result.error;
  return { ok: true };
}

export async function openTopicDiscussion(topicId: string, origin: string) { if (!validateUuid(topicId)) throw new Error("INVALID_TOPIC"); const client = db(), [topic, poll] = await Promise.all([client.from("dealer_network_board_topics").select("title,status").eq("id", topicId).single(), client.from("dealer_network_polls").select("id").eq("topic_id", topicId).maybeSingle()]); if (topic.error || poll.error) throw topic.error ?? poll.error; const context = poll.data ? "Discussion opened from poll. Linked results remain live and authoritative." : "Discussion opened for this Dealer Network topic."; const created = await client.rpc("dealer_network_open_board_discussion", { p_topic_id: topicId, p_context: context }); if (created.error) throw created.error; let notification = { attempted: 0, targeted: 0, sent: 0, failed: 0, skipped: 0 }; if (topic.data.status === "active") { const members = await notificationRecipients(topicId); notification = await deliverToMembers(members, (member) => notifyBoardDiscussion({ topicId, recipientMemberId: member.id, recipientName: member.member_name, recipientEmail: member.email, topicTitle: topic.data.title, origin })); } return { discussionId: String(created.data), topicId, notification }; }
export async function remindPollNonResponders(topicId: string, origin: string) { if (!validateUuid(topicId)) throw new Error("INVALID_TOPIC"); if (!(await consumeDealerRateLimit("board_poll_reminder", privateIdentifierHash(`admin:${topicId}`), 1, 300))) throw new Error("RATE_LIMIT"); const client = db(), topic = await client.from("dealer_network_board_topics").select("id,title,status").eq("id", topicId).single(); if (topic.error || topic.data.status !== "active") throw new Error("TOPIC_UNAVAILABLE"); const poll = await client.from("dealer_network_polls").select("id,question,status,closes_at").eq("topic_id", topicId).single(); if (poll.error || poll.data.status !== "open" || (poll.data.closes_at && new Date(poll.data.closes_at).getTime() <= Date.now())) throw new Error("POLL_CLOSED"); const [members, votes] = await Promise.all([notificationRecipients(topicId), client.from("dealer_network_poll_votes").select("member_id").eq("poll_id", poll.data.id)]); if (votes.error) throw votes.error; const voters = new Set((votes.data ?? []).map((vote) => vote.member_id)), nonResponders = members.filter((member) => !voters.has(member.id)), batchId = randomUUID(), delivery = await deliverToMembers(nonResponders, (member) => notifyBoardPollReminder({ batchId, topicId, pollId: poll.data.id, recipientMemberId: member.id, recipientName: member.member_name, recipientEmail: member.email, topicTitle: topic.data.title, pollQuestion: poll.data.question, origin })); return { batchId, responders: voters.size, nonResponders: nonResponders.length, ...delivery }; }
export async function moderateBoardComment(topicId: string, discussionId: string, commentId: string, reason: unknown) { if (!validateUuid(topicId) || !validateUuid(discussionId) || !validateUuid(commentId)) throw new Error("INVALID_COMMENT"); const cleanReason = typeof reason === "string" ? reason.trim().slice(0, 501) : ""; if (cleanReason.length > 500) throw new Error("INVALID_COMMENT"); const result = await db().rpc("dealer_network_moderate_board_comment", { p_topic_id: topicId, p_discussion_id: discussionId, p_comment_id: commentId, p_reason: cleanReason || null }); if (result.error) throw result.error; }
export async function createDraftTopicFromSuggestion(suggestionId: string) { if (!validateUuid(suggestionId)) throw new Error("INVALID_SUGGESTION"); const client = db(), existing = await client.from("dealer_network_board_topics").select("id").eq("source_suggestion_id", suggestionId).maybeSingle(); if (existing.error) throw existing.error; if (existing.data) return { topicId: existing.data.id, existing: true }; const suggestion = await client.from("dealer_network_suggestions").select("id,subject,message").eq("id", suggestionId).single(); if (suggestion.error) throw suggestion.error; const created = await createBoardTopic({ title: suggestion.data.subject, announcementBody: suggestion.data.message, sourceSuggestionId: suggestionId, activate: false }, ""); return { topicId: created.topicId, existing: false }; }
export async function adminTopicAction(topicId: string, action: string, origin: string) { if (!validateUuid(topicId)) throw new Error("INVALID_TOPIC"); const client = db(), now = new Date().toISOString(); if (action === "archive") { const result = await client.rpc("dealer_network_archive_board_topic", { p_topic_id: topicId }); if (result.error) throw result.error; return { ok: true }; } if (action === "activate") { const topic = await client.from("dealer_network_board_topics").select("title").eq("id", topicId).single(), poll = await client.from("dealer_network_polls").select("id").eq("topic_id", topicId).maybeSingle(), broadcast = await client.from("dealer_network_broadcasts").select("id").eq("topic_id", topicId).maybeSingle(); if (topic.error || poll.error || broadcast.error) throw topic.error ?? poll.error ?? broadcast.error; const activated = await client.rpc("dealer_network_activate_board_topic", { p_topic_id: topicId }); if (activated.error) throw activated.error; let notification = { attempted: 0, targeted: 0, sent: 0, failed: 0, skipped: 0 }; if (poll.data || broadcast.data) { const members = await notificationRecipients(topicId); notification = await deliverToMembers(members, (member) => notifyBoardTopic({ topicId, pollId: poll.data?.id, recipientMemberId: member.id, recipientName: member.member_name, recipientEmail: member.email, topicTitle: topic.data.title, responseRequested: Boolean(poll.data), origin })); } return { ok: true, recipientCount: Number(activated.data ?? 0), notification }; } if (action === "closePoll") { const result = await client.from("dealer_network_polls").update({ status: "closed", closed_at: now }).eq("topic_id", topicId).eq("status", "open"); if (result.error) throw result.error; return { ok: true }; } if (action === "closeDiscussion") { const result = await client.from("dealer_network_discussions").update({ status: "closed", closed_at: now }).eq("topic_id", topicId).eq("status", "open"); if (result.error) throw result.error; return { ok: true }; } if (action === "closeTopic") { const result = await client.from("dealer_network_board_topics").update({ status: "closed", closed_at: now }).eq("id", topicId).eq("status", "active"); if (result.error) throw result.error; return { ok: true }; } if (action === "startDiscussion") return openTopicDiscussion(topicId, origin); throw new Error("INVALID_ACTION"); }
