import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loadInstallationModule } from "./helpers/installation-module";

const source = readFileSync("components/dealer-network/DealerNetworkBoardAdmin.tsx", "utf8");
class DealerNetworkAdminError extends Error {}
const topicId = "00000000-0000-4000-8000-000000000013";

function adminRoute(authorized: boolean) {
  const calls: unknown[] = [];
  const { PATCH } = loadInstallationModule<{
    PATCH: (request: Request, context: { params: Promise<{ topicId: string }> }) => Promise<Response>;
  }>("app/api/admin/dealer-network/board/[topicId]/route.ts", {
    "@/lib/dealer-network/admin-auth": {
      DealerNetworkAdminError,
      requireDealerNetworkAdmin: async () => {
        if (!authorized) throw new DealerNetworkAdminError();
      },
    },
    "@/lib/dealer-network/board-server": {
      updateBoardTopicText: async (id: string, body: unknown) => calls.push(["edit", id, body]),
      adminTopicAction: async (id: string, action: unknown) => { calls.push(["other", id, action]); return { ok: true }; },
    },
    "@/lib/dealer-network/api": { dealerNetworkOrigin: () => "https://example.invalid" },
  });
  return { calls, send: (body: unknown) => PATCH(
    new Request("https://example.invalid/api/admin/board", { method: "PATCH", body: JSON.stringify(body) }),
    { params: Promise.resolve({ topicId }) },
  ) };
}

test("board topic edit needs Admin auth and dispatches only to the in-place text operation", async () => {
  const patch = { action: "updateTopic", title: "Updated title", announcementBody: "Updated announcement", discussionContext: "Updated context" };
  const unauthorized = adminRoute(false);
  assert.equal((await unauthorized.send(patch)).status, 401);
  assert.deepEqual(unauthorized.calls, []);
  const authorized = adminRoute(true);
  const response = await authorized.send(patch);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(authorized.calls, [["edit", topicId, patch]]);
  assert.equal((await authorized.send({ action: "archive" })).status, 200);
  assert.deepEqual(authorized.calls[1], ["other", topicId, "archive"]);
});

test("update form limits editing to draft and active topics and only offers fields for existing sections", () => {
  assert.match(source, /\(topic.status === "draft" \|\| topic.status === "active"\) && editTopicId === topic.id/);
  assert.match(source, /topic\.announcement && <label[\s\S]*?name="announcementBody"/);
  assert.match(source, /topic\.discussion && <label[\s\S]*?name="discussionContext"/);
  const submission = source.split('async function updateTopic(')[1].split('const shown')[0];
  assert.match(submission, /No notifications sent/);
  assert.doesNotMatch(submission, /poll|recipients|archive|sendEmail/);
});

test("individual archived discussion moderation stays available without showing removed attachments", () => {
  assert.match(source, /!comment\.deleted_at && !comment\.removed_at && <CommentAttachments attachments=\{comment\.attachments\}/);
  assert.match(source, /!comment\.deleted_at && !comment\.removed_at && <button[\s\S]*?void moderate\(/);
  assert.match(source, /comment\.parent_comment_id \? "Remove Reply" : "Remove Comment"/);
  assert.match(source, /comment\.removed_at && comment\.removed_reason/);
});
