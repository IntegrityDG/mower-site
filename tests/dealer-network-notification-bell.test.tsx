import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const server = readFileSync("lib/dealer-network/member-notifications-server.ts", "utf8");
const route = readFileSync("app/api/dealer-network/member/notifications/route.ts", "utf8");
const readRoute = readFileSync("app/api/dealer-network/member/board/[topicId]/read/route.ts", "utf8");
const boardServer = readFileSync("lib/dealer-network/board-server.ts", "utf8");
const bell = readFileSync("components/dealer-network/DealerNetworkNotificationBell.tsx", "utf8");
const hook = readFileSync("components/dealer-network/useDealerNetworkNotifications.ts", "utf8");
const portal = readFileSync("components/dealer-network/MemberPortal.tsx", "utf8");
const board = readFileSync("components/dealer-network/DealerNetworkBoardPanel.tsx", "utf8");

const checks: Array<[string, string, RegExp]> = [
  ["API requires an active unlocked member", route, /requireActiveUnlockedMember/],
  ["API derives member identity from session", route, /session\.memberId/],
  ["API does not accept a member id", route, /readMemberNotifications\(session\.memberId\)/],
  ["API returns a generic server error", route, /Notifications are temporarily unavailable/],
  ["message state comes from conversation summaries", server, /listConversations\(memberId\)/],
  ["only unread conversations become rows", server, /unreadCount > 0/],
  ["message row retains its conversation target", server, /conversationId: conversation\.id/],
  ["message count uses the real unread count", server, /unreadCount: conversation\.unreadCount/],
  ["message preview is server derived", server, /conversation\.lastMessagePreview/],
  ["Board recipients are member scoped", server, /\.eq\("member_id", memberId\)/],
  ["Board topics are recipient scoped", server, /\.in\("id", topicIds\)/],
  ["draft and closed topics are excluded", server, /\.eq\("status", "active"\)/],
  ["polls are loaded by eligible topic", server, /dealer_network_polls/],
  ["discussions are loaded by eligible topic", server, /dealer_network_discussions/],
  ["votes are member scoped", server, /dealer_network_poll_votes/],
  ["scheduled poll close is honored", server, /new Date\(poll\.closes_at\)\.getTime\(\) > now/],
  ["closed polls do not require responses", server, /poll\.status === "open"/],
  ["existing voters are excluded", server, /!votedPolls\.has\(poll\.id\)/],
  ["poll attention has highest branch priority", server, /if \(pollNeedsResponse\)/],
  ["poll rows target the Board topic", server, /topicId: topic\.id/],
  ["discussion status must be open", server, /discussion\.status === "open"/],
  ["new discussion compares against last read", server, /recipient\.last_read_at \?\? recipient\.first_read_at/],
  ["discussion branch follows poll branch", server, /if \(discussionIsNew\)/],
  ["generic topic requires first-read absence", server, /if \(!recipient\.first_read_at\)/],
  ["one Board branch returns per topic", server, /topics\.flatMap/],
  ["attention items sort newest first", server, /right\.occurredAt/],
  ["total is aggregated on the server", server, /reduce\(\(total, item\) => total \+ item\.unreadCount/],
  ["message and Board groups run together", server, /Promise\.all/],
  ["Board listing no longer marks every topic read", boardServer, /export async function markMemberBoardTopicRead/],
  ["read helper validates topic ids", boardServer, /validateUuid\(topicId\)/],
  ["read helper invokes the existing atomic RPC", boardServer, /dealer_network_mark_board_topic_read/],
  ["read route requires member authentication", readRoute, /requireActiveUnlockedMember/],
  ["read route uses session identity", readRoute, /session\.memberId/],
  ["bell has an accessible unread label", bell, /Notifications, \$\{total\} unread/],
  ["bell exposes expanded state", bell, /aria-expanded/],
  ["panel is announced as a dialog", bell, /role="dialog"/],
  ["bell hides a zero badge", bell, /total !== null && total > 0/],
  ["large badge counts are bounded", bell, /99\+/],
  ["rows are keyboard-native buttons", bell, /type="button"/],
  ["Escape closes the panel", bell, /event\.key === "Escape"/],
  ["outside clicks close the panel", bell, /contains\(event\.target as Node\)/],
  ["mobile panel stays within the viewport", bell, /fixed inset-x-4/],
  ["failure preserves the last available summary", bell, /Showing the last available result/],
  ["an initial failure never invents a zero", bell, /count unavailable/],
  ["empty state is explicit", bell, /all caught up/],
  ["polling interval is approximately one minute", hook, /60_000/],
  ["polling skips hidden documents", hook, /!document\.hidden/],
  ["visibility resumes refresh", hook, /visibilitychange/],
  ["window focus resumes refresh", hook, /addEventListener\("focus"/],
  ["overlapping refreshes are prevented", hook, /inFlight\.current/],
  ["refresh failures do not invent a count", hook, /setUnavailable\(true\)/],
  ["portal places the bell in its authenticated header", portal, /DealerNetworkNotificationBell/],
  ["message rows navigate directly to a conversation", portal, /setOpenConversationId\(item\.conversationId\)/],
  ["Board rows navigate directly to a topic", portal, /setOpenBoardTopicId\(item\.topicId\)/],
  ["message navigation selects the messages tab", portal, /setTab\("messages"\)/],
  ["Board navigation selects the announcements tab", portal, /setTab\("announcements"\)/],
  ["Board direct opens use the read endpoint", board, /board\/\$\{topicId\}\/read/],
  ["vote completion refreshes bell attention", board, /Promise\.all\(\[load\(\), onAttentionChanged\(\)\]\)/],
];

for (const [name, source, pattern] of checks)
  test(name, () => assert.match(source, pattern));

test("Board reads occur only in the explicit read helper", () => {
  const listing = boardServer.slice(
    boardServer.indexOf("export async function readMemberBoard"),
    boardServer.indexOf("export async function markMemberBoardTopicRead"),
  );
  assert.doesNotMatch(listing, /dealer_network_mark_board_topic_read/);
});
