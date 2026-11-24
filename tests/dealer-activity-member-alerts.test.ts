import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { readMemberPortalSelection, memberPortalLocation } from "../lib/dealer-network/member-portal-location";
import { validateUuid } from "../lib/dealer-network/validation";
import * as links from "../lib/dealer-network/activity-alert-links";
import { loadInstallationModule } from "./helpers/installation-module";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [member, entry, activity, alert] = [1, 2, 3, 4].map(uuid);

test("provider and login round trips preserve exact allowlisted deep-link destinations", () => {
  for (const kind of ["troubleshooting_issue", "troubleshooting_comment", "troubleshooting_update", "board_comment", "board_reply"] as const) {
    const location = links.dealerActivityAlertLocation({ id: alert, kind, contextId: entry, sourceId: kind === "troubleshooting_issue" ? entry : activity });
    assert.ok(location);
    const params = Object.fromEntries(new URL(location, "https://example.invalid").searchParams);
    const selection = readMemberPortalSelection(params);
    const login = memberPortalLocation("login", selection);
    assert.ok(login.startsWith("/dealer-tech-resources/login?"));
    const relogin = readMemberPortalSelection(Object.fromEntries(new URL(login, "https://example.invalid").searchParams));
    assert.equal(memberPortalLocation("member", relogin), location);
  }
  assert.equal(memberPortalLocation("member", readMemberPortalSelection({ next: "https://attacker.invalid", troubleshootingEntry: [entry], boardTopic: "//attacker.invalid", activityAlert: alert })), "/dealer-tech-resources/member");
  assert.equal(readMemberPortalSelection({ boardTopic: entry, troubleshootingActivity: activity }).troubleshootingActivityId, null);
});

class MemberAccessError extends Error { constructor(public status: number) { super("Restricted"); } }

test("member bell ack authorizes first and binds the exact event to the session, context, and source", async () => {
  let allowed = false;
  const calls: unknown[][] = [];
  const { PATCH } = loadInstallationModule<{ PATCH: (request: Request) => Promise<Response> }>("app/api/dealer-network/member/notifications/route.ts", {
    "@/lib/dealer-network/member-auth": { MemberAccessError, requireActiveUnlockedMember: async () => {
      if (!allowed) throw new MemberAccessError(401);
      return { memberId: member };
    } },
    "@/lib/dealer-network/validation": { validateUuid },
    "@/lib/dealer-network/member-notifications-server": {
      markMemberActivityAlertRead: async (...args: unknown[]) => { calls.push(args); return 1; },
    },
  });
  const post = (body: object) => PATCH(new Request("https://example.invalid/notifications", { method: "PATCH", body: JSON.stringify(body) }));
  assert.equal((await post({ alertId: alert, contextId: entry })).status, 401);
  assert.deepEqual(calls, []);
  allowed = true;
  assert.equal((await post({ alertId: alert, contextId: entry, sourceId: { path: activity } })).status, 400);
  assert.deepEqual(calls, []);
  const response = await post({ memberId: uuid(5), alertId: alert, contextId: entry, sourceId: activity });
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), { marked: 1 });
  assert.deepEqual(calls, [[member, alert, entry, activity]]);
});

test("new bell items expose only generic labels and fixed IDs, with unlisted unread rows counted", async () => {
  const { readMemberNotifications } = loadInstallationModule<{
    readMemberNotifications: (id: string) => Promise<{ total: number; items: Record<string, unknown>[] }>;
  }>("lib/dealer-network/member-notifications-server.ts", {
    "@/lib/supabase": { getSupabaseServiceClient: () => ({
      from: () => ({ select: () => ({ eq: async () => ({ data: [] }) }) }),
      rpc: async (_name: string, args: { p_member_id: string }) => {
        assert.equal(args.p_member_id, member);
        return { data: [{ id: alert, kind: "troubleshooting_comment", source_id: activity, context_id: entry,
          created_at: "2026-11-24T00:00:00Z", unread_total: 6, body: "PRIVATE", author: "PRIVATE" }] };
      },
    }) },
    "./activity-alert-links": links,
    "./messaging-server": { listConversations: async () => ({ conversations: [] }) },
  });
  const result = await readMemberNotifications(member);
  assert.equal(result.total, 6);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].title, "New Troubleshooting comment");
  assert.equal(result.items[0].troubleshootingEntryId, entry);
  assert.equal(result.items[0].troubleshootingActivityId, activity);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE/);
});

test("exact troubleshooting target unavailable never returns any entry; valid target bypasses list search", async () => {
  let visible = false;
  const { GET } = loadInstallationModule<{
    GET: (request: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  }>("app/api/dealer-network/member/troubleshooting/[id]/route.ts", {
    "@/lib/dealer-network/member-auth": { MemberAccessError, requireActiveUnlockedMember: async () => ({ memberId: member }) },
    "@/lib/dealer-network/validation": { validateUuid },
    "@/lib/dealer-network/troubleshooting-server": { readMemberTroubleshootingEntry: async (id: string, actor: string) => {
      assert.equal(id, entry); assert.equal(actor, member); return visible ? { id, memberId: uuid(8) } : null;
    } },
    "@/lib/dealer-network/troubleshooting-activity-server": { addTroubleshootingActivity: async (_id: string, entries: unknown[]) => ({ entries, ownEntries: [] }) },
  });
  const get = () => GET(new Request("https://example.invalid/private"), { params: Promise.resolve({ id: entry }) });
  assert.equal((await get()).status, 404);
  visible = true;
  const response = await get();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).entry.id, entry);
  const server = readFileSync("lib/dealer-network/troubleshooting-server.ts", "utf8");
  const exact = server.split("export async function readMemberTroubleshootingEntry")[1].split("export async function")[0];
  assert.match(exact, /status\.eq\.approved,member_id\.eq/);
  assert.doesNotMatch(exact, /limit\(100\)|textSearch/);
});
