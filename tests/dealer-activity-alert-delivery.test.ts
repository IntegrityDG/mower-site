import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ACTIVITY_ALERT_BATCH_LIMIT,
  buildActivityAlertEmail,
  deliverActivityAlertBatch,
  type ActivityAlertDelivery,
  type ActivityAlertEmail,
} from "../lib/dealer-network/activity-alert-delivery";
import { dealerActivityAlertLocation } from "../lib/dealer-network/activity-alert-links";

const alertId = "40000000-0000-4000-8000-000000000001";
const otherAlertId = "40000000-0000-4000-8000-000000000002";
const lease = "40000000-0000-4000-8000-000000000003";
const contextId = "40000000-0000-4000-8000-000000000004";
const sourceId = "40000000-0000-4000-8000-000000000005";
const otherLease = "40000000-0000-4000-8000-000000000006";
const fixture = (kind: ActivityAlertDelivery["kind"] = "board_reply"): ActivityAlertDelivery => ({
  id: alertId, kind, lease_token: lease, context_id: contextId,
  source_id: kind === "board_topic" || kind === "troubleshooting_issue" ? contextId : sourceId,
});

test("all activity types create fixed-origin auth-only links, never copy supplied private data, and use a per-recipient key", () => {
  for (const kind of ["board_topic", "board_comment", "board_reply", "troubleshooting_issue", "troubleshooting_comment", "troubleshooting_update"] as const) {
    const row = { ...fixture(kind), title: "private topic", text: "confidential notes", photos: ["hidden"] };
    const email = buildActivityAlertEmail(row, " synthetic-a@example.invalid ")!;
    assert.equal(email.to, "synthetic-a@example.invalid");
    assert.equal(email.idempotencyKey, `dealer-activity-alert/${row.id}`);
    assert.doesNotMatch(email.subject + email.text, /private topic|confidential notes|hidden|synthetic-a/);
    const url = new URL(email.text.split("\n").at(-1)!);
    assert.equal(url.origin, "https://integrityautomowers.com");
    assert.equal(url.pathname, "/dealer-tech-resources/member");
    if (kind.startsWith("board")) {
      assert.equal(url.searchParams.get("boardTopic"), contextId);
      assert.equal(url.searchParams.get("boardActivity"), kind === "board_topic" ? null : sourceId);
    } else {
      assert.equal(url.searchParams.get("troubleshootingEntry"), contextId);
      assert.equal(url.searchParams.get("troubleshootingActivity"), kind === "troubleshooting_issue" ? null : sourceId);
    }
    assert.equal(url.searchParams.get("activityAlert"), kind === "board_topic" ? null : row.id);
  }
  assert.equal(dealerActivityAlertLocation({ id: alertId, kind: "board_reply", contextId: "//evil.invalid", sourceId }), null);
  assert.equal(dealerActivityAlertLocation({ id: alertId, kind: "board_topic", contextId, sourceId }), null);
  assert.equal(buildActivityAlertEmail(fixture(), " "), null);
});

test("one withdrawn recipient is dropped without sending even after claim, while own-source recipients stay eligible", async () => {
  const finalized: [string, string][] = [], sent: ActivityAlertEmail[] = [];
  const out = await deliverActivityAlertBatch({
    claim: async (limit) => { assert.equal(limit, ACTIVITY_ALERT_BATCH_LIMIT); return [fixture(), { ...fixture(), id: otherAlertId }]; },
    recipient: async (alert) => alert.id === otherAlertId ? null : "author@example.invalid",
    send: async (mail) => { sent.push(mail); },
    finish: async (alert, result) => { finalized.push([alert.id, result]); return true; },
    pause: async () => {},
  });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "author@example.invalid");
  assert.deepEqual(out, { claimed: 2, sent: 1, retry: 0, discarded: 1, unsettled: 0 });
  assert.deepEqual(finalized.sort(), [[alertId, "sent"], [otherAlertId, "discarded"]]);
});

test("ambiguous provider acceptance reuses the identical immutable payload and idempotency key; lost finalization stays unsettled", async () => {
  const sent: ActivityAlertEmail[] = [];
  let failMode: "provider" | "ledger" | null = "provider";
  const run = (token: string) => deliverActivityAlertBatch({
    claim: async () => [{ ...fixture("troubleshooting_update"), lease_token: token }],
    recipient: async () => "synthetic-a@example.invalid",
    send: async (mail) => {
      sent.push(mail);
      if (failMode === "provider") throw Error("acceptance unknown");
    },
    finish: async (claim, result) => {
      assert.equal(claim.lease_token, token);
      if (failMode === "ledger") throw Error("unable to finish");
      assert.equal(result, failMode === "provider" ? "retry" : "sent");
      return true;
    },
  });
  assert.equal((await run(lease)).retry, 1);
  failMode = "ledger";
  assert.equal((await run(otherLease)).unsettled, 1);
  failMode = null;
  assert.equal((await run(lease)).sent, 1);
  assert.deepEqual(sent, [sent[0], sent[0], sent[0]]);
});

test("cron and topic publication remain isolated to the protected new dispatcher and do not duplicate old publication sender", () => {
  const file = (path: string) => readFileSync(path, "utf8");
  const board = file("lib/dealer-network/board-server.ts");
  const activation = board.slice(board.indexOf('if (action === "activate")'), board.indexOf('if (action === "closePoll")'));
  const create = board.slice(board.indexOf("export async function createBoardTopic"), board.indexOf("export async function addPollToTopic"));
  assert.match(create, /dealer_network_create_board_topic_with_alerts/);
  assert.match(activation, /dealer_network_activate_board_topic_with_alerts/);
  assert.doesNotMatch(create + activation, /notifyBoardTopic/);
  assert.match(board, /eventKeyPrefix: `dealer-board-poll:/);
  assert.match(file("lib/dealer-network/broadcast-server.ts"), /notifyDealerBroadcast\(/);
  const cron = file("app/api/cron/dealer-activity-alerts/route.ts");
  assert.match(cron, /provided.length !== expected.length \|\| !timingSafeEqual/);
  assert.match(cron, /Cache-Control.*private, no-store/);
  assert.match(cron, /export function HEAD\(/);
  assert.match(cron, /VERCEL_ENV !== "production"/);
  assert.match(file("vercel.json"), /dealer-activity-alerts/);
});
