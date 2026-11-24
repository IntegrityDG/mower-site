import "server-only";

import { getSupabaseServiceClient } from "@/lib/supabase";
import { listConversations } from "./messaging-server";
import type {
  MemberNotificationItem,
  MemberNotificationSummary,
} from "./types";

import { DEALER_ACTIVITY_ALERT_LABELS, isDealerActivityAlertKind, type DealerActivityAlertKind } from "./activity-alert-links";

type ActivityRow = {
  id: string;
  kind: DealerActivityAlertKind;
  source_id: string;
  context_id: string;
  created_at: string;
  unread_total: number;
};

async function readActivityAlerts(memberId: string) {
  const { data, error } = await getSupabaseServiceClient().rpc("dealer_network_read_activity_alerts", {
    p_member_id: memberId,
  });
  if (error) throw error;
  const rows = (data ?? []) as ActivityRow[];
  const items = rows.flatMap((row): MemberNotificationItem[] => {
    if (!isDealerActivityAlertKind(row.kind) || row.kind === "board_topic") return [];
    const board = row.kind === "board_comment" || row.kind === "board_reply";
    return [{
      id: `activity:${row.id}`,
      kind: row.kind,
      title: DEALER_ACTIVITY_ALERT_LABELS[row.kind],
      detail: board ? "Open the Board topic in the member portal." : "Open the troubleshooting issue in the member portal.",
      occurredAt: row.created_at,
      unreadCount: 1,
      conversationId: null,
      topicId: board ? row.context_id : null,
      activityAlertId: row.id,
      ...(board ? { boardActivityId: row.source_id } : {
        troubleshootingEntryId: row.context_id,
        ...(row.kind === "troubleshooting_issue" ? {} : { troubleshootingActivityId: row.source_id }),
      }),
    }];
  });
  return { items, total: Number(rows[0]?.unread_total ?? 0) };
}

export async function markMemberActivityAlertRead(memberId: string, alertId: string, contextId: string, sourceId: string | null) {
  const { data, error } = await getSupabaseServiceClient().rpc("dealer_network_mark_activity_alerts_read", {
    p_member_id: memberId, p_alert_ids: [alertId], p_context_id: contextId, p_source_id: sourceId,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

type RecipientRow = {
  topic_id: string;
  first_read_at: string | null;
  last_read_at: string | null;
};

export async function readMemberNotifications(
  memberId: string,
): Promise<MemberNotificationSummary> {
  const [communication, boardItems, activity] = await Promise.all([
    listConversations(memberId),
    readBoardNotifications(memberId),
    readActivityAlerts(memberId),
  ]);
  const messageItems: MemberNotificationItem[] = communication.conversations
    .filter((conversation) => conversation.unreadCount > 0)
    .map((conversation) => ({
      id: `message:${conversation.id}`,
      kind: "private_message",
      title: conversation.participant.displayName,
      detail: conversation.lastMessagePreview,
      occurredAt: conversation.lastMessageAt ?? new Date(0).toISOString(),
      unreadCount: conversation.unreadCount,
      conversationId: conversation.id,
      topicId: null,
    }));
  const items = [...messageItems, ...boardItems, ...activity.items].sort(
    (left, right) =>
      new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime(),
  );
  return {
    total: items.reduce((total, item) => total + item.unreadCount, 0) + Math.max(0, activity.total - activity.items.length),
    items,
  };
}

async function readBoardNotifications(
  memberId: string,
): Promise<MemberNotificationItem[]> {
  const client = getSupabaseServiceClient();
  const recipientResult = await client
    .from("dealer_network_board_topic_recipients")
    .select("topic_id,first_read_at,last_read_at")
    .eq("member_id", memberId);
  if (recipientResult.error) throw recipientResult.error;
  const recipients = (recipientResult.data ?? []) as RecipientRow[];
  const topicIds = recipients.map((row) => row.topic_id);
  if (!topicIds.length) return [];
  const [topicsResult, pollsResult, discussionsResult] = await Promise.all([
    client
      .from("dealer_network_board_topics")
      .select("id,title,activated_at,created_at")
      .in("id", topicIds)
      .eq("status", "active"),
    client
      .from("dealer_network_polls")
      .select("id,topic_id,question,status,closes_at,created_at")
      .in("topic_id", topicIds),
    client
      .from("dealer_network_discussions")
      .select("id,topic_id,context,status,created_at")
      .in("topic_id", topicIds),
  ]);
  for (const result of [topicsResult, pollsResult, discussionsResult])
    if (result.error) throw result.error;
  const topics = topicsResult.data ?? [];
  const activeIds = new Set(topics.map((topic) => topic.id));
  const polls = (pollsResult.data ?? []).filter((poll) => activeIds.has(poll.topic_id));
  const pollIds = polls.map((poll) => poll.id);
  const votesResult = pollIds.length
    ? await client
        .from("dealer_network_poll_votes")
        .select("poll_id")
        .eq("member_id", memberId)
        .in("poll_id", pollIds)
    : { data: [], error: null };
  if (votesResult.error) throw votesResult.error;
  const votedPolls = new Set((votesResult.data ?? []).map((vote) => vote.poll_id));
  const now = Date.now();

  return topics.flatMap((topic): MemberNotificationItem[] => {
    const recipient = recipients.find((row) => row.topic_id === topic.id);
    if (!recipient) return [];
    const poll = polls.find((row) => row.topic_id === topic.id);
    const discussion = (discussionsResult.data ?? []).find(
      (row) => row.topic_id === topic.id,
    );
    const pollNeedsResponse = Boolean(
      poll &&
        poll.status === "open" &&
        (!poll.closes_at || new Date(poll.closes_at).getTime() > now) &&
        !votedPolls.has(poll.id),
    );
    if (pollNeedsResponse)
      return [{
        id: `poll:${poll!.id}`,
        kind: "poll_response",
        title: topic.title,
        detail: `Response needed: ${poll!.question}`,
        occurredAt: poll!.created_at,
        unreadCount: 1,
        conversationId: null,
        topicId: topic.id,
      }];
    const readAt = recipient.last_read_at ?? recipient.first_read_at;
    const discussionIsNew = Boolean(
      discussion &&
        discussion.status === "open" &&
        (!readAt || new Date(discussion.created_at).getTime() > new Date(readAt).getTime()),
    );
    if (discussionIsNew)
      return [{
        id: `discussion:${discussion!.id}`,
        kind: "discussion",
        title: topic.title,
        detail: discussion!.context || "A discussion is open.",
        occurredAt: discussion!.created_at,
        unreadCount: 1,
        conversationId: null,
        topicId: topic.id,
      }];
    if (!recipient.first_read_at)
      return [{
        id: `topic:${topic.id}`,
        kind: "board_topic",
        title: topic.title,
        detail: "New Dealer Network Board topic",
        occurredAt: topic.activated_at ?? topic.created_at,
        unreadCount: 1,
        conversationId: null,
        topicId: topic.id,
      }];
    return [];
  });
}
